import { communityTranscribe } from '../conversation/huggingface';
import { accountState, useAccount } from '../sync/client';
import { wavBlob } from './wav';
import { useSyncExternalStore } from 'react';
import speechWorkerUrl from './worker.ts?worker&url';
type Snapshot = {
  status: 'idle' | 'loading' | 'ready' | 'transcribing' | 'error';
  bytes: number;
  error: string;
};
let state: Snapshot = { status: 'idle', bytes: 0, error: '' };
const serverReady: Snapshot = { status: 'ready', bytes: 0, error: '' };
let remote: AbortController | null = null;
let worker: Worker | null = null,
  sequence = 0;
const listeners = new Set<() => void>();
const pending = new Map<
  number,
  { resolve: (value: string) => void; reject: (error: Error) => void }
>();
const downloaded = new Map<string, number>();
function update(patch: Partial<Snapshot>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function useSpeechModel() {
  const account = useAccount();
  const current = useSyncExternalStore(subscribe, () => state);
  return account.transcription && (current.status === 'idle' || current.status === 'error')
    ? serverReady
    : current;
}
function getWorker() {
  if (!worker) {
    worker = new Worker(new URL(speechWorkerUrl, window.location.origin), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        const p = data.progress;
        if (p.status === 'progress') downloaded.set(p.file, p.loaded);
        update({ bytes: Array.from(downloaded.values()).reduce((a, b) => a + b, 0) });
        return;
      }
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.type === 'error') {
        console.warn('Local speech failed:', data.message);
        update({ status: 'error', error: data.message });
        request.reject(new Error(data.message));
      } else {
        update({ status: 'ready', error: '' });
        request.resolve(data.text ?? '');
      }
    };
    worker.onerror = () => {
      update({ status: 'error', error: 'Speech worker could not start.' });
      pending.forEach((p) => p.reject(new Error('Speech worker could not start.')));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}
function request(type: 'load' | 'transcribe', audio?: Float32Array, language?: string) {
  const id = ++sequence;
  return new Promise<string>((resolve, reject) => {
    const timer = type === 'transcribe' ? setTimeout(() => cancelSpeech(), 120000) : null;
    pending.set(id, {
      resolve: (value) => {
        if (timer) clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        if (timer) clearTimeout(timer);
        reject(error);
      },
    });
    try {
      getWorker().postMessage({ id, type, audio, language }, audio ? [audio.buffer] : []);
    } catch (error) {
      pending.delete(id);
      if (timer) clearTimeout(timer);
      update({ status: 'error', error: String(error) });
      reject(error);
    }
  });
}
export async function loadSpeechModel() {
  if (accountState().transcription) return;
  if (state.status === 'ready') return;
  if (state.status === 'loading' || state.status === 'transcribing')
    throw new Error('Speech is busy.');
  if (state.status === 'error') {
    worker?.terminate();
    worker = null;
  }
  downloaded.clear();
  update({ status: 'loading', bytes: 0, error: '' });
  await request('load');
}
export async function transcribe(audio: Float32Array, language: string) {
  if (accountState().transcription) {
    if (remote) throw Error('Speech is busy.');
    const controller = new AbortController();
    remote = controller;
    update({ status: 'transcribing', error: '' });
    const timer = setTimeout(
      () => controller.abort(),
      accountState().communitySpace ? 125000 : 50000,
    );
    try {
      if (accountState().communitySpace) {
        const text = await communityTranscribe(audio, language, controller.signal);
        if (remote === controller) update({ status: 'ready' });
        return text;
      }
      const response = await fetch(`/api/transcription?language=${encodeURIComponent(language)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav', 'X-Paso-Request': '1' },
        body: wavBlob(audio, 16000),
        signal: controller.signal,
      });
      const result = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || typeof result.text !== 'string')
        throw Error(result.error ?? 'Could not recognize this recording.');
      if (remote === controller) update({ status: 'ready' });
      return result.text;
    } catch (error) {
      if (remote === controller)
        update({
          status: 'error',
          error: error instanceof Error ? error.message : 'Recognition failed.',
        });
      throw error;
    } finally {
      clearTimeout(timer);
      if (remote === controller) remote = null;
    }
  }
  if (state.status !== 'ready') throw new Error('Load the speaking pack first.');
  update({ status: 'transcribing' });
  return request('transcribe', audio, language);
}
export function cancelSpeech() {
  remote?.abort();
  remote = null;
  worker?.terminate();
  worker = null;
  pending.forEach((p) => p.reject(new Error('Cancelled')));
  pending.clear();
  update({ status: 'idle', bytes: 0, error: '' });
}
