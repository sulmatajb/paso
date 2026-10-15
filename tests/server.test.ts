import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { handleProgress } from '../server/progress';
import { handleInference } from '../server/inference';
import { defaultSettings } from '../src/preferences';
const base = {
  progress: [],
  cards: [],
  sessions: [],
  events: [],
  mistakes: [],
  placements: [],
  conversations: [],
  settings: defaultSettings(),
};
let mf: Miniflare, db: D1Database;
beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    d1Databases: ['DB'],
    compatibilityDate: '2026-05-15',
  });
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  for (const file of ['0000_flaky_doctor_spectrum.sql', '0001_foamy_stryfe.sql'])
    await db.exec((await readFile(`drizzle/${file}`, 'utf8')).replace(/\n/g, ' '));
});
afterAll(async () => {
  await mf?.dispose();
});
const request = (method = 'GET', body?: unknown, origin = 'https://paso.test') =>
  new Request('https://paso.test/api/progress', {
    method,
    headers: { Origin: origin, 'X-Paso-Request': '1', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
describe('authenticated D1 progress boundary', () => {
  it('rejects missing identity and cross-origin writes', async () => {
    expect((await handleProgress(request(), db, null)).status).toBe(401);
    expect(
      (
        await handleProgress(
          request('PUT', { revision: 0, snapshot: base }, 'https://attacker.test'),
          db,
          'alice',
        )
      ).status,
    ).toBe(403);
  });
  it('stores only under trusted identity, isolates users, and rejects stale concurrent revision', async () => {
    expect(
      (await handleProgress(request('PUT', { revision: 0, snapshot: base }), db, 'alice')).status,
    ).toBe(200);
    const alice = (await (await handleProgress(request(), db, 'alice')).json()) as {
      revision: number;
      snapshot: unknown;
    };
    expect(alice.revision).toBe(1);
    expect(await (await handleProgress(request(), db, 'bob')).json()).toMatchObject({
      revision: 0,
      snapshot: null,
    });
    const results = await Promise.all([
      handleProgress(request('PUT', { revision: 1, snapshot: base }), db, 'alice'),
      handleProgress(request('PUT', { revision: 1, snapshot: base }), db, 'alice'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (
        await handleProgress(
          request('PUT', { revision: 0, snapshot: base, userId: 'alice' }),
          db,
          'bob',
        )
      ).status,
    ).toBe(400);
    expect((await handleProgress(request(), db, 'alice')).headers.get('cache-control')).toContain(
      'no-store',
    );
  });
  it('rejects malformed data and oversized bodies without overwriting saved progress', async () => {
    expect(
      (await handleProgress(request('PUT', { revision: 2, snapshot: { bad: true } }), db, 'alice'))
        .status,
    ).toBe(400);
    const large = new Request('https://paso.test/api/progress', {
      method: 'PUT',
      headers: { Origin: 'https://paso.test', 'X-Paso-Request': '1', 'Content-Length': '1800001' },
      body: '{}',
    });
    expect((await handleProgress(large, db, 'alice')).status).toBe(413);
    expect(await (await handleProgress(request(), db, 'alice')).json()).toMatchObject({
      revision: 2,
    });
  });
  it('does not silently call unconfigured inference or accept anonymous model access', async () => {
    const env = { DB: db } as Cloudflare.Env;
    expect((await handleInference(request('POST', {}), env, null, 'chat')).status).toBe(401);
    expect((await handleInference(request('POST', {}), env, 'alice', 'chat')).status).toBe(503);
  });
});

describe('configured model gateway', () => {
  it('validates input, protects the model prompt, strips reasoning, and limits requests per user', async () => {
    const env = {
      DB: db,
      CONVERSATION_URL: 'https://model.example.test/v1/chat/completions',
    } as Cloudflare.Env;
    expect(
      (
        await handleInference(
          request('POST', {
            courseId: 'invalid',
            scenarioId: 'open',
            messages: [{ role: 'user', content: 'Hola' }],
          }),
          env,
          'model-test',
          'chat',
        )
      ).status,
    ).toBe(400);
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '<think>private</think>Hola, ¿qué tal?' } }],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
    try {
      // A new Response for each fetch keeps body consumption realistic.
      fetcher.mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: '<think>private</think>Hola, ¿qué tal?' } }],
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
      );
      const payload = {
        courseId: 'es-from-en',
        scenarioId: 'open',
        messages: [{ role: 'user', content: 'Hola' }],
      };
      const first = await handleInference(request('POST', payload), env, 'model-test', 'chat');
      expect(await first.json()).toEqual({ text: 'Hola, ¿qué tal?' });
      const forwarded = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
      expect(forwarded.messages[0].role).toBe('system');
      expect(forwarded.messages.at(-1)).toEqual(payload.messages[0]);
      for (let i = 1; i < 30; i++)
        expect(
          (await handleInference(request('POST', payload), env, 'model-test', 'chat')).status,
        ).toBe(200);
      expect(
        (await handleInference(request('POST', payload), env, 'model-test', 'chat')).status,
      ).toBe(429);
      expect(fetcher).toHaveBeenCalledTimes(30);
    } finally {
      fetcher.mockRestore();
    }
  });
});
