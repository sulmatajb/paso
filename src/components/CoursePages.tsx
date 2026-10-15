import { useState } from 'react';
import {
  ArrowRight,
  Mic,
  Flame,
  BookOpen,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  RotateCcw,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react';
import { courses, languageNames } from '../content/catalog';
import type { Course, Lesson } from '../content/schema';
import { firstTryCount, isUnlocked, type Progress } from '../engine';
import { useI18n } from '../i18n';
import { dueCards, phraseKey } from '../review';
import type { AppData } from '../storage';
import { AudioButton } from './AudioButton';
import { activity } from '../activity';
import { Brand } from './Artwork';
export const greetings: Record<string, string> = { es: 'hola', en: 'hello', fr: 'bonjour' };
export function Dashboard({
  course,
  data,
  busy,
  begin,
  navigate,
}: {
  course: Course;
  data: AppData;
  busy: boolean;
  begin: (lesson: Lesson) => Promise<void>;
  navigate: (route: string) => void;
}) {
  const { t, locale } = useI18n(),
    es = locale === 'es';
  const current =
    course.lessons.find(
      (l) =>
        !data.progress.some(
          (p) => p.courseId === course.id && p.lessonId === l.id && (p.completedAt || p.placedAt),
        ),
    ) ?? course.lessons.at(-1)!;
  const units = course.units ?? [course.unit];
  const [unitId, setUnitId] = useState(current.unitId ?? course.unit.id);
  const selected = units.find((u) => u.id === unitId) ?? units[0],
    unitLessons = course.lessons.filter((l) => (l.unitId ?? course.unit.id) === selected.id);
  const done = (lesson: Lesson) =>
    data.progress.find((p) => p.courseId === course.id && p.lessonId === lesson.id);
  const completed = unitLessons.filter((l) => done(l)?.completedAt).length;
  const currentProgress = done(current),
    due = dueCards(data.cards, course.id, new Date()).length;
  const stats = activity(data.events),
    goal = data.settings.dailyGoal,
    goalPercent = Math.min(100, (stats.today / goal) * 100);
  const unitIndex = units.findIndex((u) => u.id === (current.unitId ?? course.unit.id));
  return (
    <main className="dashboard" id="main-content">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">{es ? 'TU PRÓXIMO PASO' : 'YOUR NEXT STEP'}</span>
          <h1>{es ? 'Un poco más, cada día.' : 'A little more, every day.'}</h1>
        </div>
        <span className="streak-pill">
          <Flame size={18} />
          {stats.streak} {es ? 'días' : 'day streak'}
        </span>
      </div>
      <div className="today-grid">
        <section className="next-lesson-card">
          <div>
            <span className="eyebrow">
              {es ? 'UNIDAD' : 'UNIT'} {unitIndex + 1} · {languageNames[course.targetLanguage]}
            </span>
            <h2>{current.title}</h2>
            <p>{current.subtitle}</p>
            <span className="hero-meta">
              <Clock3 size={15} />
              {current.estimatedMinutes} {t.minutes}
              <span>·</span>
              {current.exercises.length} {t.exercises}
            </span>
            <button className="primary-button" disabled={busy} onClick={() => void begin(current)}>
              {currentProgress?.run && !currentProgress.run.completedAt
                ? t.continueLesson
                : currentProgress?.completedAt
                  ? t.practice
                  : t.start}
              <ArrowRight size={18} />
            </button>
          </div>
          <div className="conversation-art" aria-hidden="true">
            <span>¡{greetings[course.targetLanguage]}!</span>
            <span>☺</span>
            <i>✦</i>
          </div>
        </section>
        <section className="daily-goal">
          <div
            className="goal-ring"
            style={{ '--progress': `${goalPercent}%` } as React.CSSProperties}
          >
            <span>
              <strong>{stats.today}</strong>
              <small>/ {goal}</small>
            </span>
          </div>
          <div>
            <h2>{es ? 'Tu objetivo diario' : 'Your daily goal'}</h2>
            <p>
              {stats.today >= goal
                ? es
                  ? '¡Objetivo cumplido!'
                  : 'You made it. Nice work!'
                : `${Math.max(0, goal - stats.today)} ${es ? 'respuestas correctas más' : 'more correct answers'}`}
            </p>
            <div className="week-strip">
              {stats.week.map((day) => (
                <span
                  key={day.date.toISOString()}
                  className={day.done ? 'done' : ''}
                  title={`${day.date.toLocaleDateString(locale)}: ${day.count}`}
                >
                  <small>{day.date.toLocaleDateString(locale, { weekday: 'narrow' })}</small>
                  <i>{day.done ? <CheckCircle2 size={14} /> : '·'}</i>
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
      {course.id === 'es-from-en' && (
        <button className="placement-banner" onClick={() => navigate('placement')}>
          <span>
            <strong>
              {data.placements.some((p) => p.courseId === course.id && p.completedAt)
                ? 'Check your starting point'
                : 'Already know some Spanish?'}
            </strong>
            <small>Find the right unit with a short placement check.</small>
          </span>
          <ArrowRight size={19} />
        </button>
      )}
      <div className="quick-practice">
        <button onClick={() => navigate('review')}>
          <span className="quick-icon">
            <RotateCcw size={21} />
          </span>
          <span>
            <strong>{es ? 'Repaso diario' : 'Daily review'}</strong>
            <small>
              {due
                ? `${due} ${t.phrases} ${t.due}`
                : es
                  ? 'Refuerza lo que aprendes'
                  : 'Keep what you learn'}
            </small>
          </span>
          <ArrowRight size={18} />
        </button>
        <button onClick={() => navigate('conversation')}>
          <span className="quick-icon peach">
            <Mic size={21} />
          </span>
          <span>
            <strong>{es ? 'Practica hablando' : 'Find your voice'}</strong>
            <small>{es ? 'Escucha, graba, repite' : 'Have a real conversation'}</small>
          </span>
          <ArrowRight size={18} />
        </button>
      </div>
      <section className="journey">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t.learningPath}</span>
            <h2>{es ? 'Paso a paso.' : 'One step at a time.'}</h2>
          </div>
          <span className="course-progress-label">
            {data.progress.filter((p) => p.courseId === course.id && p.completedAt).length}/
            {course.lessons.length} {t.lessons}
          </span>
        </div>
        <div className="unit-tabs" role="group" aria-label={es ? 'Unidades' : 'Units'}>
          {units.map((u, i) => (
            <button key={u.id} aria-pressed={u.id === selected.id} onClick={() => setUnitId(u.id)}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              {u.title}
            </button>
          ))}
        </div>
        <div className="unit-overview">
          <div>
            <h3>{selected.title}</h3>
            <p>{selected.description}</p>
          </div>
          <span>
            {completed}/{unitLessons.length}
          </span>
        </div>
        <div className="lesson-path">
          {unitLessons.map((lesson) => {
            const p = done(lesson),
              unlocked = isUnlocked(lesson, course.id, data.progress),
              active = lesson.id === current.id;
            return (
              <button
                className={`path-row ${active ? 'is-next' : ''} ${p?.completedAt ? 'is-done' : ''}`}
                key={lesson.id}
                disabled={!unlocked || busy}
                onClick={() => void begin(lesson)}
                aria-label={`${p?.completedAt ? t.practice : t.start}: ${lesson.title}`}
              >
                <span className="path-node">
                  {p?.completedAt ? (
                    <CheckCircle2 size={22} />
                  ) : !unlocked ? (
                    <LockKeyhole size={19} />
                  ) : (
                    <BookOpen size={20} />
                  )}
                </span>
                <span className="path-row-copy">
                  <strong>
                    {lesson.title}
                    {p?.placedAt && !p.completedAt && (
                      <small className="placement-tag"> · Placed out</small>
                    )}
                  </strong>
                  <small>
                    {lesson.estimatedMinutes} {t.minutes} · {lesson.phrases.length} {t.phrases}
                    {p?.run && !p.run.completedAt
                      ? ` · ${p.run.cursor}/${lesson.exercises.length}`
                      : ''}
                  </small>
                </span>
                <span className="path-end">
                  {p?.completedAt ? (
                    <span>60 XP</span>
                  ) : active ? (
                    <ArrowRight size={19} />
                  ) : !unlocked ? (
                    <span>{t.locked}</span>
                  ) : (
                    <ArrowRight size={18} />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {completed === unitLessons.length && (
          <p className="unit-finished">
            <Sparkles size={19} />
            {t.unitComplete}
          </p>
        )}
      </section>
    </main>
  );
}
export function CoursePicker({
  current,
  busy,
  choose,
}: {
  current: string;
  busy: boolean;
  choose: (course: Course) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  return (
    <main className="content-page" id="main-content">
      <span className="eyebrow">PASO · LANGUAGES</span>
      <h1>{t.courses}</h1>
      <p className="page-description">{t.coursesDesc}</p>
      <div className="course-grid">
        {courses.map((c) => (
          <article className={`course-card ${c.id === current ? 'selected' : ''}`} key={c.id}>
            <span className={`language-art language-${c.targetLanguage}`} aria-hidden="true">
              {greetings[c.targetLanguage]}
              <span>✳</span>
            </span>
            <span className="eyebrow">
              {c.lessons.length > 1
                ? `${c.units?.length ?? 1} ${locale === 'es' ? 'unidades' : 'units'}`
                : t.starterCourse}
            </span>
            <h2>{languageNames[c.targetLanguage]}</h2>
            <p>
              {t.from} {languageNames[c.sourceLanguage]}
            </p>
            <p className="course-description">{c.description}</p>
            <span className="course-stats">
              <BookOpen size={16} />
              {c.lessons.length}{' '}
              {c.lessons.length === 1 ? (locale === 'es' ? 'lección' : 'lesson') : t.lessons}
              <Clock3 size={16} />
              {c.lessons.reduce((sum, l) => sum + l.estimatedMinutes, 0)} {t.minutes}
            </span>
            <button
              className={c.id === current ? 'primary-button' : 'secondary-button'}
              disabled={busy}
              onClick={() => void choose(c)}
              aria-label={`${t.course}: ${c.title}`}
            >
              {c.id === current ? t.continueLesson : t.start}
              <ArrowRight size={17} />
            </button>
          </article>
        ))}
      </div>
    </main>
  );
}
export function Phrasebook({ course, data }: { course: Course; data: AppData }) {
  const { t } = useI18n();
  const [query, setQuery] = useState(''),
    [learnedOnly, setLearnedOnly] = useState(false);
  const learned = new Set(data.cards.filter((c) => c.courseId === course.id).map((c) => c.id));
  const phrases = course.lessons
    .flatMap((lesson) =>
      lesson.phrases.map((phrase) => ({
        lesson,
        phrase,
        key: phraseKey(course.id, lesson.id, phrase.id),
      })),
    )
    .filter(
      ({ phrase, key }) =>
        (!learnedOnly || learned.has(key)) &&
        `${phrase.target} ${phrase.translation}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    );
  return (
    <main className="phrasebook-page" id="main-content">
      <span className="eyebrow">
        {languageNames[course.sourceLanguage]} → {languageNames[course.targetLanguage]}
      </span>
      <h1>{t.phraseTitle}</h1>
      <p className="page-description">{t.phraseDesc}</p>
      <div className="phrase-filters">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPhrases}
            aria-label={t.searchPhrases}
          />
        </label>
        <div className="segmented">
          <button aria-pressed={!learnedOnly} onClick={() => setLearnedOnly(false)}>
            {t.allPhrases}
          </button>
          <button aria-pressed={learnedOnly} onClick={() => setLearnedOnly(true)}>
            {t.learnedOnly}
          </button>
        </div>
      </div>
      <div className="phrasebook-heading">
        <span>{languageNames[course.targetLanguage]}</span>
        <span>
          {phrases.length} {t.phrases}
        </span>
      </div>
      <div className="phrasebook-grid">
        {phrases.map(({ phrase, lesson, key }, i) => (
          <article className="phrasebook-card" key={key}>
            <div className="phrasebook-card-top">
              <span className="phrase-number">
                {String(i + 1).padStart(2, '0')}
                {learned.has(key) && <CheckCircle2 size={15} aria-label={t.complete} />}
              </span>
              <AudioButton
                clipKey={key}
                language={course.targetLanguage}
                text={phrase.target}
                small
              />
            </div>
            <h2 lang={course.targetLanguage}>{phrase.target}</h2>
            <p className="phrase-translation">{phrase.translation}</p>
            <p className="phrase-description">{phrase.note}</p>
            <span className="phrase-source">{lesson.title}</span>
          </article>
        ))}
      </div>
      {!phrases.length && (
        <p className="empty-state">{learnedOnly && !learned.size ? t.emptyLearned : t.noResults}</p>
      )}
    </main>
  );
}
export function Completion({
  course,
  lesson,
  progress,
  busy,
  begin,
  navigate,
}: {
  course: Course;
  lesson: Lesson;
  progress: Progress;
  busy: boolean;
  begin: (lesson: Lesson) => Promise<void>;
  navigate: (route: string) => void;
}) {
  const { t } = useI18n(),
    next = course.lessons[course.lessons.findIndex((l) => l.id === lesson.id) + 1];
  return (
    <div className="completion-page">
      <header className="completion-header">
        <button className="brand-button" onClick={() => navigate('learn')} aria-label="Paso home">
          <Brand />
        </button>
        <span>
          <CheckCircle2 size={15} />
          {t.saved}
        </span>
      </header>
      <main className="completion-content" id="main-content">
        <div className="celebration-art" aria-hidden="true">
          <span className="confetti c1">✦</span>
          <span className="confetti c2">✦</span>
          <span className="achievement-stamp">
            <Sparkles size={58} />
            <span>{languageNames[course.targetLanguage]}</span>
          </span>
          <span className="confetti c4">✦</span>
        </div>
        <span className="eyebrow">{lesson.title}</span>
        <h1>{t.lessonDone}</h1>
        <p>{t.lessonDoneDesc}</p>
        <div className="completion-stats">
          <div>
            <Zap size={20} />
            <strong>{progress.earnedXp} XP</strong>
            <span>{t.credit}</span>
          </div>
          <div>
            <CheckCircle2 size={20} />
            <strong>
              {firstTryCount(progress, lesson)} / {lesson.exercises.length}
            </strong>
            <span>{t.firstTry}</span>
          </div>
          <div>
            <BookOpen size={20} />
            <strong>
              {lesson.phrases.length} {t.phrases}
            </strong>
            <span>{t.queueAdded}</span>
          </div>
        </div>
        {next && next.unitId !== lesson.unitId && (
          <p className="unit-finished">
            <Sparkles size={18} />
            {t.unitComplete}
          </p>
        )}
        {next ? (
          <button
            className="primary-button completion-primary"
            disabled={busy}
            onClick={() => void begin(next)}
          >
            {t.nextLesson}
            <ArrowRight size={18} />
          </button>
        ) : (
          <p className="unit-finished">
            <Sparkles size={20} />
            {t.unitComplete}
          </p>
        )}
        <div className="completion-actions">
          <button className="secondary-button" onClick={() => navigate('conversation')}>
            <Mic size={17} />
            {course.sourceLanguage === 'es' ? 'Practicar hablando' : 'Try speaking practice'}
          </button>
          <button className="secondary-button" onClick={() => navigate('review')}>
            {t.startReview}
            <RotateCcw size={17} />
          </button>
          <button className="text-button" onClick={() => navigate('learn')}>
            {t.backLearn}
          </button>
          <button className="text-button" disabled={busy} onClick={() => void begin(lesson)}>
            {t.practice}
          </button>
        </div>
      </main>
    </div>
  );
}
