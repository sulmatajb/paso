import { communityReply, communitySpeak } from './huggingface';
import { wavBlob } from '../speech/wav';
import { useSyncExternalStore } from 'react';
import chatWorkerUrl from './worker.ts?worker&url';
import voiceWorkerUrl from './tts-worker.ts?worker&url';
import { accountState } from '../sync/client';
import { cleanReply, conversationPrompt, getScenario } from './scenarios';
import type { Conversation } from '../learning-records';
import { getCourse } from '../content/catalog';
type State = {
  status: 'idle' | 'loading' | 'ready' | 'generating' | 'error';
  progress: number;
  message: string;
};
class ModelClient {
  state: State = { status: 'idle', progress: 0, message: '' };
  worker: Worker | null = null;
  listeners = new Set<() => void>();
  sequence = 0;
  pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private create: () => Worker,
    private voice = false,
  ) {}
  update(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  request(type: string, args: Record<string, unknown> = {}) {
    if (this.pending.size) return Promise.reject(Error('A model operation is already running.'));
    const id = ++this.sequence;
    this.update({
      status: type === 'load' ? 'loading' : 'generating',
      message: type === 'load' ? 'Preparing model…' : 'Thinking…',
    });
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(
        () => this.cancel('This took too long. Try again on a stronger connection or device.'),
        type === 'load' ? 300000 : 120000,
      );
      this.pending.set(id, { resolve, reject, timer });
      if (!this.worker) {
        try {
          this.worker = this.create();
        } catch (error) {
          this.cancel(error instanceof Error ? error.message : 'Model worker could not start.');
          return;
        }
        this.worker.onmessage = ({ data }) => {
          if (data.type === 'progress') {
            const progress =
              typeof data.progress === 'number'
                ? data.progress
                : data.progress?.progress
                  ? data.progress.progress / 100
                  : this.state.progress;
            this.update({
              progress,
              message:
                data.text ??
                (data.progress?.file ? `Downloading ${data.progress.file}` : 'Preparing voice…'),
            });
            return;
          }
          const task = this.pending.get(data.id);
          if (!task) return;
          clearTimeout(task.timer);
          this.pending.delete(data.id);
          if (data.type === 'error') {
            const message = /cache|quota|storage/i.test(data.message)
              ? 'The browser could not download or store the model. Try a regular browser window with at least 3 GB of free storage, then retry.'
              : data.message;
            this.update({ status: 'error', message });
            task.reject(Error(message));
          } else {
            this.update({ status: 'ready', progress: 1, message: 'Ready' });
            task.resolve(this.voice ? data.audio : data.text);
          }
        };
        this.worker.onerror = (event) => {
          console.error(
            'Model worker startup failed:',
            event.message,
            event.filename,
            event.lineno,
          );
          this.cancel(
            'The model could not run on this device. Try again or use a supported browser.',
          );
        };
      }
      try {
        this.worker.postMessage({ id, type, ...args });
      } catch (error) {
        this.cancel(error instanceof Error ? error.message : 'Model failed');
      }
    });
  }
  cancel(message = 'Cancelled') {
    this.worker?.terminate();
    this.worker = null;
    for (const task of this.pending.values()) {
      clearTimeout(task.timer);
      task.reject(Error(message));
    }
    this.pending.clear();
    this.update({ status: 'idle', progress: 0, message });
  }
}
export const chatModel = new ModelClient(
  () => new Worker(new URL(chatWorkerUrl, window.location.origin), { type: 'module' }),
);
export const voiceModel = new ModelClient(
  () => new Worker(new URL(voiceWorkerUrl, window.location.origin), { type: 'module' }),
  true,
);
export const useChatModel = () => useSyncExternalStore(chatModel.subscribe, () => chatModel.state);
export const useVoiceModel = () =>
  useSyncExternalStore(voiceModel.subscribe, () => voiceModel.state);
export async function chatSupport() {
  const gpu = (
    navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<{ features: Set<string> } | null> };
    }
  ).gpu;
  if (!gpu)
    return 'Local conversations need a browser with WebGPU. Try current Chrome or Safari on a supported device, or connect a hosted model in your Paso deployment.';
  try {
    const adapter = await gpu.requestAdapter();
    return adapter?.features.has('shader-f16')
      ? null
      : 'This GPU cannot run the local conversation model. The app’s lessons and speaking practice still work.';
  } catch {
    return 'GPU access is unavailable in this browser.';
  }
}
export async function loadChat() {
  if (accountState().conversation) return;
  const unsupported = await chatSupport();
  if (unsupported) throw Error(unsupported);
  if (chatModel.state.status === 'ready') return;
  await chatModel.request('load');
}
export async function loadVoice() {
  if (accountState().voice) return;
  if (voiceModel.state.status === 'ready') return;
  await voiceModel.request('load');
}
async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Paso-Request': '1' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw Error(data.error ?? 'The hosted model is unavailable. Please try again.');
  }
  return response;
}
export async function reply(conversation: Conversation) {
  if (accountState().communitySpace)
    return cleanReply(
      await communityReply(
        getCourse(conversation.courseId).targetLanguage,
        conversation.scenarioId,
        conversation.messages.slice(-8).map((m) => ({ role: m.role, content: m.text })),
      ),
    );
  if (accountState().conversation) {
    const response = await post('/api/conversation', {
      courseId: conversation.courseId,
      scenarioId: conversation.scenarioId,
      messages: conversation.messages.slice(-10).map((m) => ({ role: m.role, content: m.text })),
    });
    return cleanReply(((await response.json()) as { text: string }).text);
  }
  if (chatModel.state.status !== 'ready') await loadChat();
  const course = getCourse(conversation.courseId),
    scenario = getScenario(conversation.scenarioId);
  const messages = [
    { role: 'system', content: conversationPrompt(course.targetLanguage, scenario) },
    ...conversation.messages.slice(-8).map((m) => ({ role: m.role, content: m.text })),
  ];
  return cleanReply((await chatModel.request('reply', { messages })) as string);
}
export async function synthesize(text: string, language: string, voice: string) {
  if (accountState().communitySpace) return communitySpeak(text, language, voice);
  if (accountState().voice)
    return (await post('/api/voice', { text: text.slice(0, 500), language, voice })).blob();
  if (voiceModel.state.status !== 'ready') await loadVoice();
  return wavBlob((await voiceModel.request('speak', { text, language, voice })) as Float32Array);
}
