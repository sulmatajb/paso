import { describe, expect, it, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {
  correctAnswer,
  emptyProgress,
  firstTryCount,
  grade,
  isUnlocked,
  normalize,
  transition,
  type Answer,
} from '../src/engine';
import { courses, getCourse } from '../src/content/catalog';
import { validateCourse, type Exercise, type Lesson } from '../src/content/schema';
import {
  readData,
  ProgressDatabase,
  saveAction,
  startReview,
  revealReview,
  rateReview,
  StaleProgressError,
} from '../src/storage';
import { dueCards, newCards, schedule, Rating } from '../src/review';
const course = getCourse('es-from-en'),
  lesson = course.lessons[0];
const time = new Date('2026-10-14T12:00:00Z');
function answer(e: Exercise): Answer {
  if (e.type === 'choice' || e.type === 'dialogue' || e.type === 'order') return e.answer;
  if (e.type === 'write' || e.type === 'listen' || e.type === 'speak') return e.answers[0];
  return Object.fromEntries(e.pairs.map((p) => [p.left, p.right]));
}
const databases: ProgressDatabase[] = [];
function database() {
  const d = new ProgressDatabase(crypto.randomUUID());
  databases.push(d);
  return d;
}
afterEach(async () => {
  for (const d of databases) await d.delete();
  databases.length = 0;
});
async function complete(d: ProgressDatabase, l: Lesson = lesson) {
  let p = await saveAction(
    course.id,
    l.id,
    (await d.lessons.get(`${course.id}:${l.id}`))?.revision ?? 0,
    { type: 'start' },
    d,
    time,
  );
  for (const e of l.exercises) {
    p = await saveAction(
      course.id,
      l.id,
      p.revision,
      { type: 'answer', answer: answer(e) },
      d,
      time,
    );
    p = await saveAction(course.id, l.id, p.revision, { type: 'continue' }, d, time);
  }
  return p;
}
describe('course packages and grading', () => {
  it('validates all courses and all 324 exercises, including listening', () => {
    expect(courses.flatMap((c) => c.lessons.flatMap((l) => l.exercises))).toHaveLength(324);
    for (const c of courses) {
      expect(validateCourse(c)).toEqual(c);
      for (const l of c.lessons)
        for (const e of l.exercises) {
          expect(grade(e, answer(e), c.targetLanguage), e.id).toBe(true);
          expect(grade(e, '', c.targetLanguage)).toBe(false);
          expect(correctAnswer(e)).toBeTruthy();
        }
    }
  });
  it('rejects broken prerequisites and orphan phrase references', () => {
    const bad = structuredClone(course);
    bad.lessons[0].prerequisites = ['missing'];
    expect(() => validateCourse(bad)).toThrow();
    bad.lessons[0].prerequisites = [];
    bad.lessons[0].exercises[0].phraseId = 'missing';
    expect(() => validateCourse(bad)).toThrow();
  });
  it('normalizes punctuation and French apostrophes while retaining meaningful accents', () => {
    expect(normalize('  ¡HOLA! ', 'es')).toBe('hola');
    expect(normalize('días', 'es')).toBe(normalize('días', 'es'));
    expect(normalize('si', 'es')).not.toBe(normalize('sí', 'es'));
    expect(normalize('J’ai un café.', 'fr')).toBe(normalize("J'ai un café", 'fr'));
  });
  it('requires a correct answer and tracks first attempt hints without duplicate submissions', () => {
    let p = transition(emptyProgress(course, lesson), { type: 'start' }, lesson, 'es');
    p = transition(p, { type: 'answer', answer: 'incorrect' }, lesson, 'es');
    expect(transition(p, { type: 'continue' }, lesson, 'es')).toEqual(p);
    expect(
      transition(p, { type: 'answer', answer: answer(lesson.exercises[0]) }, lesson, 'es'),
    ).toEqual(p);
    p = transition(p, { type: 'retry' }, lesson, 'es');
    p = transition(p, { type: 'hint' }, lesson, 'es');
    p = transition(p, { type: 'answer', answer: answer(lesson.exercises[0]) }, lesson, 'es');
    expect(firstTryCount(p, lesson)).toBe(0);
    expect(transition(p, { type: 'continue' }, lesson, 'es').run?.cursor).toBe(1);
  });
});
describe('saved progression and migrations', () => {
  it('enforces prerequisites in storage and completes all 25 lessons with 1500 XP and 190 cards', async () => {
    const d = database();
    await expect(
      saveAction(course.id, course.lessons[1].id, 0, { type: 'start' }, d, time),
    ).rejects.toThrow('previous lesson');
    for (const l of course.lessons) await complete(d, l);
    const data = await readData(d);
    expect(data.progress.reduce((n, p) => n + p.earnedXp, 0)).toBe(1500);
    expect(data.cards).toHaveLength(190);
    expect(data.progress.every((p) => !!p.completedAt)).toBe(true);
    await complete(d);
    expect((await readData(d)).cards).toHaveLength(190);
    expect((await readData(d)).progress.reduce((n, p) => n + p.earnedXp, 0)).toBe(1500);
    expect(await d.events.where('kind').equals('answer').count()).toBe(312);
  });
  it('saves feedback across reopen, rejects stale tabs, and isolates courses', async () => {
    const d = database();
    let p = await saveAction(course.id, lesson.id, 0, { type: 'start' }, d, time);
    const results = await Promise.allSettled([
      saveAction(course.id, lesson.id, p.revision, { type: 'answer', answer: 'Hola' }, d, time),
      saveAction(course.id, lesson.id, p.revision, { type: 'hint' }, d, time),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason,
    ).toBeInstanceOf(StaleProgressError);
    d.close();
    await d.open();
    p = (await readData(d)).progress[0];
    expect(p.run?.feedback?.correct).toBe(true);
    expect(isUnlocked(course.lessons[1], course.id, [p])).toBe(false);
    const fr = getCourse('fr-from-en');
    const other = await saveAction(fr.id, fr.lessons[0].id, 0, { type: 'start' }, d, time);
    expect(other.run?.cursor).toBe(0);
    expect((await readData(d)).progress).toHaveLength(2);
  });
  it('migrates completed phase-one progress without losing XP, attempts, or its backup', async () => {
    const name = crypto.randomUUID(),
      old = new Dexie(name);
    old.version(1).stores({ progress: 'id' });
    let p = emptyProgress(course, lesson);
    p = transition(p, { type: 'start' }, lesson, 'es');
    for (const e of lesson.exercises) {
      p = transition(p, { type: 'answer', answer: answer(e) }, lesson, 'es');
      p = transition(p, { type: 'continue' }, lesson, 'es');
    }
    await old.table('progress').put({
      id: lesson.id,
      schemaVersion: 1,
      courseVersion: 1,
      revision: p.revision,
      earnedXp: p.earnedXp,
      completedAt: p.completedAt,
      run: p.run,
    });
    old.close();
    const d = new ProgressDatabase(name);
    databases.push(d);
    const data = await readData(d);
    expect(data.progress[0].earnedXp).toBe(60);
    expect(data.progress[0].run?.attempts).toHaveLength(12);
    expect(data.cards).toHaveLength(6);
    expect((await d.progress.get(lesson.id))?.schemaVersion).toBe(1);
    expect(isUnlocked(course.lessons[1], course.id, data.progress)).toBe(true);
  });
  it('preserves incompatible data and reports an error', async () => {
    const d = database();
    await d.lessons.put({ ...emptyProgress(course, lesson), courseVersion: 99 });
    await expect(readData(d)).rejects.toThrow();
    expect((await d.lessons.toArray())[0].courseVersion).toBe(99);
  });
});
describe('FSRS and durable review', () => {
  it('schedules remembered phrases later, persists learning steps, and makes them due after time advances', () => {
    const c = newCards(course, lesson, time)[0],
      again = schedule(c, Rating.Again, time).card,
      easy = schedule(c, Rating.Easy, time).card;
    expect(new Date(easy.memory.due).getTime()).toBeGreaterThan(
      new Date(again.memory.due).getTime(),
    );
    expect(easy.memory.reps).toBe(1);
    expect(dueCards([easy], course.id, time)).toHaveLength(0);
    expect(dueCards([easy], course.id, new Date(easy.memory.due))).toHaveLength(1);
    expect(schedule(easy, Rating.Good, new Date(easy.memory.due)).card.memory.reps).toBe(2);
  });
  it('resumes a revealed session and atomically rates each card only once', async () => {
    const d = database();
    await complete(d);
    let s = (await startReview(course.id, 'due', d, time))!;
    const card = (await d.cards.get(s.queue[0]))!;
    await expect(rateReview(s.id, s.revision, card.revision, Rating.Easy, d, time)).rejects.toThrow(
      'Reveal',
    );
    s = await revealReview(s.id, s.revision, d);
    d.close();
    await d.open();
    expect((await startReview(course.id, 'due', d, time))?.revealed).toBe(true);
    const results = await Promise.allSettled([
      rateReview(s.id, s.revision, card.revision, Rating.Easy, d, time),
      rateReview(s.id, s.revision, card.revision, Rating.Again, d, time),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await d.cards.get(card.id))?.memory.reps).toBe(1);
    expect(await d.events.where('kind').equals('review').count()).toBe(1);
    expect((await d.sessions.get(s.id))?.cursor).toBe(1);
  });
  it('finishes the due queue and practices ahead without modifying the schedule', async () => {
    const d = database();
    await complete(d);
    let s = (await startReview(course.id, 'due', d, time))!;
    while (!s.completedAt) {
      s = await revealReview(s.id, s.revision, d);
      const card = (await d.cards.get(s.queue[s.cursor]))!;
      s = await rateReview(s.id, s.revision, card.revision, Rating.Easy, d, time);
    }
    expect(await startReview(course.id, 'due', d, time)).toBeNull();
    const before = await d.cards.toArray();
    let practice = (await startReview(course.id, 'practice', d, time))!;
    practice = await revealReview(practice.id, practice.revision, d);
    const card = (await d.cards.get(practice.queue[0]))!;
    await rateReview(practice.id, practice.revision, card.revision, Rating.Again, d, time);
    expect(await d.cards.toArray()).toEqual(before);
  });
});
