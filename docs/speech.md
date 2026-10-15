# Open speech in Paso

Paso uses **real Kokoro-82M v1.0 inference** to produce the bundled lesson audio.
Generation runs locally on CPU. Playback uses small same-origin MP3 files;
listening does not download the generation model or send text to a third-party
speech service. No paid API key or operating-system voice is needed. This keeps
the lesson voices consistent on desktop and mobile. Speaking practice uses a
separate, optional local recognition model described below.

The available synthetic voices are:

| Target language | Voice IDs                        | Display names     |
| --------------- | -------------------------------- | ----------------- |
| Spanish         | `ef_dora`, `em_alex`, `em_santa` | Dora, Alex, Santa |
| English         | `af_heart`, `am_michael`         | Heart, Michael    |
| French          | `ff_siwis`                       | Siwis             |

The phase 3 pack contains **588 clips for 202 phrase records**, totaling
8,593,692 bytes. The 25-lesson Spanish course has 190 phrase records with all
three Spanish voices (570 clips); English and French starters supply the other
18 clips. All 108 phase 2 clips retain their original checksums.

These names identify the model's standard voices. They do not identify a Paso
teacher, a custom impersonation, or a person recording the lesson.
Spanish currently uses eSpeak's `es` phonemizer, including Spain-style sounds
such as /θ/ in `cenar`. The voice selector offers different voices, not a
guaranteed selection of regional accents. A regional course should explicitly
choose and review its pronunciation settings before regenerating audio.

## Regenerate the audio

