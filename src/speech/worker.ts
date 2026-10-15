import { SPEECH_MODEL, SPEECH_CACHE } from './config';
import {
  env,
  AutoTokenizer,
  AutoProcessor,
  WhisperForConditionalGeneration,
  AutomaticSpeechRecognitionPipeline,
} from '@huggingface/transformers';
env.allowLocalModels = false;
env.useBrowserCache = true;
env.cacheKey = SPEECH_CACHE;
env.useWasmCache = true;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;
env.backends.onnx.wasm!.wasmPaths = {
  mjs: new URL('/asr-runtime/ort-wasm-simd-threaded.mjs', self.location.origin).href,
  wasm: new URL('/asr-runtime/ort-wasm-simd-threaded.wasm', self.location.origin).href,
};
// Transformers v4's tokenizer discovery omits revision and always probes
// main/tokenizer_config.json. Resolve that metadata against the same immutable
// revision and browser cache as the weights, including after an offline reload.
const networkFetch = env.fetch;
env.fetch = async (input, options) => {
  const url = input instanceof Request ? input.url : String(input);
  const unpinned = `https://huggingface.co/${SPEECH_MODEL.id}/resolve/main/`;
  if (url.startsWith(unpinned)) {
    const pinned = url.replace(
      unpinned,
      `https://huggingface.co/${SPEECH_MODEL.id}/resolve/${SPEECH_MODEL.revision}/`,
    );
    try {
      const cached = await (await caches.open(SPEECH_CACHE)).match(pinned);
      if (cached) return cached;
    } catch {
      /* Online use remains possible when storage is blocked. */
    }
    return networkFetch(pinned, options);
  }
  return networkFetch(input, options);
};
let model: AutomaticSpeechRecognitionPipeline | null = null;
const revision = SPEECH_MODEL.revision;
const languageNames: Record<string, string> = { es: 'spanish', en: 'english', fr: 'french' };
self.onmessage = async ({
  data,
}: MessageEvent<{ id: number; type: string; audio?: Float32Array; language?: string }>) => {
  try {
    if (!model) {
      // Construct the known Whisper pipeline directly. The generic v4 pipeline()
      // probes unpinned remote file metadata even when all weights are cached.
      const options = {
        revision,
        dtype: 'q8' as const,
        device: 'wasm' as const,
        progress_callback: (progress: unknown) => self.postMessage({ type: 'progress', progress }),
      };
      const [tokenizer, processor, weights] = await Promise.all([
        AutoTokenizer.from_pretrained(SPEECH_MODEL.id, options),
        AutoProcessor.from_pretrained(SPEECH_MODEL.id, options),
        WhisperForConditionalGeneration.from_pretrained(SPEECH_MODEL.id, options),
      ]);
      model = new AutomaticSpeechRecognitionPipeline({
        task: 'automatic-speech-recognition',
        tokenizer,
        processor,
        model: weights,
      });
    }
    if (data.type === 'load') self.postMessage({ id: data.id, type: 'ready' });
    else if (data.type === 'transcribe' && data.audio) {
      const result = await model(data.audio, {
        language: languageNames[data.language ?? 'es'],
        task: 'transcribe',
        max_new_tokens: 64,
        no_repeat_ngram_size: 3,
      });
      self.postMessage({
        id: data.id,
        type: 'result',
        text: Array.isArray(result) ? result[0].text : result.text,
      });
    }
  } catch (error) {
    self.postMessage({
      id: data.id,
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
