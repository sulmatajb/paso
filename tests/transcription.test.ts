import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { Miniflare } from 'miniflare';
import { handleTranscription, validSpeechWav } from '../server/transcription';
import { wavBlob } from '../src/speech/wav';
let mf: Miniflare, db: D1Database, wav: Uint8Array;
const host = 'https://paso.test';
const request = (data: Uint8Array = wav, extra: Record<string, string> = {}, query = 'es') =>
  new Request(`${host}/api/transcription?language=${query}`, {
    method: 'POST',
    headers: { Origin: host, 'X-Paso-Request': '1', 'Content-Type': 'audio/wav', ...extra },
    body: data as BodyInit,
  });
const env = () =>
  ({
    DB: db,
    TRANSCRIPTION_URL: 'https://speech.example.test/v1/audio/transcriptions',
    TRANSCRIPTION_API_KEY: 'test-only-key',
  }) as Cloudflare.Env;
beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    d1Databases: ['DB'],
    compatibilityDate: '2026-05-15',
  });
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  await db.exec(
    'CREATE TABLE model_usage (user_id TEXT PRIMARY KEY, window_start INTEGER NOT NULL, requests INTEGER NOT NULL)',
  );
  wav = new Uint8Array(await wavBlob(new Float32Array(16000), 16000).arrayBuffer());
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => mf?.dispose());
describe('server speech recognition boundary', () => {
  it('requires identity, same origin, configured service, language and WAV content type', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    expect((await handleTranscription(request(), env(), null)).status).toBe(401);
    expect(
      (await handleTranscription(request(wav, { Origin: 'https://evil.test' }), env(), 'u')).status,
    ).toBe(403);
    expect((await handleTranscription(request(), { DB: db } as Cloudflare.Env, 'u')).status).toBe(
      503,
    );
    expect((await handleTranscription(request(wav, {}, 'xx'), env(), 'u')).status).toBe(400);
    expect(
      (await handleTranscription(request(wav, { 'Content-Type': 'text/plain' }), env(), 'u'))
        .status,
    ).toBe(415);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('checks real bytes even without Content-Length and rejects malformed/long recordings', async () => {
    expect(validSpeechWav(wav)).toBe(true);
    const stereo = wav.slice();
    new DataView(stereo.buffer).setUint16(22, 2, true);
    const rate = wav.slice();
    new DataView(rate.buffer).setUint32(24, 48000, true);
    const size = wav.slice();
    new DataView(size.buffer).setUint32(40, 1, true);
    for (const bad of [stereo, rate, size, wav.subarray(0, 100), new Uint8Array(44)]) {
      expect(validSpeechWav(bad)).toBe(false);
      expect((await handleTranscription(request(bad), env(), 'u')).status).toBe(400);
    }
    expect((await handleTranscription(request(new Uint8Array(700000)), env(), 'u')).status).toBe(
      413,
    );
    expect(
      (await handleTranscription(request(wav, { 'Content-Length': '700000' }), env(), 'u')).status,
    ).toBe(413);
  });
  it('forwards bounded PCM only to the configured service and never stores audio in D1', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ text: ' Hola. ' }));
    const response = await handleTranscription(request(), env(), 'valid-user');
    expect(await response.json()).toEqual({ text: 'Hola.' });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(fetcher.mock.calls[0][0]).toBe(env().TRANSCRIPTION_URL);
    const options = fetcher.mock.calls[0][1]!;
    expect(options.redirect).toBe('error');
    expect(options.headers).toEqual({ Authorization: 'Bearer test-only-key' });
    const forwarded = options.body as FormData;
    expect(forwarded.get('language')).toBe('es');
    expect(forwarded.get('model')).toBe('whisper-base');
    expect(new Uint8Array(await (forwarded.get('file') as Blob).arrayBuffer())).toEqual(wav);
    // Only the quota table exists: storing an audio or progress row would fail this request.
    expect(
      await db
        .prepare('SELECT requests FROM model_usage WHERE user_id = ?')
        .bind('valid-user')
        .first(),
    ).toEqual({ requests: 1 });
  });
  it('enforces quota and handles busy, malformed or timed-out upstreams', async () => {
    await db
      .prepare('INSERT INTO model_usage VALUES (?, ?, ?)')
      .bind('limited', Math.floor(Date.now() / 60000) * 60000, 30)
      .run();
    const fetcher = vi.spyOn(globalThis, 'fetch');
    expect((await handleTranscription(request(), env(), 'limited')).status).toBe(429);
    expect(fetcher).not.toHaveBeenCalled();
    for (const response of [
      new Response('', { status: 429 }),
      Response.json({ bad: true }),
      Response.json({ text: 'x'.repeat(1001) }),
    ]) {
      fetcher.mockResolvedValueOnce(response);
      expect((await handleTranscription(request(), env(), 'failure-user')).status).toBe(502);
    }
    fetcher.mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'));
    expect((await handleTranscription(request(), env(), 'failure-user')).status).toBe(502);
  });
});
