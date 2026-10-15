import type { Snapshot } from './schema';
// A deterministic union preserves independent offline work. Lesson completion is
// monotonic; a simultaneous card review keeps one complete, latest FSRS state.
function later<T>(a: T, b: T, time: (v: T) => string): T {
  const order = time(a).localeCompare(time(b));
  return order > 0 ? a : order < 0 ? b : JSON.stringify(a) > JSON.stringify(b) ? a : b;
}
function union<T extends { id: string }>(a: T[], b: T[], merge: (a: T, b: T) => T): T[] {
  const rows = new Map(a.map((r) => [r.id, r]));
  for (const r of b) rows.set(r.id, rows.has(r.id) ? merge(rows.get(r.id)!, r) : r);
  return [...rows.values()].sort((x, y) => x.id.localeCompare(y.id));
}
const first = (a: string | null | undefined, b: string | null | undefined) =>
  [a, b].filter((x): x is string => !!x).sort()[0] ?? null;
export function mergeSnapshots(a: Snapshot, b: Snapshot): Snapshot {
  return {
    progress: union(a.progress, b.progress, (x, y) => {
      const chosen =
        x.run?.id === y.run?.id
          ? x.revision > y.revision
            ? x
            : y.revision > x.revision
              ? y
              : later(x, y, (p) => JSON.stringify(p.run))
          : later(x, y, (p) => p.run?.startedAt ?? '');
      return {
        ...chosen,
        earnedXp: Math.max(x.earnedXp, y.earnedXp) as 0 | 60,
        completedAt: first(x.completedAt, y.completedAt),
        placedAt: first(x.placedAt, y.placedAt) ?? undefined,
      };
    }),
    cards: union(a.cards, b.cards, (x, y) => later(x, y, (c) => c.memory.last_review ?? '')),
    sessions: union(a.sessions, b.sessions, (x, y) =>
      x.revision > y.revision
        ? x
        : y.revision > x.revision
          ? y
          : later(x, y, (s) => s.completedAt ?? s.createdAt),
    ),
    settings: later(a.settings, b.settings, (s) => s.updatedAt ?? ''),
    events: union(a.events, b.events, (x, y) => later(x, y, (e) => e.at)),
    mistakes: union(a.mistakes, b.mistakes, (x, y) => {
      const latest = x.lastWrongAt > y.lastWrongAt ? x : y;
      const resolved =
        [x.resolvedAt, y.resolvedAt]
          .filter((s): s is string => !!s)
          .sort()
          .at(-1) ?? null;
      return {
        ...latest,
        count: Math.max(x.count, y.count),
        resolvedAt: resolved && resolved >= latest.lastWrongAt ? resolved : null,
      };
    }),
    placements: union(a.placements, b.placements, (x, y) =>
      later(
        x,
        y,
        (p) =>
          p.appliedAt ??
          p.completedAt ??
          `${p.startedAt}:${String(p.answers.length).padStart(3, '0')}`,
      ),
    ),
    conversations: union(a.conversations, b.conversations, (x, y) => {
      const chosen = later(x, y, (c) => c.updatedAt);
      return {
        ...chosen,
        messages: union(x.messages, y.messages, (m, n) => later(m, n, (v) => v.at))
          .sort((m, n) => m.at.localeCompare(n.at) || m.id.localeCompare(n.id))
          .slice(0, 26),
        completedAt: first(x.completedAt, y.completedAt),
      };
    }),
  };
}
