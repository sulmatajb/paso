import { useState } from 'react';
import { ArrowRight, RotateCcw, Sparkles, Target, CheckCircle2, Mic, BookOpen } from 'lucide-react';
import type { Course } from '../content/schema';
import { getLesson } from '../content/catalog';
import { useI18n } from '../i18n';
import { dueCards, phraseKey, Rating, type Grade, type ReviewCard } from '../review';
import type { AppData, ReviewSession } from '../storage';
import { AudioButton } from './AudioButton';
export function ReviewPage({
  course,
  data,
  sessionId,
  busy,
  start,
  reveal,
  answer,
  rate,
  navigate,
  now,
}: {
  course: Course;
  data: AppData;
  sessionId?: string;
  busy: boolean;
  start: (mode: 'due' | 'practice' | 'mistakes') => Promise<void>;
  reveal: (s: ReviewSession) => Promise<void>;
  answer: (s: ReviewSession, text: string) => Promise<void>;
  rate: (s: ReviewSession, c: ReviewCard, r: Grade) => Promise<void>;
  navigate: (route: string) => void;
  now: Date;
}) {
  const { t, locale } = useI18n(),
    es = locale === 'es';
  const session = data.sessions.find((s) => s.id === sessionId && s.courseId === course.id),
    cards = data.cards.filter((c) => c.courseId === course.id),
    due = dueCards(cards, course.id, now),
    mistakes = data.mistakes.filter((m) => m.courseId === course.id && !m.resolvedAt),
    resume = data.sessions.find((s) => s.courseId === course.id && !s.completedAt);
  if (session && !session.completedAt) {
    const card = cards.find((c) => c.id === session.queue[session.cursor])!;
    return (
      <Recall
        key={`${session.id}:${session.cursor}`}
        course={course}
        session={session}
        card={card}
        busy={busy}
        reveal={() => reveal(session)}
        answer={(text) => answer(session, text)}
        next={() =>
          rate(
            session,
            card,
            session.answer?.correct && !session.assisted ? Rating.Good : Rating.Again,
          )
        }
        exit={() => navigate('review')}
      />
    );
  }
  if (session?.completedAt)
    return (
      <main className="content-page review-complete" id="main-content">
        <span className="success-medallion">
          <CheckCircle2 size={40} />
        </span>
        <span className="eyebrow">{es ? 'PRÁCTICA COMPLETADA' : 'PRACTICE COMPLETE'}</span>
        <h1>{t.reviewComplete}</h1>
        <p>
          {session.queue.length} {t.reviewed}
        </p>
        <p className="page-description">
          {session.mode === 'practice' ? t.practiceSaved : t.reviewSaved}
        </p>
        <button className="primary-button" onClick={() => navigate('review')}>
          {es ? 'Volver a practicar' : 'Back to practice'}
          <ArrowRight size={18} />
        </button>
      </main>
    );
  const upcoming = cards
    .filter((c) => new Date(c.memory.due) > now)
    .sort((a, b) => a.memory.due.localeCompare(b.memory.due))[0];
  return (
    <main className="content-page practice-page" id="main-content">
      <span className="eyebrow">{es ? 'UN POCO CADA DÍA' : 'A LITTLE, OFTEN'}</span>
      <h1>{es ? 'Haz que se quede.' : 'Make it stick.'}</h1>
      <p className="page-description">
        {es
          ? 'Recupera palabras de memoria, refuerza lo difícil y dilo en voz alta.'
          : 'Recall what you know, work on the tricky bits, and say it out loud.'}
      </p>
      {resume && (
        <button className="resume-banner" onClick={() => navigate(`review/${resume.id}`)}>
          <RotateCcw size={19} />
          <span>
            {t.resumeReview}
            <small>
              {resume.cursor}/{resume.queue.length} {t.phrases}
            </small>
          </span>
          <ArrowRight size={18} />
        </button>
      )}
      <div className="practice-grid">
        <section className="practice-tile due-tile">
          <div className="tile-icon">
            <RotateCcw />
          </div>
          <span className="large-number">{due.length}</span>
          <h2>{es ? 'Repaso diario' : 'Daily review'}</h2>
          <p>
            {due.length
              ? es
                ? 'Hasta 10 frases, adaptadas a lo que recuerdas.'
                : 'Up to 10 phrases, scheduled around what you remember.'
              : cards.length
                ? t.reviewEmpty
                : t.noCards}
          </p>
          <button
            className="primary-button"
            disabled={busy || !due.length}
            onClick={() => void start('due')}
          >
            {t.startReview}
            <ArrowRight size={17} />
          </button>
          {upcoming && !due.length && (
            <small>
              {t.futureReview}:{' '}
              {new Date(upcoming.memory.due).toLocaleString(locale, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </small>
          )}
        </section>
        <section className="practice-tile">
          <div className="tile-icon peach">
            <Target />
          </div>
          <span className="large-number">{mistakes.length}</span>
          <h2>{es ? 'Puntos difíciles' : 'Tricky words'}</h2>
          <p>
            {es
              ? 'Frases que necesitaban otra oportunidad. Se retiran cuando las recuerdas sin ayuda.'
              : 'Phrases that needed another try. Clear them by recalling the answer without help.'}
          </p>
          <button
            className="secondary-button"
            disabled={busy || !mistakes.length}
            onClick={() => void start('mistakes')}
          >
            {es ? 'Practicar errores' : 'Practice mistakes'}
            <ArrowRight size={17} />
          </button>
        </section>
        <section className="practice-tile">
          <div className="tile-icon mint">
            <Mic />
          </div>
          <h2>{es ? 'Habla un poco' : 'Say a little more'}</h2>
          <p>
            {es
              ? 'Escucha, graba y compara las palabras reconocidas con la frase.'
              : 'Listen, record, and compare the recognized words with the phrase.'}
          </p>
          <button className="secondary-button" onClick={() => navigate('speak')}>
            {es ? 'Practicar hablando' : 'Practice speaking'}
            <ArrowRight size={17} />
          </button>
        </section>
        <section className="practice-tile">
          <div className="tile-icon">
            <BookOpen />
          </div>
          <h2>{es ? 'Práctica libre' : 'Keep it fresh'}</h2>
          <p>{t.noChange}</p>
          <button
            className="secondary-button"
            disabled={busy || !cards.length}
            onClick={() => void start('practice')}
          >
            {t.practiceAhead}
            <ArrowRight size={17} />
          </button>
        </section>
      </div>
      <p className="quiet-note">
        <Sparkles size={15} />
        {es
          ? 'El calendario se adapta a tus respuestas. No pierdes vidas por equivocarte.'
          : 'Your schedule adapts to your answers. Mistakes never cost you a life.'}
      </p>
    </main>
  );
}
function Recall({
  course,
  session,
  card,
  busy,
  reveal,
  answer,
  next,
  exit,
}: {
  course: Course;
  session: ReviewSession;
  card: ReviewCard;
  busy: boolean;
  reveal: () => Promise<void>;
  answer: (text: string) => Promise<void>;
  next: () => Promise<void>;
  exit: () => void;
}) {
  const { t, locale } = useI18n(),
    es = locale === 'es',
    [text, setText] = useState('');
  const phrase = getLesson(course.id, card.lessonId).phrases.find((p) => p.id === card.phraseId)!,
    correct = session.answer?.correct && !session.assisted;
  return (
    <main className="content-page recall-page" id="main-content">
      <div className="review-top">
        <button className="text-button" onClick={exit}>
          ← {t.back}
        </button>
        <span>
          {session.cursor + 1}/{session.queue.length}
        </span>
      </div>
      <div className="progress-track">
        <span style={{ width: `${(session.cursor / session.queue.length) * 100}%` }} />
      </div>
      <section className="recall-card">
        <span className="eyebrow">{es ? 'RECUERDA LA FRASE' : 'RECALL THE PHRASE'}</span>
        <h1>{t.recallPrompt}</h1>
        <p className="recall-translation">{phrase.translation}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (session.revealed ? next() : answer(text));
          }}
        >
          {!session.revealed ? (
            <>
              <div className="write-answer">
                <label htmlFor="recall-answer">{t.answer}</label>
                <textarea
                  id="recall-answer"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  spellCheck={false}
                  lang={course.targetLanguage}
                  rows={2}
                />
              </div>
              <button className="primary-button full-width" disabled={busy || !text.trim()}>
                {t.check}
                <ArrowRight size={17} />
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => void reveal()}
              >
                {es ? 'No lo recuerdo · mostrar respuesta' : 'I don’t remember · show answer'}
              </button>
            </>
          ) : (
            <>
              <div className={`recall-feedback ${correct ? 'matched' : ''}`} role="status">
                <strong>
                  {correct
                    ? es
                      ? 'Lo recordaste.'
                      : 'You remembered it.'
                    : es
                      ? 'Volveremos a practicarla.'
                      : 'We’ll practice this again.'}
                </strong>
                {session.answer && (
                  <p>
                    {es ? 'Tu respuesta' : 'Your answer'}: {session.answer.text}
                  </p>
                )}
                <h2 lang={course.targetLanguage}>{phrase.target}</h2>
                <AudioButton
                  clipKey={phraseKey(course.id, card.lessonId, phrase.id)}
                  language={course.targetLanguage}
                  text={phrase.target}
                />
                <p>{phrase.note}</p>
                <small>
                  {session.mode === 'practice'
                    ? t.noChange
                    : correct
                      ? es
                        ? 'La próxima revisión se programa más adelante.'
                        : 'Your next review moves further out.'
                      : es
                        ? 'Volverá pronto para reforzarla.'
                        : 'This phrase will return soon for another try.'}
                </small>
              </div>
              <button className="primary-button full-width" disabled={busy}>
                {t.next}
                <ArrowRight size={17} />
              </button>
            </>
          )}
        </form>
      </section>
    </main>
  );
}
