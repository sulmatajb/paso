import { useEffect, useState } from 'react';
import { ArrowDownToLine, CheckCircle2, Download, Globe2, Monitor, Volume2 } from 'lucide-react';
import type { Course } from '../content/schema';
import { languageNames } from '../content/catalog';
import { useI18n } from '../i18n';
import { audioManifest, cachedClipCount, courseClips, downloadCourse } from '../audio';
import { phraseKey } from '../review';
import type { Settings } from '../storage';
import { AudioButton } from './AudioButton';
export function SettingsPage({
  course,
  settings,
  busy,
  save,
  exportRecord,
}: {
  course: Course;
  settings: Settings;
  busy: boolean;
  save: (patch: Partial<Settings>) => Promise<void>;
  exportRecord: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [downloaded, setDownloaded] = useState(0),
    [downloading, setDownloading] = useState(false),
    [failed, setFailed] = useState(false);
  const clips = courseClips(course.id),
    voices = audioManifest.voices.filter((v) => v.language === course.targetLanguage),
    lesson = course.lessons[0],
    phrase = lesson.phrases[0];
  const supported = import.meta.env.PROD && 'serviceWorker' in navigator && 'caches' in window;
  useEffect(() => {
    let active = true;
    void cachedClipCount(course.id)
      .then((n) => {
        if (active) setDownloaded(n);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [course.id]);
  async function download() {
    setDownloading(true);
    setFailed(false);
    try {
      await navigator.serviceWorker.ready;
      await downloadCourse(course.id, setDownloaded);
    } catch {
      setFailed(true);
    } finally {
      setDownloading(false);
    }
  }
  return (
    <main className="content-page settings-page" id="main-content">
      <span className="eyebrow">{t.settings}</span>
      <h1>{t.settingsTitle}</h1>
      <p className="page-description">{t.settingsDesc}</p>
      <section className="settings-section">
        <h2>{locale === 'es' ? 'Objetivo diario' : 'Daily goal'}</h2>
        <p>
          {locale === 'es'
            ? 'Respuestas correctas al día, en cualquier curso.'
            : 'Correct answers per day, across your courses.'}
        </p>
        <div className="segmented">
          {([5, 10, 20] as const).map((n) => (
            <button
              key={n}
              disabled={busy}
              aria-pressed={settings.dailyGoal === n}
              onClick={() => void save({ dailyGoal: n })}
            >
              {n}
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-section-title">
          <Globe2 size={21} />
          <h2>{t.interfaceLanguage}</h2>
        </div>
        <div className="segmented">
          <button
            disabled={busy}
            aria-pressed={settings.uiLanguage === 'en'}
            onClick={() => void save({ uiLanguage: 'en' })}
          >
            English
          </button>
          <button
            disabled={busy}
            aria-pressed={settings.uiLanguage === 'es'}
            onClick={() => void save({ uiLanguage: 'es' })}
          >
            Español
          </button>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-section-title">
          <Volume2 size={21} />
          <h2>
            {t.voice} · {languageNames[course.targetLanguage]}
          </h2>
        </div>
        <p>{t.voiceDesc}</p>
        <div className="voice-grid">
          {voices.map((voice) => (
            <div
              className={`voice-card ${settings.voices[course.targetLanguage] === voice.id ? 'selected' : ''}`}
              key={voice.id}
            >
              <button
                className="voice-select"
                aria-label={voice.name}
                aria-pressed={settings.voices[course.targetLanguage] === voice.id}
                disabled={busy}
                onClick={() => void save({ voices: { [course.targetLanguage]: voice.id } })}
              >
                <span className="voice-avatar">{voice.name.slice(0, 1)}</span>
                <strong>{voice.name}</strong>
                <span className="voice-indicator" aria-hidden="true">
                  {settings.voices[course.targetLanguage] === voice.id && (
                    <CheckCircle2 size={19} />
                  )}
                </span>
              </button>
              <AudioButton
                clipKey={phraseKey(course.id, lesson.id, phrase.id)}
                language={course.targetLanguage}
                voiceId={voice.id}
                label={`${t.previewVoice}: ${voice.name}`}
              />
            </div>
          ))}
        </div>
        <label className="speed-label">
          {t.speed}
          <select
            value={settings.playbackRate}
            disabled={busy}
            onChange={(e) => void save({ playbackRate: Number(e.target.value) })}
          >
            <option value={1}>{t.normal} · 1×</option>
            <option value={0.8}>{t.slower} · 0.8×</option>
          </select>
        </label>
        <a
          className="license-link"
          href="/licenses/audio/NOTICE.md"
          target="_blank"
          rel="noreferrer"
        >
          Kokoro · model & voice credits ↗
        </a>
      </section>
      <section className="settings-section offline-section">
        <div className="settings-section-title">
          <Download size={21} />
          <h2>{t.offline}</h2>
        </div>
        <p>{t.offlineDesc}</p>
        <div className="offline-details">
          <span>
            {clips.length} MP3 · {(clips.reduce((n, c) => n + c.bytes, 0) / 1000000).toFixed(2)} MB
            · {voices.length} {t.voices}
          </span>
          <button
            className="secondary-button"
            disabled={!supported || downloading || downloaded === clips.length}
            onClick={() => void download()}
          >
            {downloaded === clips.length ? <CheckCircle2 size={17} /> : <Download size={17} />}{' '}
            {downloading
              ? `${t.downloading} ${downloaded}/${clips.length}`
              : downloaded === clips.length
                ? t.downloaded
                : t.download}
          </button>
        </div>
        <p className="quiet-note" role="status">
          {failed
            ? t.offlineFail
            : !supported
              ? t.needHosted
              : downloaded === clips.length
                ? t.downloaded
                : ''}
        </p>
      </section>
      <section className="settings-section">
        <div className="settings-section-title">
          <Monitor size={21} />
          <h2>{t.localTitle}</h2>
        </div>
        <p>{t.localDesc}</p>
        <a className="secondary-button" href="#account">
          {locale === 'es' ? 'Cuenta y sincronización' : 'Account & sync'}
        </a>
        <button className="secondary-button" disabled={busy} onClick={() => void exportRecord()}>
          <ArrowDownToLine size={17} />
          {t.export}
        </button>
        <p className="quiet-note">{t.exportNote}</p>
      </section>
    </main>
  );
}
