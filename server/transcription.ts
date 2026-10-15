import { endpoint, limited } from './inference';
import { json, sameOrigin } from './progress';
const MAX_BYTES = 44 + 21 * 16000 * 2;
export function validSpeechWav(bytes: Uint8Array) {
  if (bytes.length < 44 || bytes.length > MAX_BYTES) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number, size: number) =>
    new TextDecoder().decode(bytes.subarray(at, at + size));
  return (
    text(0, 4) === 'RIFF' &&
    text(8, 4) === 'WAVE' &&
    text(12, 4) === 'fmt ' &&
    text(36, 4) === 'data' &&
    view.getUint32(4, true) === bytes.length - 8 &&
    view.getUint32(16, true) === 16 &&
    view.getUint16(20, true) === 1 &&
    view.getUint16(22, true) === 1 &&
    view.getUint32(24, true) === 16000 &&
    view.getUint32(28, true) === 32000 &&
    view.getUint16(32, true) === 2 &&
    view.getUint16(34, true) === 16 &&
    view.getUint32(40, true) === bytes.length - 44 &&
    (bytes.length - 44) % 2 === 0 &&
    bytes.length >= 44 + 16000
  );
}
export async function handleTranscription(
  request: Request,
  env: Cloudflare.Env,
  userId: string | null,
) {
  if (!userId) return json({ error: 'Sign in to use server speech recognition.' }, 401);
  if (!sameOrigin(request)) return json({ error: 'This request must come from Paso.' }, 403);
  if (!env.TRANSCRIPTION_URL)
    return json({ error: 'Server speech recognition is not configured.' }, 503);
  const language = new URL(request.url).searchParams.get('language');
  if (!language || !['es', 'fr', 'en'].includes(language))
    return json({ error: 'Unsupported language.' }, 400);
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'audio/wav')
    return json({ error: 'Send a WAV recording.' }, 415);
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BYTES)
    return json({ error: 'Recording is too long.' }, 413);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: 'Recording is missing.' }, 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > MAX_BYTES) {
      await reader.cancel();
      return json({ error: 'Recording is too long.' }, 413);
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (!validSpeechWav(bytes)) return json({ error: 'Use a short mono 16 kHz PCM recording.' }, 400);
  if (!(await limited(env.DB, userId)))
    return json({ error: 'Take a short pause and try again in a minute.' }, 429);
  const body = new FormData();
  body.set('file', new Blob([bytes], { type: 'audio/wav' }), 'speech.wav');
  body.set('language', language);
  body.set('model', 'whisper-base');
  try {
    const response = await fetch(endpoint(env.TRANSCRIPTION_URL), {
      method: 'POST',
      headers: env.TRANSCRIPTION_API_KEY
        ? { Authorization: `Bearer ${env.TRANSCRIPTION_API_KEY}` }
        : {},
      body,
      signal: AbortSignal.timeout(45000),
      redirect: 'error',
    });
    if (!response.ok)
      return json(
        { error: 'Speech recognition is busy or unavailable. Retry or type your reply.' },
        502,
      );
    const result = (await response.json()) as { text?: unknown };
    if (typeof result.text !== 'string' || result.text.length > 1000)
      throw Error('Invalid transcript');
    return json({ text: result.text.trim() });
  } catch {
    return json({ error: 'Speech recognition did not finish. Retry or type your reply.' }, 502);
  }
}
