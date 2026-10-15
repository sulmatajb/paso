import { describe, it, expect, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {
  ProgressDatabase,
  saveAction,
  readData,
  startReview,
  answerReview,
  revealReview,
  rateReview,
  saveSpeaking,
  saveSettings,
  defaultSettings,
} from '../src/storage';
import { getCourse } from '../src/content/catalog';
import { newCards, Rating } from '../src/review';
import { emptyProgress } from '../src/engine';
import { activity, dayKey } from '../src/activity';
import { normalizeSpeech, speechMatches, comparedWords } from '../src/speech/matching';
import { resample, beginRecording } from '../src/speech/recorder';
const course = getCourse('es-from-en'),
  lesson = course.lessons[0],
  now = new Date('2026-10-14T12:00:00Z'),
  dbs: ProgressDatabase[] = [];
function database() {
  const d = new ProgressDatabase(crypto.randomUUID());
  dbs.push(d);
  return d;
}
afterEach(async () => {
  for (const d of dbs) await d.delete();
  dbs.length = 0;
  vi.unstubAllGlobals();
});
describe('recall and honest progress', () => {
  it('records a mistaken phrase and only clears it after unassisted recall', async () => {
    const d = database();
    let p = await saveAction(course.id, lesson.id, 0, { type: 'start' }, d, now);
    p = await saveAction(
      course.id,
      lesson.id,
      p.revision,
      { type: 'answer', answer: 'Gracias' },
      d,
      now,
    );
    expect((await readData(d)).mistakes[0].resolvedAt).toBeNull();
    let s = (await startReview(course.id, 'mistakes', d, now))!;
    s = await answerReview(s.id, s.revision, 'incorrect', d);
    d.close();
    await d.open();
    expect((await readData(d)).sessions[0].answer?.correct).toBe(false);
    let card = (await d.cards.get(s.queue[0]))!;
    await rateReview(s.id, s.revision, card.revision, Rating.Easy, d, now);
    expect((await d.events.get(`${s.id}:0`))?.data).toMatchObject({ rating: Rating.Again });
    expect((await readData(d)).mistakes[0].resolvedAt).toBeNull();
    s = (await startReview(course.id, 'mistakes', d, now))!;
    s = await answerReview(s.id, s.revision, '¡Hola!', d);
    card = (await d.cards.get(s.queue[0]))!;
    await rateReview(s.id, s.revision, card.revision, Rating.Good, d, now);
    expect((await readData(d)).mistakes[0].resolvedAt).toBe(now.toISOString());
    expect(await startReview(course.id, 'mistakes', d, now)).toBeNull();
  });
  it('treats showing an answer as assisted, limits batches and retains practice schedules', async () => {
    const d = database();
    await d.cards.bulkPut(course.lessons.slice(0, 3).flatMap((l) => newCards(course, l, now)));
    let s = (await startReview(course.id, 'due', d, now))!;
    expect(s.queue).toHaveLength(10);
    s = await revealReview(s.id, s.revision, d);
    const card = (await d.cards.get(s.queue[0]))!;
    await rateReview(s.id, s.revision, card.revision, Rating.Easy, d, now);
    expect((await d.events.get(`${s.id}:0`))?.data).toMatchObject({
      rating: Rating.Again,
      assisted: true,
    });
    const before = await d.cards.toArray();
    let free = (await startReview(course.id, 'practice', d, now))!;
    expect(free.mode).toBe('practice');
    free = await answerReview(free.id, free.revision, 'wrong', d);
    const c = (await d.cards.get(free.queue[0]))!;
    await rateReview(free.id, free.revision, c.revision, Rating.Again, d, now);
    expect(await d.cards.toArray()).toEqual(before);
  });
  it('migrates phase-two sessions and settings without clearing progress', async () => {
    const name = crypto.randomUUID(),
      old = new Dexie(name);
    old.version(2).stores({
      progress: 'id',
      lessons: 'id,courseId,lessonId',
      cards: 'id,courseId,lessonId,memory.due',
      settings: 'id',
      sessions: 'id,courseId',
      events: 'id,courseId,kind,at',
    });
    await old.table('lessons').put(emptyProgress(course, lesson));
    const cards = newCards(course, lesson, now);
    await old.table('cards').bulkPut(cards);
    const { dailyGoal, ...legacySettings } = defaultSettings();
    void dailyGoal;
    await old.table('settings').put(legacySettings);
    await old.table('sessions').put({
      id: 'legacy',
      courseId: course.id,
      mode: 'due',
      queue: cards.map((c) => c.id),
      cursor: 0,
      revealed: true,
      revision: 3,
      createdAt: now.toISOString(),
      completedAt: null,
    });
    old.close();
    const d = new ProgressDatabase(name);
    dbs.push(d);
    const data = await readData(d);
    expect(data.progress).toHaveLength(1);
    expect(data.sessions[0]).toMatchObject({
      id: 'legacy',
      revision: 3,
      revealed: true,
      answer: null,
    });
    expect(data.settings.dailyGoal).toBe(10);
    expect(data.mistakes).toEqual([]);
  });
  it('saves only confirmed transcript metadata and excludes assisted answers from speaking activity', async () => {
    const d = database();
    await saveSpeaking(course.id, lesson.id, 'name', 'Me llamo Alex', false, d, now);
    await saveSpeaking(course.id, lesson.id, 'name', 'Me llamo Alex', true, d, now);
    const data = await readData(d);
    expect(activity(data.events, now).today).toBe(1);
    expect(JSON.stringify(data.events)).not.toMatch(/audio|blob|base64/);
    expect(data.events[0].data).toMatchObject({ text: 'Me llamo Alex', correct: true });
    await expect(
      saveSpeaking(
        course.id,
        course.lessons[4].id,
        course.lessons[4].phrases[0].id,
        'test',
        false,
        d,
        now,
      ),
    ).rejects.toThrow();
    await saveSettings({ dailyGoal: 20 }, d);
    expect((await readData(d)).settings.dailyGoal).toBe(20);
  });
  it('counts one correct answer per exercise run and calendar days rather than 24-hour windows', () => {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const events = [
      {
        id: '1',
        courseId: course.id,
        sessionId: 'run',
        kind: 'answer',
        at: now.toISOString(),
        data: { correct: true, exerciseId: 'x' },
      },
      {
        id: '2',
        courseId: course.id,
        sessionId: 'run',
        kind: 'answer',
        at: now.toISOString(),
        data: { correct: true, exerciseId: 'x' },
      },
      {
        id: '3',
        courseId: course.id,
        sessionId: 'yesterday',
        kind: 'answer',
        at: yesterday.toISOString(),
        data: { correct: true, exerciseId: 'x' },
      },
    ];
    expect(activity(events, now)).toMatchObject({ today: 1, streak: 2 });
    expect(dayKey(now)).toMatch(/^2026-10-14$/);
  });
});
describe('speech matching and audio conversion', () => {
  it('accepts recognition punctuation, accents and small numerals without accepting missing words or ñ substitutions', () => {
    expect(speechMatches('Son las 8.', ['Son las ocho.'], 'es')).toBe(true);
    expect(
      speechMatches('Quisiera un cafe por favor', ['Quisiera un café, por favor.'], 'es'),
    ).toBe(true);
    expect(speechMatches('Quisiera café', ['Quisiera un café, por favor.'], 'es')).toBe(false);
    expect(normalizeSpeech('año', 'es')).not.toBe(normalizeSpeech('ano', 'es'));
    expect(speechMatches('', ['Hola'], 'es')).toBe(false);
    expect(comparedWords('Me Alex', 'Me llamo Alex', 'es').map((w) => w.matched)).toEqual([
      true,
      false,
      true,
    ]);
  });
  it('converts microphone PCM to 16 kHz without changing duration or constant amplitude', () => {
    const source = new Float32Array(48000).fill(0.2),
      result = resample(source, 48000);
    expect(result).toHaveLength(16000);
    expect(result[8000]).toBeCloseTo(0.2, 5);
    expect(resample(new Float32Array(8000).fill(0.4), 8000)).toHaveLength(16000);
  });
});

it('releases microphone tracks when the recorder cannot start', async () => {
  const stop = vi.fn();
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) },
  });
  class FailedRecorder {
    start() {
      throw new DOMException('Recording unavailable', 'NotAllowedError');
    }
  }
  vi.stubGlobal('window', { MediaRecorder: FailedRecorder });
  vi.stubGlobal('MediaRecorder', FailedRecorder);
  await expect(beginRecording(() => {})).rejects.toThrow('Recording unavailable');
  expect(stop).toHaveBeenCalledOnce();
});
