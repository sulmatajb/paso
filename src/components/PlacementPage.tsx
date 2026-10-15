import { useState } from 'react';
import { ArrowRight, Compass, CheckCircle2, Headphones } from 'lucide-react';
import {
  assessments,
  currentQuestion,
  startPlacement,
  answerPlacement,
  applyPlacement,
} from '../placement';
import { getCourse } from '../content/catalog';
import type { AppData } from '../storage';
import { AudioButton } from './AudioButton';
export function PlacementPage({
  data,
  courseId,
  commit,
  navigate,
}: {
  data: AppData;
  courseId: string;
  commit: (fn: () => Promise<unknown>) => Promise<{ ok: boolean }>;
  navigate: (route: string) => void;
}) {
  const [text, setText] = useState(''),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [working, setWorking] = useState(false);
  const assessment = assessments.find((a) => a.courseId === courseId),
    course = getCourse(courseId),
    units = course.units ?? [course.unit];
  const records = data.placements
    .filter((p) => p.courseId === courseId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const record =
    records.find((p) => p.id === selectedId) ?? records.find((p) => !p.completedAt) ?? records[0];
  async function begin() {
    setWorking(true);
    await commit(async () => {
      const next = await startPlacement(courseId);
      setSelectedId(next.id);
      setText('');
    });
    setWorking(false);
  }
  async function answer(value: string) {
    if (!record || working) return;
    setWorking(true);
    const result = await commit(() => answerPlacement(record.id, record.answers.length, value));
    if (result.ok) setText('');
    setWorking(false);
  }
  async function useResult() {
    if (!record) return;
    setWorking(true);
    const result = await commit(() => applyPlacement(record.id));
    setWorking(false);
    if (result.ok) navigate('learn');
  }
  if (!assessment)
    return (
      <main className="content-page" id="main-content">
        <h1>A fresh start.</h1>
        <p>This starter course has one lesson, so there is no placement check yet.</p>
        <button className="primary-button" onClick={() => navigate('learn')}>
          Start learning
        </button>
      </main>
    );
  const question = record && !record.completedAt ? currentQuestion(record, assessment) : null;
  const groupIndex = question
    ? assessment.groups.findIndex((g) => g.questions.some((q) => q.id === question.id))
    : 0;
  return (
    <main className="content-page placement-page" id="main-content">
      <div className="page-heading">
        <span className="eyebrow">
          <Compass size={16} /> FIND YOUR START
        </span>
        <h1>
          {question
            ? 'Show us what you know.'
            : record?.completedAt
              ? 'Your next step is ready.'
              : 'Already know some Spanish?'}
        </h1>
        <p className="page-description">
          {question
            ? 'Answer without looking things up. “Not sure” helps us find a comfortable starting point.'
            : assessment.description}
        </p>
      </div>
      {question && record ? (
        <section className="placement-card" key={question.id}>
          <div className="placement-progress">
            <span>Question {record.answers.length + 1} of up to 16</span>
            <span>Unit {groupIndex + 1} check</span>
          </div>
          <progress max={16} value={record.answers.length} aria-label="Placement progress" />
          <h2>{question.prompt}</h2>
          {question.clipKey && (
            <div className="placement-audio">
              <Headphones size={24} />
              <AudioButton
                clipKey={question.clipKey}
                language={course.targetLanguage}
                label="Play placement audio"
              />
              <AudioButton clipKey={question.clipKey} language={course.targetLanguage} slow />
            </div>
          )}
          {question.type === 'choice' ? (
            <div className="placement-options">
              {question.options!.map((option) => (
                <button
                  key={option}
                  className={text === option ? 'selected' : ''}
                  aria-pressed={text === option}
                  onClick={() => setText(option)}
                  disabled={working}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <label className="answer-field">
              Your Spanish answer
              <textarea
                value={text}
                maxLength={500}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write your answer…"
                autoComplete="off"
                spellCheck={false}
                lang="es"
                disabled={working}
              />
              <div className="accent-row">
                {'áéíóúñü¿¡'.split('').map((c) => (
                  <button
                    type="button"
                    key={c}
                    disabled={working}
                    onClick={() => setText((t) => t + c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </label>
          )}
          <div className="placement-actions">
            <button
              className="primary-button"
              disabled={!text.trim() || working}
              onClick={() => void answer(text)}
            >
              Next
              <ArrowRight size={18} />
            </button>
            <button className="text-button" disabled={working} onClick={() => void answer('')}>
              Not sure — skip
            </button>
          </div>
        </section>
      ) : record?.completedAt ? (
        <>
          <section className="placement-result">
            <span className="result-icon">
              <CheckCircle2 size={32} />
            </span>
            <span className="eyebrow">YOUR RECOMMENDED START</span>
            <h2>
              Unit {record.recommendedUnit + 1}: {units[record.recommendedUnit].title}
            </h2>
            <p>
              {record.recommendedUnit === 0
                ? 'Build a comfortable foundation with everyday Spanish.'
                : 'You can move ahead and revisit earlier lessons whenever you like.'}{' '}
              Placement unlocks lessons; it does not award XP or mark them completed.
            </p>
            <button className="primary-button" disabled={working} onClick={() => void useResult()}>
              Start here
              <ArrowRight size={18} />
            </button>
          </section>
          <details className="placement-review">
            <summary>
              Review your answers ({record.answers.filter((a) => a.correct).length}/
              {record.answers.length})
            </summary>
            {record.answers.map((answer) => {
              const q = assessment.groups
                .flatMap((g) => g.questions)
                .find((q) => q.id === answer.questionId)!;
              return (
                <div key={answer.questionId}>
                  <strong>{q.prompt}</strong>
                  <p>
                    {answer.correct ? '✓' : '↗'} Your answer: {answer.text || 'Not sure'}
                  </p>
                  <p>{q.explanation}</p>
                </div>
              );
            })}
          </details>
          <button className="text-button" disabled={working} onClick={() => void begin()}>
            Retake the check
          </button>
        </>
      ) : (
        <section className="placement-card">
          <div className="placement-facts">
            <span>4–16 questions</span>
            <span>About 3–8 minutes</span>
            <span>Writing + listening</span>
          </div>
          <h2>Start where it feels right.</h2>
          <p>
            We check one unit at a time and stop when we find material to practice. You can also
            start from the beginning, with no test.
          </p>
          <button className="primary-button" disabled={working} onClick={() => void begin()}>
            Find my starting point
            <ArrowRight size={18} />
          </button>
          <button className="text-button" onClick={() => navigate('learn')}>
            Start from the beginning
          </button>
        </section>
      )}
      <p className="quiet-note">
        A course starting-point check, not a certified proficiency score. The assessment is still
        awaiting independent teacher review.
      </p>
    </main>
  );
}
