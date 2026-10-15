import { z } from 'zod';
import spanish from './content/placement/es-en.json';
import { db } from './storage';
import { getCourse } from './content/catalog';
import { emptyProgress, normalize, progressId } from './engine';
import { placementSchema, type Placement } from './learning-records';
const questionSchema = z.object({
  id: z.string(),
  type: z.enum(['choice', 'write', 'listen']),
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  answers: z.array(z.string()).min(1),
  explanation: z.string(),
  clipKey: z.string().optional(),
});
const assessmentSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  title: z.string(),
  description: z.string(),
  groups: z.array(z.object({ unitId: z.string(), questions: z.array(questionSchema) })),
});
export const assessments = [assessmentSchema.parse(spanish)];
export type Assessment = (typeof assessments)[number];
export type PlacementQuestion = z.infer<typeof questionSchema>;
export function currentQuestion(record: Placement, assessment: Assessment) {
  return assessment.groups.flatMap((g) => g.questions)[record.answers.length];
}
export function assess(assessment: Assessment, answers: Placement['answers']) {
  let recommendedUnit = 0,
    complete = false;
  for (const group of assessment.groups) {
    const results = group.questions.map((q) => answers.find((a) => a.questionId === q.id));
    if (results.some((x) => !x)) return { recommendedUnit, complete: false };
    const passed =
      results.filter((r) => r?.correct).length >= 3 &&
      group.questions.every((q, i) => q.type !== 'write' || results[i]?.correct);
    if (!passed) {
      complete = true;
      break;
    }
    recommendedUnit++;
  }
  return { recommendedUnit, complete: complete || recommendedUnit === assessment.groups.length };
}
export async function startPlacement(courseId: string, database = db) {
  const assessment = assessments.find((a) => a.courseId === courseId);
  if (!assessment) throw Error('Placement is unavailable for this starter course.');
  const unfinished = (await database.placements.where('courseId').equals(courseId).toArray()).find(
    (p) => !p.completedAt,
  );
  if (unfinished) return unfinished;
  const record: Placement = {
    id: crypto.randomUUID(),
    courseId,
    assessmentId: assessment.id,
    startedAt: new Date().toISOString(),
    completedAt: null,
    answers: [],
    recommendedUnit: 0,
    appliedAt: null,
  };
  await database.placements.add(record);
  return record;
}
export async function answerPlacement(id: string, index: number, text: string, database = db) {
  return database.transaction('rw', database.placements, async () => {
    const record = placementSchema.parse(await database.placements.get(id));
    if (record.completedAt || record.answers.length !== index)
      throw Error('Placement changed in another tab.');
    const assessment = assessments.find((a) => a.id === record.assessmentId)!;
    const question = currentQuestion(record, assessment);
    if (!question) throw Error('No question available');
    const correct = question.answers.some((a) => normalize(a, 'es') === normalize(text, 'es'));
    const answers = [
      ...record.answers,
      { questionId: question.id, text: text.slice(0, 500), correct },
    ];
    const result = assess(assessment, answers);
    const next = {
      ...record,
      answers,
      recommendedUnit: result.recommendedUnit,
      completedAt: result.complete ? new Date().toISOString() : null,
    };
    await database.placements.put(next);
    return next;
  });
}
export async function applyPlacement(id: string, database = db) {
  return database.transaction('rw', [database.placements, database.lessons], async () => {
    const record = placementSchema.parse(await database.placements.get(id));
    if (!record.completedAt) throw Error('Finish the check first.');
    const assessment = assessments.find((a) => a.id === record.assessmentId)!;
    const result = assess(assessment, record.answers);
    if (!result.complete || result.recommendedUnit !== record.recommendedUnit)
      throw Error('Placement result is inconsistent.');
    const course = getCourse(record.courseId),
      units = course.units ?? [course.unit],
      at = new Date().toISOString();
    const skipped = new Set(units.slice(0, record.recommendedUnit).map((u) => u.id));
    for (const lesson of course.lessons.filter((l) => skipped.has(l.unitId ?? course.unit.id))) {
      const old = await database.lessons.get(progressId(course.id, lesson.id));
      if (!old?.completedAt && !old?.placedAt)
        await database.lessons.put({ ...(old ?? emptyProgress(course, lesson)), placedAt: at });
    }
    await database.placements.put({ ...record, appliedAt: at });
  });
}
