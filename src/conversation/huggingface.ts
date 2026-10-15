import type { Client } from '@gradio/client';
type Job = ReturnType<Client['submit']>;
import { useSyncExternalStore } from 'react';
import { accountState } from '../sync/client';
import { wavBlob } from '../speech/wav';

type State = { message: string };
let state: State = { message: '' };
const listeners = new Set<() => void>();
let connection: Promise<Client> | null = null;
let activeSpace = '';
const jobs = new Set<Job>();
const cancellations = new Set<() => void>();
function update(message: string) {
  state = { message };
  listeners.forEach((fn) => fn());
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export const useCommunityServer = () => useSyncExternalStore(subscribe, () => state);
export const spacePage = (id: string) => `https://huggingface.co/spaces/${id}`;
function friendly(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/quota|exceed|limit.*gpu|gpu.*limit/i.test(message))
    return 'The free GPU allowance is used up. Try after it resets, or open the Hugging Face practice page to use your own free account allowance.';
  if (/queue.*full|busy/i.test(message))
    return 'The community server is busy. Your reply is saved; try again shortly.';
  if (/abort|cancel/i.test(message)) return 'Cancelled.';
  return 'The community server could not finish. It may be waking up or busy. Your reply is saved; please retry.';
}
async function getClient() {
  const id = accountState().communitySpace;
  if (!id) throw Error('No community server is connected.');
  if (activeSpace !== id) {
    connection = null;
    activeSpace = id;
  }
  if (!connection)
    connection = import('@gradio/client')
      .then(({ Client }) =>
        Client.connect(id, {
          events: ['data', 'status'],
          status_callback: (status) =>
            update(status.status === 'running' ? '' : 'Waking the free server…'),
        }),
      )
      .catch((error) => {
        connection = null;
        throw error;
      });
  return connection;
}
async function call(endpoint: string, data: unknown[], signal?: AbortSignal): Promise<unknown[]> {
  let job: Job | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  let cancelled = false;
  update('Connecting to the free server…');
  try {
    // Bound both cold startup and queue time. Never fall back to a paid service or local download.
    const work = (async () => {
      const client = await getClient();
      if (cancelled || signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      job = client.submit(endpoint, data);
      jobs.add(job);
      for await (const event of job) {
        if (event.type === 'status') {
          if (event.stage === 'error')
            throw Error(typeof event.message === 'string' ? event.message : 'Server error');
          update(
            event.stage === 'pending' ? 'Waiting for a free slot…' : 'Your partner is thinking…',
          );
        }
        if (event.type === 'data') return event.data as unknown[];
      }
      throw Error('Empty response');
    })();
    const stopped = new Promise<never>((_, reject) => {
      abort = () => {
        cancelled = true;
        void job?.cancel();
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      cancellations.add(abort);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      timer = setTimeout(() => {
        cancelled = true;
        void job?.cancel();
        reject(Error('Server timeout'));
      }, 120000);
    });
    return await Promise.race([work, stopped]);
  } catch (error) {
    throw Error(friendly(error));
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) {
      signal?.removeEventListener('abort', abort);
      cancellations.delete(abort);
    }
    if (job) jobs.delete(job);
    update('');
  }
}
export function cancelCommunityRequests() {
  for (const cancel of cancellations) cancel();
  for (const job of jobs) void job.cancel();
  jobs.clear();
  update('');
}
export async function communityTranscribe(
  audio: Float32Array,
  language: string,
  signal: AbortSignal,
) {
  const { handle_file } = await import('@gradio/client');
  const [text] = await call('/transcribe', [handle_file(wavBlob(audio, 16000)), language], signal);
  if (typeof text !== 'string' || text.length > 1000)
    throw Error('Could not recognize this recording.');
  return text;
}
export async function communityReply(
  language: string,
  scene: string,
  messages: { role: string; content: string }[],
) {
  const [text] = await call('/reply', [language, scene, JSON.stringify(messages.slice(-8))]);
  if (typeof text !== 'string' || text.length > 2000)
    throw Error('The server returned an incomplete reply.');
  return text;
}
export async function communitySpeak(text: string, language: string, voice: string) {
  const [file] = await call('/speak', [text.slice(0, 500), language, voice]);
  const url = new URL((file as { url?: string })?.url ?? 'invalid');
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.hf.space'))
    throw Error('Invalid voice response.');
  const response = await fetch(url.href, {
    signal: AbortSignal.timeout(30000),
    credentials: 'omit',
  });
  if (!response.ok) throw Error('Could not load the generated voice.');
  const audio = await response.blob();
  if (audio.size > 3000000 || !audio.size) throw Error('Invalid voice response.');
  return audio;
}
