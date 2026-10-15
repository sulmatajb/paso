import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const learnerProgress = sqliteTable('learner_progress', {
  userId: text('user_id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  snapshot: text('snapshot').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const modelUsage = sqliteTable('model_usage', {
  userId: text('user_id').primaryKey(),
  windowStart: integer('window_start').notNull(),
  requests: integer('requests').notNull().default(0),
});
