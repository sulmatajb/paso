import { z } from 'zod';
import { speechMatches } from './speech/matching';
import type { Exercise, Course, Lesson } from './content/schema';

export type Answer = string | string[] | Record<string, string>;
const answerSchema = z.union([z.string(), z.array(z.string()), z.record(z.string(), z.string())]);
const attemptSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  answer: answerSchema,
  correct: z.boolean(),
  hinted: z.boolean(),
  at: z.string(),
});
export const runSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  cursor: z.number().int().nonnegative(),
  completedAt: z.string().nullable(),
  attempts: z.array(attemptSchema),
  hints: z.array(z.string()),
  feedback: attemptSchema.nullable(),
});
export const progressSchema = z.object({
  id: z.string(),
  schemaVersion: z.literal(2),
  courseId: z.string(),
  lessonId: z.string(),
  courseVersion: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  earnedXp: z.union([z.literal(0), z.literal(60)]),
  completedAt: z.string().nullable(),
  placedAt: z.string().datetime().optional(),
  run: runSchema.nullable(),
});
export type Progress = z.infer<typeof progressSchema>;
export type Attempt = z.infer<typeof attemptSchema>;
export type Action =
  | { type: 'start' }
  | { type: 'answer'; answer: Answer }
  | { type: 'continue' }
  | { type: 'retry' }
  | { type: 'hint' };
export const progressId = (courseId: string, lessonId: string) => `${courseId}:${lessonId}`;
export const emptyProgress = (course: Course, lesson: Lesson): Progress => ({
  id: progressId(course.id, lesson.id),
  schemaVersion: 2,
  courseId: course.id,
  lessonId: lesson.id,
  courseVersion: course.version,
  revision: 0,
  earnedXp: 0,
  completedAt: null,
  run: null,
});

// Normalize presentation, never remove accents. Locale comes from each course package.
export function normalize(text: string, locale: string) {
  return text
    .normalize('NFC')
    .toLocaleLowerCase(locale)
    .replace(/[’‘]/g, "'")
    .replace(/[¡!¿?.,;:“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
export function grade(exercise: Exercise, answer: Answer, locale: string): boolean {
  if (exercise.type === 'speak')
    return typeof answer === 'string' && speechMatches(answer, exercise.answers, locale);
  if (exercise.type === 'choice' || exercise.type === 'dialogue')
    return typeof answer === 'string' && answer === exercise.answer;
  if (exercise.type === 'write' || exercise.type === 'listen')
    return (
      typeof answer === 'string' &&
      exercise.answers.some((a) => normalize(a, locale) === normalize(answer, locale))
    );
  if (exercise.type === 'order')
    return (
      Array.isArray(answer) &&
      answer.length === exercise.answer.length &&
      answer.every((word, i) => word === exercise.answer[i])
    );
  return (
    typeof answer === 'object' &&
    !Array.isArray(answer) &&
    Object.keys(answer).length === exercise.pairs.length &&
    exercise.pairs.every((p) => answer[p.left] === p.right)
  );
}
export function correctAnswer(exercise: Exercise) {
  if (exercise.type === 'choice' || exercise.type === 'dialogue') return exercise.answer;
  if (exercise.type === 'write' || exercise.type === 'listen' || exercise.type === 'speak')
    return exercise.answers[0];
  if (exercise.type === 'order') return exercise.answer.join(' ');
  return exercise.pairs.map((p) => `${p.left} → ${p.right}`).join(' · ');
}
export function transition(
  current: Progress,
  action: Action,
  lesson: Lesson,
  locale: string,
  now = new Date().toISOString(),
  uuid = crypto.randomUUID(),
): Progress {
  const next = structuredClone(current);
  if (action.type === 'start') {
    if (next.run && !next.run.completedAt) return current;
    next.run = {
      id: uuid,
      startedAt: now,
      completedAt: null,
      cursor: 0,
      attempts: [],
      hints: [],
      feedback: null,
    };
  } else {
    const run = next.run;
    if (!run || run.completedAt) return current;
    const exercise = lesson.exercises[run.cursor];
    if (!exercise) throw new Error('Saved exercise is not available in this course version.');
    if (action.type === 'answer') {
      if (run.feedback) return current;
      const attempt = {
        id: uuid,
        exerciseId: exercise.id,
        answer: action.answer,
        correct: grade(exercise, action.answer, locale),
        hinted: run.hints.includes(exercise.id),
        at: now,
      };
      run.attempts.push(attempt);
      run.feedback = attempt;
    } else if (action.type === 'continue') {
      if (!run.feedback?.correct) return current;
      run.cursor++;
      run.feedback = null;
      if (run.cursor === lesson.exercises.length) {
        run.completedAt = now;
        next.completedAt ??= now;
        next.earnedXp = 60;
      }
    } else if (action.type === 'retry') {
      if (run.feedback?.correct) return current;
      run.feedback = null;
    } else if (action.type === 'hint' && !run.hints.includes(exercise.id))
      run.hints.push(exercise.id);
    else return current;
  }
  next.revision++;
  return next;
}
export function firstTryCount(progress: Progress, lesson: Lesson) {
  return lesson.exercises.filter((e) => {
    const first = progress.run?.attempts.find((a) => a.exerciseId === e.id);
    return first?.correct && !first.hinted;
  }).length;
}
export function isUnlocked(lesson: Lesson, courseId: string, records: Progress[]) {
  return lesson.prerequisites.every((id) =>
    records.some(
      (p) => p.courseId === courseId && p.lessonId === id && (p.completedAt || p.placedAt),
    ),
  );
}
