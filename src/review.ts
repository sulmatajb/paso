import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs';
import { z } from 'zod';
import type { Course, Lesson } from './content/schema';
export { Rating };
export type { Grade };
export const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: false,
  enable_short_term: true,
});
export const memorySchema = z.object({
  due: z.string().datetime(),
  stability: z.number().nonnegative(),
  difficulty: z.number().nonnegative(),
  elapsed_days: z.number().nonnegative(),
  scheduled_days: z.number().nonnegative(),
  learning_steps: z.number().int().nonnegative(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  last_review: z.string().datetime().optional(),
});
export const reviewCardSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  lessonId: z.string(),
  phraseId: z.string(),
  courseVersion: z.number(),
  revision: z.number().int().nonnegative(),
  memory: memorySchema,
});
export type ReviewCard = z.infer<typeof reviewCardSchema>;
export type Memory = z.infer<typeof memorySchema>;
export function serializeMemory(card: Card): Memory {
  return { ...card, due: card.due.toISOString(), last_review: card.last_review?.toISOString() };
}
export function hydrateMemory(memory: Memory): Card {
  return {
    ...memory,
    due: new Date(memory.due),
    last_review: memory.last_review ? new Date(memory.last_review) : undefined,
  };
}
export const phraseKey = (courseId: string, lessonId: string, phraseId: string) =>
  `${courseId}/${lessonId}/${phraseId}`;
export function newCards(course: Course, lesson: Lesson, now: Date): ReviewCard[] {
  return lesson.phrases.map((phrase) => ({
    id: phraseKey(course.id, lesson.id, phrase.id),
    courseId: course.id,
    lessonId: lesson.id,
    phraseId: phrase.id,
    courseVersion: course.version,
    revision: 0,
    memory: serializeMemory(createEmptyCard(now)),
  }));
}
export function schedule(card: ReviewCard, rating: Grade, now: Date) {
  const result = scheduler.next(hydrateMemory(card.memory), now, rating);
  return {
    card: { ...card, revision: card.revision + 1, memory: serializeMemory(result.card) },
    log: {
      ...result.log,
      due: result.log.due.toISOString(),
      review: result.log.review.toISOString(),
    },
  };
}
export function dueCards(cards: ReviewCard[], courseId: string, now: Date) {
  return cards
    .filter((c) => c.courseId === courseId && new Date(c.memory.due).getTime() <= now.getTime())
    .sort((a, b) => a.memory.due.localeCompare(b.memory.due) || a.id.localeCompare(b.id));
}
export function intervalLabel(date: Date, now: Date, locale = 'en') {
  const minutes = Math.max(1, Math.round((date.getTime() - now.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} ${locale === 'es' ? 'días' : 'days'}`;
}
export function previewIntervals(card: ReviewCard, now: Date, locale = 'en') {
  const results = scheduler.repeat(hydrateMemory(card.memory), now);
  return ([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]).map((rating) => ({
    rating,
    interval: intervalLabel(results[rating].card.due, now, locale),
  }));
}
