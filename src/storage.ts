import Dexie, { type EntityTable } from 'dexie';
import { z } from 'zod';
import { speechMatches } from './speech/matching';
import { courses, getCourse, getLesson } from './content/catalog';
import {
  emptyProgress,
  normalize,
  isUnlocked,
  progressId,
  progressSchema,
  runSchema,
  transition,
  type Action,
  type Progress,
} from './engine';
import {
  newCards,
  phraseKey,
  dueCards,
  schedule,
  reviewCardSchema,
  type Grade,
  type ReviewCard,
} from './review';

import {
  placementSchema,
  conversationSchema,
  type Placement,
  type Conversation,
} from './learning-records';
export class StaleProgressError extends Error {}
export { settingsSchema, defaultSettings, reviewSessionSchema } from './preferences';
export type { Settings, ReviewSession } from './preferences';
import {
  settingsSchema,
  defaultSettings,
  reviewSessionSchema,
  type Settings,
  type ReviewSession,
} from './preferences';
export type LearningEvent = {
  id: string;
  courseId: string;
  lessonId?: string;
  sessionId?: string;
  kind: string;
  at: string;
  data: unknown;
};
export type Mistake = {
  id: string;
  courseId: string;
  lessonId: string;
  phraseId: string;
  count: number;
  lastWrongAt: string;
  resolvedAt: string | null;
};
export type AppData = {
  placements: Placement[];
  conversations: Conversation[];
  mistakes: Mistake[];
  events: LearningEvent[];
  progress: Progress[];
  cards: ReviewCard[];
  sessions: ReviewSession[];
  settings: Settings;
};
const legacySchema = z.object({
  id: z.literal('es-first-hello'),
  schemaVersion: z.literal(1),
  courseVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  earnedXp: z.union([z.literal(0), z.literal(60)]),
  completedAt: z.string().nullable(),
  run: runSchema.nullable(),
});

