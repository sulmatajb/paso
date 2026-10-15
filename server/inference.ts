import { z } from 'zod';
import { getCourse } from '../src/content/catalog';
import { getScenario, conversationPrompt, cleanReply } from '../src/conversation/scenarios';
import { json, sameOrigin } from './progress';
export const conversationInput = z
  .object({
    courseId: z.string(),
    scenarioId: z.string(),
    messages: z
      .array(
        z
          .object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(2000) })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
const voiceInput = z
  .object({
    text: z.string().min(1).max(500),
    language: z.enum(['es', 'en', 'fr']),
    voice: z.string().max(30),
  })
  .strict();
async function read(request: Request) {
  const max = 30000;
  if (Number(request.headers.get('content-length') ?? 0) > max) throw Error('Request too large');
  const reader = request.body?.getReader();
  if (!reader) throw Error('Missing body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw Error('Request too large');
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function limited(db: D1Database, userId: string) {
  const now = Date.now(),
    start = Math.floor(now / 60000) * 60000;
  const result = await db
    .prepare(
      'INSERT INTO model_usage (user_id, window_start, requests) VALUES (?, ?, 1) ON CONFLICT(user_id) DO UPDATE SET window_start = excluded.window_start, requests = CASE WHEN model_usage.window_start = excluded.window_start THEN model_usage.requests + 1 ELSE 1 END WHERE model_usage.window_start <> excluded.window_start OR model_usage.requests < 30 RETURNING requests',
    )
    .bind(userId, start)
    .first();
  return !!result;
}
export function endpoint(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
  )
    throw Error('Configure an HTTPS model endpoint');
  return url.href;
}
export async function handleInference(
  request: Request,
  env: Cloudflare.Env,
  userId: string | null,
  kind: 'chat' | 'voice',
) {
  if (!userId) return json({ error: 'Sign in to use the hosted model.' }, 401);
  if (!sameOrigin(request)) return json({ error: 'This request must come from Paso.' }, 403);
  const url = kind === 'chat' ? env.CONVERSATION_URL : env.VOICE_URL;
  if (!url)
    return json(
      { error: 'No hosted model is configured. Use the on-device model on a supported browser.' },
      503,
    );
  let payload: unknown;
  try {
    const raw = await read(request);
    if (kind === 'chat') {
      const input = conversationInput.parse(raw),
        course = getCourse(input.courseId),
        scenario = getScenario(input.scenarioId);
      if (input.messages.at(-1)?.role !== 'user')
        return json({ error: 'Send a learner reply first.' }, 400);
      payload = {
        model: env.CONVERSATION_MODEL ?? 'paso-qwen3',
        messages: [
          { role: 'system', content: conversationPrompt(course.targetLanguage, scenario) },
          ...input.messages,
        ],
        max_tokens: 150,
        temperature: 0.4,
        top_p: 0.8,
        stream: false,
        reasoning_effort: 'none',
        chat_template_kwargs: { enable_thinking: false },
      };
    } else {
      const input = voiceInput.parse(raw),
        allowed = {
          es: ['ef_dora', 'em_alex', 'em_santa'],
          en: ['af_heart', 'am_michael'],
          fr: ['ff_siwis'],
        };
      if (!allowed[input.language].includes(input.voice))
        return json({ error: 'Unknown voice' }, 400);
      payload = {
        model: 'kokoro',
        input: input.text,
        voice: input.voice,
        response_format: 'wav',
        speed: 0.94,
      };
    }
  } catch {
    return json({ error: 'Invalid conversation request.' }, 400);
  }
  if (!(await limited(env.DB, userId)))
    return json({ error: 'Take a short pause. You can send more requests in a minute.' }, 429);
  try {
    const key = kind === 'chat' ? env.CONVERSATION_API_KEY : env.VOICE_API_KEY;
    const response = await fetch(endpoint(url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(80000),
      redirect: 'error',
    });
    if (!response.ok)
      return json(
        {
          error:
            'The hosted model is temporarily unavailable. Your message is saved; retry shortly.',
        },
        502,
      );
    if (kind === 'voice')
      return new Response(response.body, {
        headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, no-store' },
      });
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return json({ text: cleanReply(body.choices?.[0]?.message?.content ?? '') });
  } catch {
    return json(
      { error: 'The model did not respond in time. Your message is saved; retry when ready.' },
      502,
    );
  }
}
