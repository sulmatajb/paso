import { z } from 'zod';
export const settingsSchema = z.object({
  updatedAt: z.string().datetime().optional(),
  id: z.literal('settings'),
  schemaVersion: z.literal(1),
  courseId: z.string(),
  voices: z.record(z.string(), z.string()),
  playbackRate: z.number().min(0.5).max(1.5),
  uiLanguage: z.enum(['en', 'es']),
  dailyGoal: z.union([z.literal(5), z.literal(10), z.literal(20)]).default(10),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings = (): Settings => ({
  id: 'settings',
  schemaVersion: 1,
  courseId: 'es-from-en',
  voices: { es: 'ef_dora', en: 'af_heart', fr: 'ff_siwis' },
  playbackRate: 1,
  uiLanguage: 'en',
  dailyGoal: 10,
});
export const reviewSessionSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  mode: z.enum(['due', 'practice', 'mistakes']),
  answer: z.object({ text: z.string(), correct: z.boolean() }).nullable().default(null),
  assisted: z.boolean().default(false),
  queue: z.array(z.string()).min(1),
  cursor: z.number().int().nonnegative(),
  revealed: z.boolean(),
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type ReviewSession = z.infer<typeof reviewSessionSchema>;