export class ProgressDatabase extends Dexie {
  progress!: EntityTable<z.infer<typeof legacySchema>, 'id'>;
  lessons!: EntityTable<Progress, 'id'>;
  cards!: EntityTable<ReviewCard, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  sessions!: EntityTable<ReviewSession, 'id'>;
  events!: EntityTable<LearningEvent, 'id'>;
  mistakes!: EntityTable<Mistake, 'id'>;
  placements!: EntityTable<Placement, 'id'>;
  conversations!: EntityTable<Conversation, 'id'>;
  constructor(name = 'paso-learning-v1') {
    super(name);
    this.version(1).stores({ progress: 'id' });
    this.version(2)
      .stores({
        progress: 'id',
        lessons: 'id,courseId,lessonId',
        cards: 'id,courseId,lessonId,memory.due',
        settings: 'id',
        sessions: 'id,courseId',
        events: 'id,courseId,kind,at',
      })
      .upgrade(async (transaction) => {
        const legacy = await transaction.table('progress').get('es-first-hello');
        if (!legacy) return;
        const old = legacySchema.parse(legacy);
        const course = getCourse('es-from-en'),
          lesson = getLesson(course.id, 'es-first-hello');
        if (
          old.run &&
          (old.run.cursor > lesson.exercises.length ||
            !!old.run.completedAt !== (old.run.cursor === lesson.exercises.length))
        )
          throw new Error('Saved progress has an invalid cursor.');
        const converted: Progress = {
          ...old,
          ...emptyProgress(course, lesson),
          revision: old.revision,
          earnedXp: old.earnedXp,
          completedAt: old.completedAt,
          run: old.run,
        };
        await transaction.table('lessons').put(converted);
        if (old.completedAt)
          await transaction.table('cards').bulkPut(newCards(course, lesson, new Date()));
        await transaction.table('events').put({
          id: 'migration-phase1',
          kind: 'migration',
          courseId: course.id,
          lessonId: lesson.id,
          at: new Date().toISOString(),
          data: { from: 1, to: 2 },
        });
        // The original progress table is deliberately retained as a migration backup.
      });
    this.version(3).stores({ mistakes: 'id,courseId,lessonId' });
    this.version(4).stores({ placements: 'id,courseId', conversations: 'id,courseId,updatedAt' });
  }
}
export let db = new ProgressDatabase();
export function selectDatabase(name: string) {
  if (db.name === name) return;
  db.close();
  db = new ProgressDatabase(name);
}
export async function readData(database = db): Promise<AppData> {
  const [progress, cards, sessions, settings, mistakes, events, placements, conversations] =
    await Promise.all([
      database.lessons.toArray(),
      database.cards.toArray(),
      database.sessions.toArray(),
      database.settings.get('settings'),
      database.mistakes.toArray(),
      database.events.toArray(),
      database.placements.toArray(),
      database.conversations.toArray(),
    ]);
  const validated = progress.map((p) => {
    const record = progressSchema.parse(p);
    const course = getCourse(record.courseId),
      lesson = getLesson(record.courseId, record.lessonId);
    if (
      record.id !== progressId(course.id, lesson.id) ||
      record.courseVersion !== course.version ||
      (record.run &&
        (record.run.cursor > lesson.exercises.length ||
          !!record.run.completedAt !== (record.run.cursor === lesson.exercises.length) ||
          (record.run.feedback &&
            record.run.feedback.exerciseId !== lesson.exercises[record.run.cursor]?.id)))
    )
      throw new Error('Saved progress requires a course migration.');
    return record;
  });
  const preferences = settings ? settingsSchema.parse(settings) : defaultSettings();
  if (!courses.some((c) => c.id === preferences.courseId))
    throw new Error('Selected course is unavailable.');
  const validCards = cards.map((raw) => {
    const card = reviewCardSchema.parse(raw),
      course = getCourse(card.courseId),
      lesson = getLesson(card.courseId, card.lessonId);
    if (
      card.courseVersion !== course.version ||
      card.id !== `${card.courseId}/${card.lessonId}/${card.phraseId}` ||
      !lesson.phrases.some((p) => p.id === card.phraseId)
    )
      throw new Error('Review card requires a course migration.');
    return card;
  });
  const validSessions = sessions.map((raw) => {
    const session = reviewSessionSchema.parse(raw);
    getCourse(session.courseId);
    if (
      session.cursor > session.queue.length ||
      !!session.completedAt !== (session.cursor === session.queue.length) ||
      session.queue.some(
        (id) => !validCards.some((c) => c.id === id && c.courseId === session.courseId),
      )
    )
      throw new Error('Saved review is inconsistent.');
    return session;
  });
  return {
    placements: placements.map((p) => placementSchema.parse(p)),
    conversations: conversations.map((c) => conversationSchema.parse(c)),
    progress: validated,
    cards: validCards,
    sessions: validSessions,
    settings: preferences,
    mistakes,
    events,
  };
}
export async function saveAction(
  courseId: string,
  lessonId: string,
  expectedRevision: number,
  action: Action,
  database = db,
  now = new Date(),
): Promise<Progress> {
  const course = getCourse(courseId),
    lesson = getLesson(courseId, lessonId);
  return database.transaction(
    'rw',
    [database.lessons, database.cards, database.events, database.mistakes],
    async () => {
      const stored = await database.lessons.get(progressId(courseId, lessonId));
      const current = stored ? progressSchema.parse(stored) : emptyProgress(course, lesson);
      if (current.revision !== expectedRevision)
        throw new StaleProgressError('Progress changed in another tab.');
      if (current.courseVersion !== course.version)
        throw new Error('Saved course version does not match.');
      if (
        action.type === 'start' &&
        !isUnlocked(
          lesson,
          courseId,
          await database.lessons.where('courseId').equals(courseId).toArray(),
        )
      )
        throw new Error('Complete the previous lesson first.');
      const next = transition(current, action, lesson, course.targetLanguage, now.toISOString());
      if (next === current) return current;
      await database.lessons.put(next);
      await database.events.add({
        id: crypto.randomUUID(),
        kind: action.type,
        courseId,
        lessonId,
        sessionId: next.run?.id,
        at: now.toISOString(),
        data: {
          ...action,
          exerciseId: lesson.exercises[current.run?.cursor ?? 0]?.id,
          correct: action.type === 'answer' ? next.run?.feedback?.correct : undefined,
        },
      });
      if ((action.type === 'answer' && !next.run?.feedback?.correct) || action.type === 'hint') {
        const exercise = lesson.exercises[current.run!.cursor],
          id = phraseKey(courseId, lessonId, exercise.phraseId);
        const old = await database.mistakes.get(id);
        await database.mistakes.put({
          id,
          courseId,
          lessonId,
          phraseId: exercise.phraseId,
          count: (old?.count ?? 0) + 1,
          lastWrongAt: now.toISOString(),
          resolvedAt: null,
        });
        if (!(await database.cards.get(id)))
          await database.cards.add(newCards(course, lesson, now).find((c) => c.id === id)!);
      }
      if (!current.completedAt && next.completedAt) {
        for (const card of newCards(course, lesson, now))
          if (!(await database.cards.get(card.id))) await database.cards.add(card);
      }
      return next;
    },
  );
}
export async function saveSettings(
  patch: Partial<
    Pick<Settings, 'courseId' | 'voices' | 'playbackRate' | 'uiLanguage' | 'dailyGoal'>
  >,
  database = db,
) {
  return database.transaction('rw', database.settings, async () => {
    const current = (await database.settings.get('settings')) ?? defaultSettings();
    const next = settingsSchema.parse({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
      voices: patch.voices ? { ...current.voices, ...patch.voices } : current.voices,
    });
    getCourse(next.courseId);
    await database.settings.put(next);
    return next;
  });
}
export async function startReview(
  courseId: string,
  mode: 'due' | 'practice' | 'mistakes' = 'due',
  database = db,
  now = new Date(),
) {
  return database.transaction(
    'rw',
    [database.sessions, database.cards, database.mistakes],
    async () => {
      const prior = (await database.sessions.where('courseId').equals(courseId).toArray()).find(
        (s) => !s.completedAt && s.mode === mode,
      );
      if (prior) return prior;
      const all = await database.cards.where('courseId').equals(courseId).toArray();
      const missed = new Set(
        (await database.mistakes.where('courseId').equals(courseId).toArray())
          .filter((m) => !m.resolvedAt)
          .map((m) => m.id),
      );
      const cards = (
        mode === 'due'
          ? dueCards(all, courseId, now)
          : mode === 'mistakes'
            ? all.filter((c) => missed.has(c.id))
            : all
      ).slice(0, 10);
      if (!cards.length) return null;
      const session: ReviewSession = {
        id: crypto.randomUUID(),
        courseId,
        mode,
        answer: null,
        assisted: false,
        queue: cards.map((c) => c.id),
        cursor: 0,
        revealed: false,
        revision: 0,
        createdAt: now.toISOString(),
        completedAt: null,
      };
      await database.sessions.add(session);
      return session;
    },
  );
}
export async function revealReview(sessionId: string, expectedRevision: number, database = db) {
  return database.transaction('rw', database.sessions, async () => {
    const current = await database.sessions.get(sessionId);
    if (!current || current.revision !== expectedRevision)
      throw new StaleProgressError('Review changed in another tab.');
    if (current.completedAt || current.revealed) return current;
    const next = { ...current, revealed: true, assisted: true, revision: current.revision + 1 };
    await database.sessions.put(next);
    return next;
  });
}
export async function rateReview(
  sessionId: string,
  expectedRevision: number,
  expectedCardRevision: number,
  rating: Grade,
  database = db,
  now = new Date(),
) {
  if (![1, 2, 3, 4].includes(rating)) throw new Error('Invalid review rating.');
  return database.transaction(
    'rw',
    [database.sessions, database.cards, database.events, database.mistakes],
    async () => {
      const session = await database.sessions.get(sessionId);
      if (!session || session.revision !== expectedRevision)
        throw new StaleProgressError('Review changed in another tab.');
      if (!session.revealed || session.completedAt)
        throw new Error('Reveal the answer before rating.');
      const card = await database.cards.get(session.queue[session.cursor]);
      if (!card || card.revision !== expectedCardRevision)
        throw new StaleProgressError('This card was reviewed in another tab.');
      const effectiveRating =
        session.answer || session.assisted
          ? session.answer?.correct && !session.assisted
            ? 3
            : 1
          : rating;
      const result = session.mode !== 'practice' ? schedule(card, effectiveRating, now) : null;
      const oldMistake = await database.mistakes.get(card.id);
      if (session.answer?.correct && !session.assisted && oldMistake)
        await database.mistakes.put({ ...oldMistake, resolvedAt: now.toISOString() });
      else if (session.assisted || session.answer?.correct === false)
        await database.mistakes.put({
          id: card.id,
          courseId: card.courseId,
          lessonId: card.lessonId,
          phraseId: card.phraseId,
          count: (oldMistake?.count ?? 0) + 1,
          lastWrongAt: now.toISOString(),
          resolvedAt: null,
        });
      if (result) await database.cards.put(result.card);
      await database.events.add({
        id: `${session.id}:${session.cursor}`,
        kind: session.mode !== 'practice' ? 'review' : 'practice',
        courseId: session.courseId,
        lessonId: card.lessonId,
        sessionId: session.id,
        at: now.toISOString(),
        data: {
          cardId: card.id,
          rating: effectiveRating,
          answer: session.answer,
          assisted: session.assisted ?? false,
          log: result?.log ?? null,
        },
      });
      const next = {
        ...session,
        cursor: session.cursor + 1,
        revealed: false,
        answer: null,
        assisted: false,
        revision: session.revision + 1,
        completedAt: session.cursor + 1 === session.queue.length ? now.toISOString() : null,
      };
      await database.sessions.put(next);
      return next;
    },
  );
}
export async function exportProgress(database = db) {
  return {
    app: 'Paso',
    schemaVersion: 4,
    exportedAt: new Date().toISOString(),
    ...(await readData(database)),
    events: await database.events.toArray(),
  };
}

