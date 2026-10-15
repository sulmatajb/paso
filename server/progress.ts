import { syncRequestSchema } from '../src/sync/schema';
export const privateHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
  'Content-Type': 'application/json; charset=utf-8',
};
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: privateHeaders });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  return (
    origin === new URL(request.url).origin &&
    request.headers.get('X-Paso-Request') === '1' &&
    request.headers.get('Sec-Fetch-Site') !== 'cross-site'
  );
}
export async function handleProgress(request: Request, db: D1Database, userId: string | null) {
  if (!userId) return json({ error: 'Sign in to sync progress.' }, 401);
  if (request.method === 'GET') {
    const row = await db
      .prepare('SELECT revision, snapshot, updated_at FROM learner_progress WHERE user_id = ?')
      .bind(userId)
      .first<{ revision: number; snapshot: string; updated_at: string }>();
    return json(
      row
        ? { revision: row.revision, snapshot: JSON.parse(row.snapshot), updatedAt: row.updated_at }
        : { revision: 0, snapshot: null, updatedAt: null },
    );
  }
  if (!sameOrigin(request)) return json({ error: 'This request must come from Paso.' }, 403);
  if (request.method === 'DELETE') {
    await db.prepare('DELETE FROM learner_progress WHERE user_id = ?').bind(userId).run();
    return json({ deleted: true });
  }
  if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
  // Keep metadata plus the snapshot below D1’s 2,000,000-byte row limit.
  const MAX = 1_800_000;
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX)
    return json(
      { error: 'Progress archive is too large. Export a backup and contact the host.' },
      413,
    );
  // Bound streamed bodies too; Content-Length is not trusted.
  const reader = request.body?.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  if (!reader) return json({ error: 'Missing progress' }, 400);
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > MAX) {
      await reader.cancel();
      return json({ error: 'Progress archive is too large.' }, 413);
    }
    chunks.push(part.value);
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  let input;
  try {
    input = syncRequestSchema.parse(JSON.parse(new TextDecoder().decode(body)));
  } catch {
    return json({ error: 'Invalid progress data. Local progress has not been changed.' }, 400);
  }
  const now = new Date().toISOString(),
    value = JSON.stringify(input.snapshot);
  const result =
    input.revision === 0
      ? await db
          .prepare(
            'INSERT INTO learner_progress (user_id, revision, snapshot, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(user_id) DO NOTHING',
          )
          .bind(userId, value, now)
          .run()
      : await db
          .prepare(
            'UPDATE learner_progress SET revision = revision + 1, snapshot = ?, updated_at = ? WHERE user_id = ? AND revision = ?',
          )
          .bind(value, now, userId, input.revision)
          .run();
  if (!result.meta.changes)
    return json({ error: 'Progress changed on another device. Merge and retry.' }, 409);
  return json({ revision: input.revision + 1, updatedAt: now });
}
