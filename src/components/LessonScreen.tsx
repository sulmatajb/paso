import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  CircleHelp,
  CloudOff,
  Lightbulb,
  Sparkles,
  X,
} from 'lucide-react';
import type { Course, Lesson, Exercise } from '../content/schema';
import { correctAnswer, type Action, type Answer, type Progress } from '../engine';
import { phraseKey } from '../review';
import { useI18n } from '../i18n';
import { Brand } from './Artwork';
import { SpeakingInput } from './SpeakingInput';
import { AudioButton } from './AudioButton';
import { ExerciseInput, initialAnswer, isReady } from './ExerciseInput';
type Props = {
  course: Course;
  lesson: Lesson;
  progress: Progress;
  busy: boolean;
  error: string;
  act: (action: Action) => Promise<boolean>;
  exit: () => void;
};
export function LessonScreen(props: Props) {
  const { t } = useI18n();
  const run = props.progress.run!,
    lesson = props.lesson,
    exercise = lesson.exercises[run.cursor];
  return (
    <div className="lesson-page">
      <header className="lesson-header">
        <button className="icon-button exit-lesson" onClick={props.exit} aria-label={t.exit}>
          <X size={22} />
        </button>
        <div className="lesson-progress">
          <div className="lesson-progress-label">
            <span>{lesson.title}</span>
            <span>
              {run.cursor + 1} <span className="muted">/ {lesson.exercises.length}</span>
            </span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label={t.progress}
            aria-valuenow={run.cursor}
            aria-valuemin={0}
            aria-valuemax={lesson.exercises.length}
          >
            <span style={{ width: `${(run.cursor / lesson.exercises.length) * 100}%` }} />
          </div>
        </div>
        <span className="lesson-header-brand">
          <Brand small />
        </span>
      </header>
      <ExerciseStage key={`${run.id}:${exercise.id}`} {...props} exercise={exercise} />
    </div>
  );
}
function ExerciseStage({
  course,
  lesson,
  progress,
  busy,
  error,
  act,
  exit,
  exercise,
}: Props & { exercise: Exercise }) {
  const { t, locale } = useI18n();
  const run = progress.run!;
  const [answer, setAnswer] = useState<Answer>(
    () => run.feedback?.answer ?? initialAnswer(exercise),
  );
  const feedback = run.feedback,
    hinted = run.hints.includes(exercise.id),
    phrase = lesson.phrases.find((p) => p.id === exercise.phraseId)!;
  const feedbackRef = useRef<HTMLDivElement>(null),
    headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus({ preventScroll: true });
  }, [feedback]);
  const labels = {
    choice: t.choose,
    order: t.order,
    write: t.write,
    listen: t.listen,
    match: t.match,
    speak: locale === 'es' ? 'DI LA FRASE' : 'SAY IT OUT LOUD',
    dialogue: locale === 'es' ? 'SIGUE LA CONVERSACIÓN' : 'JOIN THE CONVERSATION',
  };
  const clipKey = phraseKey(course.id, lesson.id, phrase.id);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (feedback?.correct) await act({ type: 'continue' });
    else if (feedback) {
      if (await act({ type: 'retry' })) setAnswer(initialAnswer(exercise));
    } else if (isReady(exercise, answer)) await act({ type: 'answer', answer });
  }
  return (
    <form className="exercise-form" onSubmit={submit}>
      <main className="exercise-layout" id="main-content">
        <section className="exercise-main">
          <span className="eyebrow exercise-type">
            <Sparkles size={15} />
            {labels[exercise.type]}
          </span>
          <h1 tabIndex={-1} ref={headingRef}>
            {exercise.title}
          </h1>
          <p className="exercise-instruction">{exercise.instruction}</p>
          {exercise.type === 'listen' && (
            <div className="listening-station">
              <span className="sound-wave" aria-hidden="true">
                {[10, 22, 16, 32, 20, 12, 24].map((height, i) => (
                  <i key={i} style={{ height }} />
                ))}
              </span>
              <div>
                <AudioButton
                  clipKey={clipKey}
                  language={course.targetLanguage}
                  label={t.playPhrase}
                />
                <AudioButton clipKey={clipKey} language={course.targetLanguage} slow />
              </div>
            </div>
          )}
          {exercise.type === 'dialogue' && (
            <div className="dialogue-context">
              {exercise.turns.map((turn, i) => {
                const line = lesson.phrases.find((p) => p.id === turn.phraseId)!;
                return (
                  <div className="dialogue-line" key={i}>
                    <span className="speaker-avatar">{turn.speaker.slice(0, 1)}</span>
                    <div>
                      <small>{turn.speaker}</small>
                      <p lang={course.targetLanguage}>{line.target}</p>
                      <AudioButton
                        clipKey={phraseKey(course.id, lesson.id, line.id)}
                        language={course.targetLanguage}
                        voiceId={
                          course.targetLanguage === 'es'
                            ? i % 2
                              ? 'em_alex'
                              : 'ef_dora'
                            : undefined
                        }
                        small
                        text={line.target}
                      />
                    </div>
                  </div>
                );
              })}
              <span className="dialogue-your-turn">
                {locale === 'es' ? 'Tu turno ↓' : 'Your turn ↓'}
              </span>
            </div>
          )}
          {exercise.type === 'speak' ? (
            <>
              <div className="speak-target">
                <p lang={course.targetLanguage}>{phrase.target}</p>
                <span>{phrase.translation}</span>
                <AudioButton
                  clipKey={clipKey}
                  language={course.targetLanguage}
                  label={t.playPhrase}
                />
                <AudioButton clipKey={clipKey} language={course.targetLanguage} slow />
              </div>
              <SpeakingInput
                target={phrase.target}
                answers={exercise.answers}
                language={course.targetLanguage}
                disabled={!!feedback || busy}
                value={typeof answer === 'string' ? answer : ''}
                onChange={setAnswer}
                onAssisted={() => act({ type: 'hint' })}
              />
            </>
          ) : (
            <ExerciseInput
              exercise={exercise}
              disabled={!!feedback || busy}
              answer={answer}
              onChange={setAnswer}
              targetLanguage={course.targetLanguage}
              sourceLanguage={course.sourceLanguage}
            />
          )}
          {!feedback && (
            <div className="hint-area">
              <button
                type="button"
                className="text-button"
                disabled={busy || hinted}
                onClick={() => void act({ type: 'hint' })}
              >
                <Lightbulb size={17} />
                {exercise.type === 'listen' ? t.transcript : hinted ? t.hintShown : t.hint}
              </button>
              {hinted && (
                <p className="hint-text" role="status">
                  {exercise.type === 'listen' ? (
                    <>
                      <span lang={course.targetLanguage}>{phrase.target}</span>
                      <br />
                      {t.transcriptNote}
                    </>
                  ) : (
                    exercise.hint
                  )}
                </p>
              )}
            </div>
          )}
        </section>
        <aside className="lesson-aside">
          <div className="phrase-note">
            <span className="eyebrow">
              <BookOpen size={15} />
              {t.phraseKnow}
            </span>
            {run.cursor < 7 &&
            !['listen', 'dialogue', 'speak', 'write', 'order'].includes(exercise.type) ? (
              <>
                <span className="phrase-spanish" lang={course.targetLanguage}>
                  {phrase.target}
                </span>
                <p>{phrase.translation}</p>
                <AudioButton
                  clipKey={clipKey}
                  language={course.targetLanguage}
                  text={phrase.target}
                />
                <div className="note-divider" />
                <p className="phrase-note-detail">{phrase.note}</p>
              </>
            ) : (
              <>
                <span className="mini-sun" aria-hidden="true">
                  ✳
                </span>
                <h3>{t.encouragement}</h3>
                <p className="phrase-note-detail">{t.takeTime}</p>
              </>
            )}
          </div>
          <span className="aside-save">
            <CheckCircle2 size={14} />
            {t.autoSave}
          </span>
        </aside>
      </main>
      <footer
        className={`lesson-footer ${feedback ? (feedback.correct ? 'correct' : 'incorrect') : ''}`}
      >
        <div className="lesson-footer-inner">
          <div
            className="footer-message"
            ref={feedbackRef}
            tabIndex={-1}
            role={feedback ? 'status' : undefined}
          >
            {feedback ? (
              <>
                <span className="feedback-icon">
                  {feedback.correct ? <Check size={25} /> : <Lightbulb size={25} />}
                </span>
                <div>
                  <strong>{feedback.correct ? t.nice : t.almost}</strong>
                  <p>
                    {feedback.correct ? (
                      exercise.explanation
                    ) : (
                      <>
                        {t.correctAnswer}: {correctAnswer(exercise)}
                      </>
                    )}
                  </p>
                </div>
              </>
            ) : (
              <span className="gentle-reminder">
                <CircleHelp size={17} />
                {t.noRush}
              </span>
            )}
          </div>
          <button
            className="primary-button check-button"
            type="submit"
            disabled={busy || (!feedback && !isReady(exercise, answer))}
          >
            {busy
              ? t.saving
              : feedback
                ? feedback.correct
                  ? run.cursor === lesson.exercises.length - 1
                    ? t.finishLesson
                    : t.next
                  : t.retry
                : t.check}
            <ArrowRight size={19} />
          </button>
        </div>
        {error && (
          <p className="save-error" role="alert">
            <CloudOff size={17} />
            {error}
          </p>
        )}
        <button type="button" className="mobile-save-exit" onClick={exit}>
          <ArrowLeft size={13} />
          {t.exit}
        </button>
      </footer>
    </form>
  );
}
