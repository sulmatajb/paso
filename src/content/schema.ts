import { z } from 'zod';

const base = {
  id: z.string().min(1),
  title: z.string(),
  instruction: z.string(),
  hint: z.string(),
  explanation: z.string(),
  phraseId: z.string(),
};
export const exerciseSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('choice'),
    options: z.array(z.string()).min(2),
    answer: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal('order'),
    tokens: z.array(z.string()).min(2),
    answer: z.array(z.string()),
  }),
  z.object({ ...base, type: z.literal('write'), answers: z.array(z.string()).min(1) }),
  z.object({ ...base, type: z.literal('listen'), answers: z.array(z.string()).min(1) }),
  z.object({ ...base, type: z.literal('speak'), answers: z.array(z.string()).min(1) }),
  z.object({
    ...base,
    type: z.literal('dialogue'),
    turns: z.array(z.object({ speaker: z.string(), phraseId: z.string() })).min(1),
    options: z.array(z.string()).min(2),
    answer: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal('match'),
    pairs: z.array(z.object({ left: z.string(), right: z.string() })).min(2),
  }),
]);
export const phraseSchema = z.object({
  id: z.string(),
  target: z.string(),
  translation: z.string(),
  note: z.string(),
  acceptedAnswers: z.array(z.string()).optional(),
});
export const lessonSchema = z.object({
  unitId: z.string().optional(),
  id: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  subtitle: z.string(),
  estimatedMinutes: z.number().positive(),
  prerequisites: z.array(z.string()),
  phrases: z.array(phraseSchema).min(1),
  exercises: z.array(exerciseSchema).min(1),
});
export const courseSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string(),
  version: z.number().int().positive(),
  sourceLanguage: z.string().min(2),
  targetLanguage: z.string().min(2),
  title: z.string(),
  description: z.string(),
  unit: z.object({ id: z.string(), title: z.string(), description: z.string() }),
  units: z
    .array(z.object({ id: z.string(), title: z.string(), description: z.string() }))
    .optional(),
  lessons: z.array(lessonSchema).min(1),
  license: z.string(),
});
export type Exercise = z.infer<typeof exerciseSchema>;
export type Phrase = z.infer<typeof phraseSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type Course = z.infer<typeof courseSchema>;

export function validateCourse(input: unknown): Course {
  const course = courseSchema.parse(input);
  const seen = new Set<string>();
  for (const lesson of course.lessons) {
    if (seen.has(lesson.id)) throw new Error(`Duplicate lesson: ${lesson.id}`);
    if (lesson.prerequisites.some((id) => !seen.has(id)))
      throw new Error(`Prerequisites must precede ${lesson.id}`);
    seen.add(lesson.id);
    if (new Set(lesson.phrases.map((p) => p.id)).size !== lesson.phrases.length)
      throw new Error(`Duplicate phrase: ${lesson.id}`);
    if (new Set(lesson.exercises.map((e) => e.id)).size !== lesson.exercises.length)
      throw new Error(`Duplicate exercise: ${lesson.id}`);
    if (lesson.unitId && !(course.units ?? [course.unit]).some((u) => u.id === lesson.unitId))
      throw new Error(`Unknown unit: ${lesson.unitId}`);
    for (const exercise of lesson.exercises) {
      if (
        exercise.type === 'dialogue' &&
        exercise.turns.some((turn) => !lesson.phrases.some((p) => p.id === turn.phraseId))
      )
        throw new Error(`Unknown dialogue phrase: ${exercise.id}`);
      if (
        (exercise.type === 'listen' || exercise.type === 'speak') &&
        !exercise.answers.includes(
          lesson.phrases.find((p) => p.id === exercise.phraseId)?.target ?? '',
        )
      )
        throw new Error(`Speech answer must accept its audio text: ${exercise.id}`);
      if (!lesson.phrases.some((p) => p.id === exercise.phraseId))
        throw new Error(`Unknown phrase: ${exercise.phraseId}`);
      if (
        (exercise.type === 'choice' || exercise.type === 'dialogue') &&
        (!exercise.options.includes(exercise.answer) ||
          new Set(exercise.options).size !== exercise.options.length)
      )
        throw new Error(`Invalid choice: ${exercise.id}`);
      if (
        exercise.type === 'order' &&
        [...exercise.tokens].sort().join('|') !== [...exercise.answer].sort().join('|')
      )
        throw new Error(`Invalid tokens: ${exercise.id}`);
      if (
        exercise.type === 'match' &&
        (new Set(exercise.pairs.map((p) => p.left)).size !== exercise.pairs.length ||
          new Set(exercise.pairs.map((p) => p.right)).size !== exercise.pairs.length)
      )
        throw new Error(`Ambiguous pairs: ${exercise.id}`);
    }
  }
  return course;
}
