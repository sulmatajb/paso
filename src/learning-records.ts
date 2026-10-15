import { z } from 'zod';
export const placementSchema = z.object({
  id: z.string().max(100),
  courseId: z.string().max(80),
  assessmentId: z.string().max(80),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  answers: z
    .array(z.object({ questionId: z.string(), text: z.string().max(500), correct: z.boolean() }))
    .max(30),
  recommendedUnit: z.number().int().min(0).max(20),
  appliedAt: z.string().datetime().nullable(),
});
export type Placement = z.infer<typeof placementSchema>;
export const messageSchema = z.object({
  id: z.string().max(100),
  role: z.enum(['user', 'assistant']),
  text: z.string().min(1).max(2000),
  at: z.string().datetime(),
  input: z.enum(['voice', 'text', 'model']),
});
export const conversationSchema = z.object({
  id: z.string().max(100),
  courseId: z.string().max(80),
  scenarioId: z.string().max(80),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  model: z.string().max(160),
  messages: z.array(messageSchema).max(26),
});
export type Conversation = z.infer<typeof conversationSchema>;