export async function answerReview(
  sessionId: string,
  expectedRevision: number,
  text: string,
  database = db,
) {
  return database.transaction('rw', [database.sessions, database.cards], async () => {
    const raw = await database.sessions.get(sessionId);
    if (!raw || raw.revision !== expectedRevision)
      throw new StaleProgressError('Review changed in another tab.');
    const session = reviewSessionSchema.parse(raw);
    if (session.completedAt || session.revealed || !text.trim()) return session;
    const card = await database.cards.get(session.queue[session.cursor]);
    if (!card) throw new Error('Review card missing.');
    const course = getCourse(card.courseId),
      phrase = getLesson(card.courseId, card.lessonId).phrases.find((p) => p.id === card.phraseId)!;
    const correct = [phrase.target, ...(phrase.acceptedAnswers ?? [])].some(
      (a) => normalize(a, course.targetLanguage) === normalize(text, course.targetLanguage),
    );
    const next = {
      ...session,
      answer: { text, correct },
      revealed: true,
      revision: session.revision + 1,
    };
    await database.sessions.put(next);
    return next;
  });
}
export async function saveSpeaking(
  courseId: string,
  lessonId: string,
  phraseId: string,
  text: string,
  assisted = false,
  database = db,
  now = new Date(),
) {
  const course = getCourse(courseId),
    lesson = getLesson(courseId, lessonId),
    phrase = lesson.phrases.find((p) => p.id === phraseId);
  if (
    !phrase ||
    !text.trim() ||
    !isUnlocked(
      lesson,
      courseId,
      await database.lessons.where('courseId').equals(courseId).toArray(),
    )
  )
    throw new Error('Speaking phrase unavailable.');
  const correct = speechMatches(
    text,
    [phrase.target, ...(phrase.acceptedAnswers ?? [])],
    course.targetLanguage,
  );
  await database.events.add({
    id: crypto.randomUUID(),
    courseId,
    lessonId,
    kind: 'speaking',
    at: now.toISOString(),
    data: { phraseId, text, correct, assisted },
  });
  return correct;
}
