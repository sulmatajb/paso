import type { LearningEvent } from './storage';
export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function activity(events: LearningEvent[], now = new Date()) {
  const daily = new Map<string, Set<string>>();
  for (const e of events) {
    const data = e.data as {
      correct?: boolean;
      exerciseId?: string;
      rating?: number;
      assisted?: boolean;
      answer?: { correct: boolean };
    };
    const counts =
      (e.kind === 'answer' && data.correct) ||
      (e.kind === 'speaking' && data.correct && !data.assisted) ||
      (['review', 'practice'].includes(e.kind) && data.answer?.correct && !data.assisted);
    if (!counts) continue;
    const date = new Date(e.at);
    if (Number.isNaN(date.getTime())) continue;
    const day = dayKey(date),
      id = e.kind === 'answer' ? `${e.sessionId}:${data.exerciseId}` : e.id;
    if (!daily.has(day)) daily.set(day, new Set());
    daily.get(day)!.add(id);
  }
  let streak = 0;
  const cursor = new Date(now);
  if (!daily.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (daily.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (6 - i));
    return { date, done: daily.has(dayKey(date)), count: daily.get(dayKey(date))?.size ?? 0 };
  });
  return { today: daily.get(dayKey(now))?.size ?? 0, streak, week };
}
