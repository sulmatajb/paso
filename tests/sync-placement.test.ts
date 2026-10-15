import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { ProgressDatabase, readData, saveAction, saveSettings } from '../src/storage';
import { getCourse } from '../src/content/catalog';
import { isUnlocked, emptyProgress } from '../src/engine';
import {
  assessments,
  startPlacement,
  answerPlacement,
  applyPlacement,
  assess,
} from '../src/placement';
import { snapshotSchema, type Snapshot } from '../src/sync/schema';
import { mergeSnapshots } from '../src/sync/merge';
import { startConversation, appendMessage, finishConversation } from '../src/conversation/storage';
import { cleanReply } from '../src/conversation/scenarios';
const databases: ProgressDatabase[] = [];
const create = () => {
  const d = new ProgressDatabase(`phase4-${crypto.randomUUID()}`);
  databases.push(d);
  return d;
};
afterEach(async () => {
  await Promise.all(databases.splice(0).map((d) => d.delete()));
});
const course = getCourse('es-from-en'),
  assessment = assessments[0];
describe('placement without invented progress', () => {
  it('resumes, stops at a failed unit, and only unlocks passed units', async () => {
    const db = create();
    let p = await startPlacement(course.id, db);
    expect((await startPlacement(course.id, db)).id).toBe(p.id);
    for (const q of assessment.groups[0].questions)
      p = await answerPlacement(p.id, p.answers.length, q.answers[0], db);
    for (const _q of assessment.groups[1].questions)
      p = await answerPlacement(p.id, p.answers.length, '', db);
    expect(p.completedAt).not.toBeNull();
    expect(p.recommendedUnit).toBe(1);
    await applyPlacement(p.id, db);
    const data = await readData(db);
    expect(data.progress.filter((p) => p.placedAt)).toHaveLength(5);
    expect(data.progress.every((p) => p.earnedXp === 0 && !p.completedAt)).toBe(true);
    expect(data.cards).toHaveLength(0);
    expect(data.events).toHaveLength(0);
    expect(isUnlocked(course.lessons[5], course.id, data.progress)).toBe(true);
    expect(isUnlocked(course.lessons[6], course.id, data.progress)).toBe(false);
    await saveAction(course.id, course.lessons[5].id, 0, { type: 'start' }, db);
  });
  it('requires productive recall even when three recognition answers pass', () => {
    const answers = assessment.groups[0].questions.map((q) => ({
      questionId: q.id,
      text: '',
      correct: q.type !== 'write',
    }));
    expect(assess(assessment, answers)).toEqual({ complete: true, recommendedUnit: 0 });
  });
  it('passes all four groups, preserves completed work, and rejects stale or unfinished submissions', async () => {
    const db = create();
    let p = await startPlacement(course.id, db);
    await expect(applyPlacement(p.id, db)).rejects.toThrow();
    p = await answerPlacement(p.id, 0, assessment.groups[0].questions[0].answers[0], db);
    await expect(answerPlacement(p.id, 0, '', db)).rejects.toThrow();
    for (const q of assessment.groups.flatMap((g) => g.questions).slice(1))
      p = await answerPlacement(p.id, p.answers.length, q.answers[0], db);
    await db.lessons.put({
      ...emptyProgress(course, course.lessons[0]),
      completedAt: '2026-10-01T12:00:00.000Z',
      earnedXp: 60,
    });
    await applyPlacement(p.id, db);
    await applyPlacement(p.id, db);
    const data = await readData(db);
    expect(p.recommendedUnit).toBe(4);
    expect(isUnlocked(course.lessons[20], course.id, data.progress)).toBe(true);
    expect(data.progress.reduce((n, p) => n + p.earnedXp, 0)).toBe(60);
    expect(
      data.progress.find((p) => p.lessonId === course.lessons[0].id)?.completedAt,
    ).toBeTruthy();
  });
});
describe('offline account merge', () => {
  it('preserves both devices’ lessons, events, settings, placement, and is idempotent/commutative', async () => {
    const d = create(),
      base = await readData(d);
    const a = structuredClone(base),
      b = structuredClone(base);
    a.progress.push({
      ...emptyProgress(course, course.lessons[0]),
      completedAt: '2026-10-01T12:00:00.000Z',
      earnedXp: 60,
    });
    b.progress.push({
      ...emptyProgress(course, course.lessons[1]),
      completedAt: '2026-10-02T12:00:00.000Z',
      earnedXp: 60,
    });
    a.events.push({
      id: 'a',
      courseId: course.id,
      kind: 'answer',
      at: '2026-10-01T12:00:00.000Z',
      data: { correct: true },
    });
    b.events.push({
      id: 'b',
      courseId: course.id,
      kind: 'answer',
      at: '2026-10-02T12:00:00.000Z',
      data: { correct: true },
    });
    b.settings = { ...b.settings, dailyGoal: 20, updatedAt: '2026-10-02T12:00:00.000Z' };
    const merged = snapshotSchema.parse(mergeSnapshots(a, b));
    expect(merged.progress).toHaveLength(2);
    expect(merged.events).toHaveLength(2);
    expect(merged.settings.dailyGoal).toBe(20);
    expect(mergeSnapshots(a, b)).toEqual(mergeSnapshots(b, a));
    expect(mergeSnapshots(merged, merged)).toEqual(merged);
  });
  it('keeps completion while another device repeats, and later review state stays whole', async () => {
    const d = create(),
      a = await readData(d),
      b = structuredClone(a);
    const p = emptyProgress(course, course.lessons[0]);
    a.progress = [{ ...p, completedAt: '2026-10-01T12:00:00.000Z', earnedXp: 60 }];
    b.progress = [
      {
        ...p,
        revision: 5,
        run: {
          id: 'repeat',
          cursor: 0,
          startedAt: '2026-10-03T12:00:00.000Z',
          completedAt: null,
          attempts: [],
          hints: [],
          feedback: null,
        },
      },
    ];
    const merged = mergeSnapshots(a, b);
    expect(merged.progress[0].earnedXp).toBe(60);
    expect(merged.progress[0].run?.id).toBe('repeat');
    expect(merged.progress[0].completedAt).toBeTruthy();
  });
  it('isolates account databases and validates corrupted imports', async () => {
    const a = create(),
      b = create();
    await saveSettings({ dailyGoal: 20 }, a);
    expect((await readData(b)).settings.dailyGoal).toBe(10);
    const value = await readData(a);
    value.progress.push({ ...emptyProgress(course, course.lessons[0]), id: 'tampered' });
    expect(() => snapshotSchema.parse(value)).toThrow();
  });
});
describe('conversation durability', () => {
  it('saves a user message before inference, supports reload/retry, and rejects double sends', async () => {
    const db = create(),
      first = await startConversation(course.id, 'cafe', db);
    const sent = await appendMessage(
      first.id,
      first.messages[0].id,
      'Un café, por favor.',
      'user',
      'voice',
      db,
    );
    expect((await readData(db)).conversations[0].messages.at(-1)?.text).toBe('Un café, por favor.');
    await expect(
      appendMessage(first.id, first.messages[0].id, 'Duplicate', 'user', 'text', db),
    ).rejects.toThrow();
    const answered = await appendMessage(
      first.id,
      sent.messages.at(-1)!.id,
      'Claro. ¿Con leche?',
      'assistant',
      'model',
      db,
    );
    expect(answered.messages).toHaveLength(3);
    await finishConversation(first.id, db);
    await finishConversation(first.id, db);
    const data = await readData(db);
    expect(data.events.filter((e) => e.kind === 'conversation')).toHaveLength(1);
    expect(data.conversations[0].completedAt).toBeTruthy();
  });
  it('does not expose model reasoning or accept empty output', () => {
    expect(cleanReply('<think>Hidden reasoning</think>\nHola. ¿Qué tal?')).toBe('Hola. ¿Qué tal?');
    expect(() => cleanReply('<think>unfinished')).toThrow();
    expect(() => cleanReply(' ')).toThrow();
  });
});
