import { useState } from 'react';
import { ArrowRight, CheckCircle2, Mic, Headphones } from 'lucide-react';
import type { Course } from '../content/schema';
import type { AppData } from '../storage';
import { isUnlocked } from '../engine';
import { phraseKey } from '../review';
import { speechMatches } from '../speech/matching';
import { useI18n } from '../i18n';
import { AudioButton } from './AudioButton';
import { SpeakingInput } from './SpeakingInput';
export function SpeakingPage({
  course,
  data,
  busy,
  save,
}: {
  course: Course;
  data: AppData;
  busy: boolean;
  save: (lessonId: string, phraseId: string, text: string, assisted: boolean) => Promise<boolean>;
}) {
  const { locale } = useI18n(),
    es = locale === 'es';
  const available = course.lessons.filter((l) => isUnlocked(l, course.id, data.progress));
  const [lessonId, setLessonId] = useState(available[available.length - 1].id),
    [answer, setAnswer] = useState(''),
    [assisted, setAssisted] = useState(false),
    [justSaved, setJustSaved] = useState(false);
  const lesson = available.find((l) => l.id === lessonId) ?? available[0];
  const phrases = lesson.phrases.filter((p) => p.target.trim().split(/\s+/).length >= 3);
  const pool = phrases.length ? phrases : lesson.phrases;
  const history = data.events.filter(
    (e) => e.kind === 'speaking' && e.courseId === course.id && e.lessonId === lesson.id,
  );
  const last = history.at(-1)?.data as { phraseId: string } | undefined;
  const index = last ? (pool.findIndex((p) => p.id === last.phraseId) + 1) % pool.length : 0,
    phrase = pool[index];
  const answers = [phrase.target, ...(phrase.acceptedAnswers ?? [])];
  const matches = speechMatches(answer, answers, course.targetLanguage);
  const spoken = history.filter((e) => {
    const d = e.data as { correct: boolean; assisted: boolean };
    return d.correct && !d.assisted;
  }).length;
  async function next() {
    if (!matches || busy) return;
    if (await save(lesson.id, phrase.id, answer, assisted)) {
      setAnswer('');
      setAssisted(false);
      setJustSaved(true);
    }
  }
  return (
    <main className="content-page speaking-page" id="main-content">
      <a className="text-button" href="#conversation">
        ← Real conversations
      </a>
      <div className="page-heading">
        <span className="eyebrow">
          <Mic size={15} />
          {es ? 'PRÁCTICA ORAL' : 'SPEAKING STUDIO'}
        </span>
        <h1>{es ? 'Encuentra tu voz.' : 'Find your voice.'}</h1>
        <p className="page-description">
          {es
            ? 'Escucha una frase, pruébala y vuelve a escuchar tu voz.'
            : 'Listen to a phrase, give it a try, then hear yourself back.'}
        </p>
      </div>
      <div className="practice-toolbar">
        <label>
          {es ? 'Tema' : 'Topic'}
          <select
            value={lesson.id}
            onChange={(e) => {
              setLessonId(e.target.value);
              setAnswer('');
              setAssisted(false);
              setJustSaved(false);
            }}
          >
            {available.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
        <span>
          <CheckCircle2 size={16} />
          {spoken} {es ? 'respuestas orales guardadas' : 'spoken answers saved'}
        </span>
      </div>
      {justSaved && (
        <p className="saved-inline" role="status">
          {es
            ? 'Práctica guardada. Prueba la siguiente frase.'
            : 'Practice saved. Try the next phrase.'}
        </p>
      )}
      <section className="speaking-card">
        <span className="eyebrow">
          <Headphones size={15} />
          {es ? 'ESCUCHA Y REPITE' : 'LISTEN & REPEAT'} · {index + 1}/{pool.length}
        </span>
        <div className="speak-target">
          <h2 lang={course.targetLanguage}>{phrase.target}</h2>
          <p>{phrase.translation}</p>
          <div>
            <AudioButton
              clipKey={phraseKey(course.id, lesson.id, phrase.id)}
              language={course.targetLanguage}
              label={es ? 'Escuchar frase' : 'Play phrase'}
            />
            <AudioButton
              clipKey={phraseKey(course.id, lesson.id, phrase.id)}
              language={course.targetLanguage}
              slow
            />
          </div>
        </div>
        <SpeakingInput
          key={`${lesson.id}:${phrase.id}:${history.length}`}
          target={phrase.target}
          answers={answers}
          language={course.targetLanguage}
          disabled={busy}
          onChange={setAnswer}
          onAssisted={async () => setAssisted(true)}
          value={answer}
        />
        <button
          className="primary-button full-width"
          disabled={!matches || busy}
          onClick={() => void next()}
        >
          {es ? 'Guardar y seguir' : 'Save & next phrase'}
          <ArrowRight size={18} />
        </button>
      </section>
      <p className="quiet-note">
        {es
          ? 'Los temas se desbloquean con tus lecciones. El audio grabado no se guarda; solo se conserva la transcripción de las respuestas que confirmas.'
          : 'Topics unlock with your lessons. Recordings are discarded; only transcripts of answers you confirm are saved.'}
      </p>
    </main>
  );
}
