import { z } from 'zod';
import { progressSchema, progressId } from '../engine';
import { reviewCardSchema } from '../review';
import { settingsSchema, reviewSessionSchema } from '../preferences';
import { placementSchema, conversationSchema } from '../learning-records';
import { getCourse, getLesson } from '../content/catalog';
import placementContent from '../content/placement/es-en.json';
import { getScenario } from '../conversation/scenarios';
const eventSchema = z.object({
  id: z.string().max(160),
  courseId: z.string().max(80),
  lessonId: z.string().max(100).optional(),
  sessionId: z.string().max(100).optional(),
  kind: z.string().max(60),
  at: z.string().datetime(),
  data: z.unknown(),
});
const mistakeSchema = z.object({
  id: z.string().max(250),
  courseId: z.string().max(80),
  lessonId: z.string().max(100),
  phraseId: z.string().max(100),
  count: z.number().int().nonnegative(),
  lastWrongAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});
export const snapshotSchema = z
  .object({
    progress: z.array(progressSchema).max(1000),
    cards: z.array(reviewCardSchema).max(10000),
    sessions: z.array(reviewSessionSchema).max(10000),
    settings: settingsSchema,
    events: z.array(eventSchema).max(40000),
    mistakes: z.array(mistakeSchema).max(10000),
    placements: z.array(placementSchema).max(1000).default([]),
    conversations: z.array(conversationSchema).max(2000).default([]),
  })
  .superRefine((data, ctx) => {
    try {
      getCourse(data.settings.courseId);
      for (const collection of [
        data.progress,
        data.cards,
        data.sessions,
        data.events,
        data.mistakes,
        data.placements,
        data.conversations,
      ])
        if (new Set(collection.map((x) => x.id)).size !== collection.length)
          throw Error('Duplicate records');
      for (const p of data.progress) {
        const course = getCourse(p.courseId),
          lesson = getLesson(p.courseId, p.lessonId);
        if (p.id !== progressId(course.id, lesson.id) || p.courseVersion !== course.version)
          throw Error('Unknown course version');
        if (
          p.run &&
          (p.run.cursor > lesson.exercises.length ||
            !!p.run.completedAt !== (p.run.cursor === lesson.exercises.length) ||
            (p.run.feedback && p.run.feedback.exerciseId !== lesson.exercises[p.run.cursor]?.id))
        )
          throw Error('Invalid lesson state');
      }
      for (const c of data.cards) {
        const lesson = getLesson(c.courseId, c.lessonId);
        if (
          c.id !== `${c.courseId}/${c.lessonId}/${c.phraseId}` ||
          !lesson.phrases.some((p) => p.id === c.phraseId) ||
          c.courseVersion !== getCourse(c.courseId).version
        )
          throw Error('Invalid review card');
      }
      for (const s of data.sessions) {
        getCourse(s.courseId);
        if (
          s.cursor > s.queue.length ||
          !!s.completedAt !== (s.cursor === s.queue.length) ||
          s.queue.some((id) => !data.cards.some((c) => c.id === id && c.courseId === s.courseId))
        )
          throw Error('Invalid review session');
      }
      for (const p of data.placements) {
        if (
          p.courseId !== placementContent.courseId ||
          p.assessmentId !== placementContent.id ||
          p.answers.some(
            (answer, index) =>
              answer.questionId !== placementContent.groups.flatMap((g) => g.questions)[index]?.id,
          )
        )
          throw Error('Unknown placement question');
        if (
          p.recommendedUnit >= (getCourse(p.courseId).units ?? [getCourse(p.courseId).unit]).length
        )
          throw Error('Invalid placement');
      }
      for (const c of data.conversations) {
        getCourse(c.courseId);
        getScenario(c.scenarioId);
        if (new Set(c.messages.map((m) => m.id)).size !== c.messages.length || !c.messages.length)
          throw Error('Invalid conversation messages');
      }
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid learning data',
      });
    }
  });
export type Snapshot = z.infer<typeof snapshotSchema>;
export const syncRequestSchema = z
  .object({ revision: z.number().int().nonnegative(), snapshot: snapshotSchema })
  .strict();
