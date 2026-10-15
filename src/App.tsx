import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Mic,
  ChevronDown,
  CircleAlert,
  Compass,
  Globe2,
  Leaf,
  RotateCcw,
  Settings2,
  Sprout,
  Zap,
} from 'lucide-react';
import { getCourse, languageNames } from './content/catalog';
import type { Course, Lesson } from './content/schema';
import { emptyProgress, type Action } from './engine';
import {
  readData,
  saveAction,
  saveSettings,
  startReview,
  revealReview,
  answerReview,
  saveSpeaking,
  rateReview,
  exportProgress,
  StaleProgressError,
  type AppData,
  type Settings,
  type ReviewSession,
} from './storage';
import { type Grade, type ReviewCard } from './review';
import { LocaleContext, en, es, useI18n } from './i18n';
import { AudioProvider } from './audio';
import { Brand } from './components/Artwork';
import { LessonScreen } from './components/LessonScreen';
import { Dashboard, CoursePicker, Phrasebook, Completion } from './components/CoursePages';
import { ReviewPage } from './components/ReviewPage';
import { UpdateNotice } from './components/UpdateNotice';
import { SpeakingPage } from './components/SpeakingPage';
import { SettingsPage } from './components/SettingsPage';
import { initializeAccount, notifyLocalChange, useAccount } from './sync/client';
import { ConversationPage } from './components/ConversationPage';
import { PlacementPage } from './components/PlacementPage';
import { AccountPage } from './components/AccountPage';
const routeFromHash = () => window.location.hash.slice(1) || 'learn';
function navigate(route: string) {
  window.location.hash = route;
  window.scrollTo(0, 0);
}
export default function App() {
  const [data, setData] = useState<AppData | null>(null),
    [route, setRoute] = useState(routeFromHash),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [now, setNow] = useState(() => new Date());
  const lock = useRef(false),
    t = data?.settings.uiLanguage === 'es' ? es : en;
  async function load() {
    try {
      await initializeAccount();
      setData(await readData());
      setError('');
    } catch {
      setError(t.loadFailed);
    }
  }
  useEffect(() => {
    void load();
    const update = () => setRoute(routeFromHash());
    const tick = () => setNow(new Date());
    const refresh = () => {
      if (!lock.current) void load();
    };
    window.addEventListener('paso-data-changed', refresh);
    window.addEventListener('hashchange', update);
    window.addEventListener('focus', tick);
    const timer = setInterval(tick, 30000);
    return () => {
      window.removeEventListener('paso-data-changed', refresh);
      window.removeEventListener('hashchange', update);
      window.removeEventListener('focus', tick);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = data?.settings.uiLanguage ?? 'en';
  }, [data?.settings.uiLanguage]);
  async function commit<T>(
    operation: () => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false }> {
    if (lock.current) return { ok: false };
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await operation();
      setData(await readData());
      setNow(new Date());
      notifyLocalChange();
      return { ok: true, value };
    } catch (cause) {
      if (cause instanceof StaleProgressError) {
        try {
          setData(await readData());
          setError(t.stale);
        } catch {
          setError(t.loadFailed);
        }
      } else setError(t.saveFailed);
      return { ok: false };
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="loading-screen">
        <Brand />
        <p role="status">{error || 'Getting your next step ready…'}</p>
        {error && (
          <button className="primary-button" onClick={() => void load()}>
            {t.retry}
          </button>
        )}
      </div>
    );
  const course = getCourse(data.settings.courseId);
  async function act(lesson: Lesson, action: Action) {
    const progress =
      data!.progress.find((p) => p.courseId === course.id && p.lessonId === lesson.id) ??
      emptyProgress(course, lesson);
    return (await commit(() => saveAction(course.id, lesson.id, progress.revision, action))).ok;
  }
  async function begin(lesson: Lesson) {
    if (await act(lesson, { type: 'start' })) navigate(`lesson/${lesson.id}`);
  }
  async function choose(next: Course) {
    const result = await commit(() =>
      saveSettings({ courseId: next.id, uiLanguage: next.sourceLanguage === 'es' ? 'es' : 'en' }),
    );
    if (result.ok) navigate('learn');
  }
  async function preferences(patch: Partial<Settings>) {
    await commit(() => saveSettings(patch));
  }
  async function start(mode: 'due' | 'practice' | 'mistakes') {
    const result = await commit(() => startReview(course.id, mode));
    if (result.ok && result.value) navigate(`review/${result.value.id}`);
  }
  async function reveal(session: ReviewSession) {
    await commit(() => revealReview(session.id, session.revision));
  }
  async function recall(session: ReviewSession, text: string) {
    await commit(() => answerReview(session.id, session.revision, text));
  }
  async function speak(lessonId: string, phraseId: string, text: string, assisted: boolean) {
    return (await commit(() => saveSpeaking(course.id, lessonId, phraseId, text, assisted))).ok;
  }
  async function rate(session: ReviewSession, card: ReviewCard, rating: Grade) {
    await commit(() => rateReview(session.id, session.revision, card.revision, rating));
  }
  async function exportRecord() {
    await commit(async () => {
      const record = await exportProgress();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'paso-learning-record.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  const parts = route.split('/'),
    lesson =
      parts[0] === 'lesson'
        ? course.lessons.find((l) => l.id === (parts[1] ?? course.lessons[0].id))
        : undefined,
    progress = lesson
      ? data.progress.find((p) => p.courseId === course.id && p.lessonId === lesson.id)
      : undefined;
  let content;
  if (lesson && progress?.run) {
    content = progress.run.completedAt ? (
      <Completion
        course={course}
        lesson={lesson}
        progress={progress}
        busy={busy}
        begin={begin}
        navigate={navigate}
      />
    ) : (
      <LessonScreen
        course={course}
        lesson={lesson}
        progress={progress}
        busy={busy}
        error={error}
        act={(a) => act(lesson, a)}
        exit={() => navigate('learn')}
      />
    );
  } else
    content = (
      <Shell course={course} data={data} route={parts[0]} error={error}>
        {parts[0] === 'conversation' ? (
          <ConversationPage
            key={course.id}
            data={data}
            courseId={course.id}
            id={parts[1]}
            commit={commit}
            navigate={navigate}
          />
        ) : parts[0] === 'placement' ? (
          <PlacementPage
            key={course.id}
            data={data}
            courseId={course.id}
            commit={commit}
            navigate={navigate}
          />
        ) : parts[0] === 'account' ? (
          <AccountPage exportRecord={exportRecord} />
        ) : parts[0] === 'courses' ? (
          <CoursePicker current={course.id} busy={busy} choose={choose} />
        ) : parts[0] === 'words' ? (
          <Phrasebook key={course.id} course={course} data={data} />
        ) : parts[0] === 'review' ? (
          <ReviewPage
            course={course}
            data={data}
            sessionId={parts[1]}
            busy={busy}
            start={start}
            reveal={reveal}
            answer={recall}
            rate={rate}
            navigate={navigate}
            now={now}
          />
        ) : parts[0] === 'speak' ? (
          <SpeakingPage key={course.id} course={course} data={data} busy={busy} save={speak} />
        ) : parts[0] === 'settings' ? (
          <SettingsPage
            key={course.id}
            course={course}
            settings={data.settings}
            busy={busy}
            save={preferences}
            exportRecord={exportRecord}
          />
        ) : (
          <Dashboard
            key={course.id}
            course={course}
            data={data}
            busy={busy}
            begin={begin}
            navigate={navigate}
          />
        )}
      </Shell>
    );
  return (
    <LocaleContext.Provider value={data.settings.uiLanguage}>
      <AudioProvider settings={data.settings}>
        {content}
        <UpdateNotice />
        {lesson && progress?.run?.completedAt && error && (
          <p className="app-error" role="alert">
            {error}
          </p>
        )}
      </AudioProvider>
    </LocaleContext.Provider>
  );
}
function Shell({
  course,
  data,
  route,
  error,
  children,
}: {
  course: Course;
  data: AppData;
  route: string;
  error: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const account = useAccount();
  const xp = data.progress.reduce((n, p) => n + p.earnedXp, 0),
    nav = [
      {
        route: 'learn',
        icon: Compass,
        title: data.settings.uiLanguage === 'es' ? 'Aprender' : 'Learn',
      },
      {
        route: 'review',
        icon: RotateCcw,
        title: data.settings.uiLanguage === 'es' ? 'Practicar' : 'Practice',
      },
      {
        route: 'conversation',
        icon: Mic,
        title: data.settings.uiLanguage === 'es' ? 'Hablar' : 'Speak',
      },
      { route: 'words', icon: BookOpen, title: t.phrasebook },
    ];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {data.settings.uiLanguage === 'es' ? 'Saltar al contenido' : 'Skip to content'}
      </a>
      <aside className="sidebar">
        <button className="brand-button" aria-label="Paso home" onClick={() => navigate('learn')}>
          <Brand />
        </button>
        <div className="sidebar-tagline">{t.introLabel.toLocaleLowerCase()}</div>
        <nav className="desktop-nav" aria-label="Main navigation">
          {nav.map((item) => (
            <button
              className={route === item.route ? 'active' : ''}
              aria-current={route === item.route ? 'page' : undefined}
              onClick={() => navigate(item.route)}
              key={item.route}
            >
              <item.icon size={21} />
              {item.title}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sprout size={25} />
            <p>{t.smallSteps}</p>
          </div>
          <button className="device-button" onClick={() => navigate('account')}>
            <span className="device-icon">
              <Globe2 size={17} />
            </span>
            <span>
              {account.user?.displayName ?? t.guest}
              <small>
                {account.user
                  ? account.status === 'synced'
                    ? 'Progress synced'
                    : 'Account & sync'
                  : 'Sign in to sync'}
              </small>
            </span>
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <button
            className="mobile-brand brand-button"
            onClick={() => navigate('learn')}
            aria-label="Paso home"
          >
            <Brand small />
          </button>
          <span className="breadcrumb">
            {nav.find((n) => n.route === route)?.title ?? t.course}
          </span>
          <div className="topbar-right">
            <button
              className="icon-button account-shortcut"
              aria-label="Account and sync"
              onClick={() => navigate('account')}
            >
              <span className={`account-dot ${account.status}`} />
            </button>
            <button
              className="language-pill"
              onClick={() => navigate('courses')}
              aria-label={t.course}
            >
              <Globe2 size={17} />
              {languageNames[course.targetLanguage]}
              <ChevronDown size={14} />
            </button>
            <span className="xp-counter" aria-label={`${xp} XP`}>
              <Zap size={17} fill="currentColor" />
              {xp}
              <span>XP</span>
            </span>
            <button
              className="icon-button settings-shortcut"
              onClick={() => navigate('settings')}
              aria-label={t.settings}
            >
              <Settings2 size={20} />
            </button>
          </div>
        </header>
        {error && (
          <div className="app-error" role="alert">
            <CircleAlert size={18} />
            {error}
          </div>
        )}
        {route === 'learn' && account.guestAvailable && (
          <aside className="guest-progress-notice">
            <p>
              Your earlier progress is saved on this device. Bring it into your account to pick up
              where you left off.
            </p>
            <button className="secondary-button" onClick={() => navigate('account')}>
              Review saved progress
            </button>
          </aside>
        )}
        {children}
        <footer className="app-footer">
          <span>
            <Leaf size={13} />
            {t.joy}
          </span>
          <span>{t.openSource}</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.map((item) => (
          <button
            className={route === item.route ? 'active' : ''}
            aria-current={route === item.route ? 'page' : undefined}
            onClick={() => navigate(item.route)}
            key={item.route}
          >
            <item.icon size={20} />
            {item.title}
          </button>
        ))}
      </nav>
    </div>
  );
}
