import { env, StyleTextToSpeech2Model, AutoTokenizer, Tensor } from '@huggingface/transformers';
import createEphone, { en_us, roa, type ephoneModule } from 'ephone';
const repo = 'onnx-community/Kokoro-82M-v1.0-ONNX',
  revision = '1939ad2a8e416c0acfeecc08a694d14ef25f2231',
  cacheName = 'paso-kokoro-dynamic-v1';
env.allowLocalModels = false;
env.useBrowserCache = true;
env.useWasmCache = true;
env.cacheKey = cacheName;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;
env.backends.onnx.wasm!.wasmPaths = {
  mjs: new URL('/asr-runtime/ort-wasm-simd-threaded.mjs', self.location.origin).href,
  wasm: new URL('/asr-runtime/ort-wasm-simd-threaded.wasm', self.location.origin).href,
};
const originalFetch = env.fetch;
env.fetch = async (input, options) => {
  const url = input instanceof Request ? input.url : String(input),
    unpinned = `https://huggingface.co/${repo}/resolve/main/`;
  if (url.startsWith(unpinned)) {
    const pinned = url.replace(unpinned, `https://huggingface.co/${repo}/resolve/${revision}/`);
    try {
      const cached = await (await caches.open(cacheName)).match(pinned);
      if (cached) return cached;
    } catch {}
    return originalFetch(pinned, options);
  }
  return originalFetch(input, options);
};
let model: StyleTextToSpeech2Model | null = null,
  tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>> | null = null,
  phone: ephoneModule | null = null;
const voices = new Map<string, Float32Array>();
const allowed: Record<string, string[]> = {
  es: ['ef_dora', 'em_alex', 'em_santa'],
  en: ['af_heart', 'am_michael'],
  fr: ['ff_siwis'],
};
async function load() {
  if (model && tokenizer && phone) return;
  const options = {
    revision,
    dtype: 'q8' as const,
    device: 'wasm' as const,
    progress_callback: (progress: unknown) => self.postMessage({ type: 'progress', progress }),
  };
  const result = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(repo, options),
    AutoTokenizer.from_pretrained(repo, { revision }),
    createEphone([en_us, roa]),
  ]);
  [model, tokenizer, phone] = result;
}
self.onmessage = async ({ data }) => {
  try {
    await load();
    if (data.type === 'load') {
      self.postMessage({ id: data.id, type: 'ready' });
      return;
    }
    const language = data.language as string,
      voice = allowed[language]?.includes(data.voice) ? data.voice : allowed[language]?.[0];
    if (!voice) throw Error('Unsupported voice');
    if (!voices.has(voice)) {
      const url = `https://huggingface.co/${repo}/resolve/${revision}/voices/${voice}.bin`,
        cache = await caches.open(cacheName);
      let response = await cache.match(url);
      if (!response) {
        response = await fetch(url);
        if (!response.ok) throw Error('Voice download failed');
        await cache.put(url, response.clone());
      }
      voices.set(voice, new Float32Array(await response.arrayBuffer()));
    }
    phone!.setVoice(language === 'en' ? 'en-US' : language);
    const phonemes = phone!.textToIpa(data.text.slice(0, 500)),
      { input_ids } = tokenizer!(phonemes, { truncation: true, max_length: 500 });
    const offset = Math.min(Math.max(input_ids.dims.at(-1)! - 2, 0), 509) * 256;
    const { waveform } = await model!({
      input_ids,
      style: new Tensor('float32', voices.get(voice)!.slice(offset, offset + 256), [1, 256]),
      speed: new Tensor('float32', [0.94], [1]),
    });
    const audio = new Float32Array(waveform.data as Float32Array);
    self.postMessage({ id: data.id, type: 'result', audio }, { transfer: [audio.buffer] });
  } catch (error) {
    self.postMessage({
      id: data.id,
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