Prerequisites: Python 3.11, [uv](https://docs.astral.sh/uv/), and FFmpeg with
`libmp3lame`. Run from the repository root. `../paso-speech-models` is a sibling cache outside the source repository;
another external directory can be substituted consistently in all commands.

```sh
uv venv ../paso-speech-models/.venv --python 3.11
uv pip install --python ../paso-speech-models/.venv/bin/python -r scripts/audio/requirements.txt
python3 scripts/audio/download.py --model-dir ../paso-speech-models
../paso-speech-models/.venv/bin/python scripts/audio/generate.py --model-dir ../paso-speech-models
python3 scripts/audio/validate.py
```

The first download is approximately 354 MB: a full-precision ONNX checkpoint
and its voice embeddings. `models.lock.json` pins both release files by exact
size and SHA-256. Generation refuses a corrupt or mismatched model, and the
downloader only renames a completed file after verifying it. No access token is
needed for these public files.

The dependency versions are pinned in `requirements.txt`. The generation code
uses the CPU-compatible `kokoro-onnx` runtime, its bundled eSpeak NG phonemizer,
24 kHz mono output, a 0.92 speech rate, and 64 kbit/s MP3 encoding. Model version,
runtime version, text, voice, audio checksum and generation settings are
recorded in the manifest. CPU/library differences can change individual samples
or MP3 bytes; version pinning makes the process reproducible, not necessarily
bit-identical across platforms.

The generator reads `src/content/courses/*.json`, iterates each lesson's
`phrases`, and synthesizes each phrase's exact `target` text with every configured
voice for the course's `targetLanguage`. Files with unchanged text, settings and
matching hashes are reused. Use `--force` to regenerate all clips. Do not add
model weights or the Python environment to Git.

## Manifest contract

`public/audio/manifest.json` has `schemaVersion: 1`, a `model` object, a `voices`
array, `generation` settings, and `clips`. Voices have `id`, `name`, `language`
(BCP 47 base code), and `description` fields. A phrase key is the string
`<courseId>/<lessonId>/<phraseId>`; each key maps voice IDs to clips:

```json
{
  "es-from-en/es-first-hello/hello": {
    "ef_dora": {
      "url": "/audio/es-from-en/es-first-hello/hello/ef_dora.mp3",
      "text": "Hola",
      "language": "es",
      "durationSeconds": 0.9,
      "sampleRate": 24000,
      "bytes": 8000,
      "sha256": "<actual SHA-256 in the generated manifest>",
      "generationKey": "<text, voice and model configuration fingerprint>"
    }
  }
}
```

The example size and duration above are illustrative; the generated manifest
contains measured values. Use `bytes` for offline download accounting. Do not
construct file paths from translated display names.

## Add another language or voice

1. Add the course JSON using a new language pair and stable phrase identifiers.
2. Confirm the model actually supports the language and selected voices in its
   [official voice inventory](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md).
3. Add voices to `VOICES` and the appropriate eSpeak NG language code to
   `PHONEMIZER_LANGUAGES` in `generate.py`.
4. Retain any additional model/voice attribution, generate, and validate.
5. Have a fluent reviewer listen to every new phrase before calling the course
   curriculum-reviewed. Synthetic pronunciation can be imperfect, especially
   for short utterances and proper names.

## Validation and scope

`validate.py` verifies every course phrase has all expected voice variants,
checks the exact spoken text and SHA-256, checks codec/sample rate/channel count,
and fully decodes each MP3 with FFmpeg. During inference the generator also
rejects silence, nonfinite samples, and implausible durations. These checks
establish audio integrity and coverage; they do not establish pronunciation
quality or pedagogical accuracy.

This generation pipeline provides pre-generated text-to-speech for authored
lessons. It does not provide automated pronunciation scoring or an unrestricted
conversation tutor.

## Optional speech recognition: Whisper Base

Speaking practice uses the multilingual `onnx-community/whisper-base` model at
commit `1846881b6b3a3024392c1eea3ad983695bc23925`, with **q8** weights. It is an
ONNX conversion of OpenAI's MIT-licensed Whisper Base model. Transformers.js
4.3.1 runs inference through ONNX Runtime Web in a dedicated worker, so the
recognizer can operate locally after its assets have been downloaded.

The model pack is exactly **79,664,191 bytes**. The same-origin runtime files add
**14,289,219 bytes**, for **93,953,410 bytes** (94 MB / 89.6 MiB), excluding the
app's JavaScript. The seven model files are:

| File                                       |      Bytes |
| ------------------------------------------ | ---------: |
| `config.json`                              |      2,243 |
| `generation_config.json`                   |      3,832 |
| `preprocessor_config.json`                 |        339 |
| `tokenizer.json`                           |  2,480,466 |
| `tokenizer_config.json`                    |    282,682 |
| `onnx/encoder_model_quantized.onnx`        | 23,201,314 |
| `onnx/decoder_model_merged_quantized.onnx` | 53,693,315 |

`scripts/audio/asr-base-model.lock.json` records the exact Hugging Face URLs and
SHA-256 values. The runtime uses `ort-wasm-simd-threaded.mjs` (24,381 bytes) and
`ort-wasm-simd-threaded.wasm` (14,264,838 bytes) from
`onnxruntime-web@1.31.0-dev.20260914-8d85527a0`. These must match the installed
Transformers.js dependency; do not mix runtime versions or silently replace
the model with the English-only `whisper-base.en`.

The worker API is:

```js
const transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', {
  revision: '1846881b6b3a3024392c1eea3ad983695bc23925',
  dtype: 'q8',
  device: 'wasm',
});
const result = await transcriber(monoFloat32SamplesAt16000Hz, {
  language: 'spanish',
  task: 'transcribe',
  max_new_tokens: 64,
  do_sample: false,
});
```

Use a known target language rather than automatic detection for these short
lesson recordings. Resample microphone audio to 16 kHz before passing a plain
`Float32Array`; the array does not carry its own sample-rate metadata.
`task: 'transcribe'` preserves the spoken language; `translate` would turn the
exercise into English translation.

The intended cache contract is explicit download, then cache-backed loading of
the pinned model URLs. Transformers.js 4.3.1 can use the browser Cache API or a
custom `{match, put}` cache. Check every required model/runtime asset before
showing an offline-ready state; a completed inference does not guarantee cache
writes succeeded. Browsers may evict this storage, so allow re-downloading and
removing the model. Keep the worker's `wasmPaths` on the same origin and set
`numThreads: 1` and `proxy: false`; the worker already keeps model work off the
main UI thread and one WASM thread avoids requiring cross-origin isolation.
The standard runtime, rather than the asyncify variant, supports the intended
Safari fallback.

## Reproduce actual ASR verification

The test below uses the same q8 weights with the Node CPU backend. It is useful
for model sanity checks; browser WASM and microphone behavior require separate
browser tests. It needs the project's npm dependencies and FFmpeg.

```sh
python3 scripts/audio/download-asr.py --model base --model-dir ../../work/whisper-base-q8
node scripts/audio/verify-asr.mjs --model base --model-dir ../../work/whisper-base-q8 --output ../../work/whisper-base-results.json
```

The test verifies model hashes and disables remote model loading before running
inference. Fixtures are existing **synthetic Kokoro clips**, explicitly labeled
in the output, not human speech. No user's microphone was accessed for the test.

During the initial Tiny evaluation on the development machine, the model
transcribed the full Spanish
phrases “Me llamo Alex”, “¿Dónde está la estación?”, and “Hablo un poco de
español” correctly apart from punctuation. It also recognized “Quisiera un café,
por favor” in Dora and Alex's voices. The same sentence in Santa's voice had a
word error, and the very short Dora clip “Hola” was misrecognized. The French
and English sanity-check phrases also produced the expected words.

A follow-up sample used the first Dora question from each of the 20 appended
Spanish lessons. Only 10 of those 20 synthetic clips matched their target words
exactly after ignoring case and punctuation. Other clips had word changes, and
the short question “¿Me entiendes?” produced repeated unrelated text. This is a
small synthetic smoke test, not a human-speech benchmark; it is enough to rule
out presenting Whisper Tiny as reliable hard-graded pronunciation assessment.

Those results demonstrate real inference, not a broad speech-accuracy
benchmark. Whisper, including Base, can hallucinate text from silence or misrecognize
correct speech, especially single words, accents, and noisy recordings. A
transcript/target comparison is **word-recognition feedback, not a pronunciation
score**. Keep transcripts visible, allow retries and a way to continue without
speaking, and never treat recognition failure as proof of poor pronunciation.
Bound generation length and treat repeated or implausibly long transcripts as
unclear recognition rather than useful learning feedback.

## Why Base is the default instead of Tiny

`onnx-community/whisper-base`, pinned to
`1846881b6b3a3024392c1eea3ad983695bc23925`, was tested against the **same 20
synthetic question clips** with the same generation settings. Base matched
13/20 after ignoring case and punctuation, compared with Tiny's 10/20. If accent
marks are also ignored, Base matched 16/20 and Tiny 11/20. Base recognized the
question that had caused Tiny to loop, but still changed words in four clips.
This improvement led to Base being selected as the app default. It supports
optional practice; it does not establish reliable pronunciation assessment.
The baseline nine-clip check also confirmed that Base recognized the full café
sentence in all three Spanish voices, plus the English and French fixtures.
It still misrecognized the very short “Hola” clip. Short single words remain a
poor choice for demonstrating speech recognition reliably.

On the development machine's native CPU backend, median inference time was
approximately 299 ms for Base versus 234 ms for Tiny. Browser WASM latency and
phone memory behavior must be measured separately. The Base q8 download is
79,664,191 bytes for the model files, or **93,953,410 bytes (~94 MB)** including
the same WASM runtime. The additional download versus Tiny is 36,050,457 bytes.

`scripts/audio/asr-base-model.lock.json` pins all Base files and hashes. Its
encoder is 23,201,314 bytes and merged decoder 53,693,315 bytes; the remaining
files are tokenizer and configuration data. API usage is identical after
changing model ID and revision. To reproduce the comparison:

```sh
python3 scripts/audio/download-asr.py --model base --model-dir ../../work/whisper-base-q8
node scripts/audio/verify-asr.mjs --model base --model-dir ../../work/whisper-base-q8 --expanded --output ../../work/whisper-base-expanded.json
python3 scripts/audio/download-asr.py --model tiny --model-dir ../../work/whisper-tiny-q8
node scripts/audio/verify-asr.mjs --model tiny --model-dir ../../work/whisper-tiny-q8 --expanded --output ../../work/whisper-tiny-expanded.json
```

Retain retries, a typed alternative, transcript visibility, and repetition/
duration checks with either model. Neither sample evaluates human speakers,
microphone capture, or noise robustness.
`scripts/audio/asr-evaluation.json` retains the 40 comparison outputs, model
pins, generation settings, and fixture checksums. Its accent-insensitive word
comparison preserves Spanish `ñ`; none of these comparisons is a learner score.

See [speech attribution](../public/licenses/audio/NOTICE.md) for the model,
runtime, synthetic audio, and upstream training-source licenses.

## Browser implementation

The app uses a lazy dedicated Worker and `numThreads = 1` for compatibility without cross-origin isolation. `scripts/copy-asr-runtime.mjs` copies the matching standard ONNX `.mjs` and `.wasm` into `/asr-runtime/`; the build omits ONNX's unused 27 MB asyncify fallback. No inference code runs on the UI thread.

The runtime constructs `AutomaticSpeechRecognitionPipeline` from the known Whisper model, tokenizer, and processor instead of using generic pipeline discovery. Transformers.js 4.3.1's tokenizer discovery still probes `main/tokenizer_config.json` without forwarding its revision. A narrowly scoped `env.fetch` adapter resolves that exact model's metadata to the pinned revision and existing cache. The nine required model/runtime assets use `paso-speech-base-v1`; cache completeness is checked before the UI offers “Enable speaking” as already saved. This fixes the observed cold-worker/offline-reload failure without fetching unpinned model metadata.

Microphone capture uses `MediaRecorder`, browser decoding, mono conversion, and resampling to 16 kHz. Recordings are limited to 12 seconds; empty/very quiet recordings are rejected before inference. Generation caps at 64 new tokens and prevents repeating three-token sequences. Implausibly long output is rejected, and a two-minute inference timeout plus the typing alternative allows recovery. Microphone tracks stop on finish/cancel/navigation, and object URLs are revoked. The reference voice stops when recording begins.

Browser verification uses a licensed synthetic “Me llamo Alex” fixture routed through a fake microphone stream. Recording, media decoding, the actual WASM model, transcript matching, playback, persistence, permission denial, and cached offline reload are tested. This fixture is not a human-accent benchmark and does not open the developer's physical microphone. Refer to `VERIFICATION.md` for the final browser matrix.
