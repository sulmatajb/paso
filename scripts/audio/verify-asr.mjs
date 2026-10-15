/** Real local inference smoke test; fixtures are synthetic, not a human benchmark. */
import { pipeline, env } from '@huggingface/transformers';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const args = process.argv.slice(2);
const modelOption = args.indexOf('--model-dir');
if (modelOption < 0 || !args[modelOption + 1]) {
  throw new Error(
    'Usage: node scripts/audio/verify-asr.mjs --model-dir /external/model/cache [--model tiny|base] [--expanded] [--output /external/results.json]',
  );
}
const modelPath = resolve(args[modelOption + 1]);
const variantOption = args.indexOf('--model');
const variant = variantOption >= 0 ? args[variantOption + 1] : 'base';
if (!['tiny', 'base'].includes(variant)) throw new Error('--model must be tiny or base');
const lockName = variant === 'base' ? 'asr-base-model.lock.json' : 'asr-model.lock.json';
const lock = JSON.parse(await readFile(resolve(here, lockName), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(root, 'public/audio/manifest.json'), 'utf8'));
for (const file of lock.files) {
  const bytes = await readFile(resolve(modelPath, file.name));
  if (
    bytes.byteLength !== file.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== file.sha256
  ) {
    throw new Error(`Integrity failure: ${file.name}`);
  }
}

// These options guarantee this verification performs no remote model requests.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useFSCache = false;
const started = performance.now();
const transcriber = await pipeline('automatic-speech-recognition', modelPath, {
  dtype: 'q8',
  device: 'cpu',
});
const modelLoadMs = Math.round(performance.now() - started);
let selections = [
  ['es-from-en/es-first-hello/hello', 'ef_dora', 'spanish'],
  ['es-from-en/es-first-hello/name', 'ef_dora', 'spanish'],
  ['es-from-en/es-first-day-check/check-order', 'ef_dora', 'spanish'],
  ['es-from-en/es-first-day-check/check-order', 'em_alex', 'spanish'],
  ['es-from-en/es-first-day-check/check-order', 'em_santa', 'spanish'],
  ['es-from-en/es-finding-your-way/directions-station', 'ef_dora', 'spanish'],
  ['es-from-en/es-getting-to-know-you/smalltalk-spanish', 'ef_dora', 'spanish'],
  ['en-from-es/en-first-hello/en-hello', 'af_heart', 'english'],
  ['fr-from-en/fr-first-bonjour/fr-name', 'ff_siwis', 'french'],
];
if (args.includes('--expanded')) {
  const course = JSON.parse(
    await readFile(resolve(root, 'src/content/courses/es-en.json'), 'utf8'),
  );
  selections = course.lessons
    .slice(5)
    .map((lesson) => [`${course.id}/${lesson.id}/${lesson.phrases[0].id}`, 'ef_dora', 'spanish']);
}
const results = [];
try {
  for (const [key, voice, language] of selections) {
    const clip = manifest.clips[key]?.[voice];
    if (!clip) throw new Error(`Missing fixture ${key}/${voice}`);
    const decoded = spawnSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-i',
        resolve(root, `public${clip.url}`),
        '-ac',
        '1',
        '-ar',
        '16000',
        '-f',
        'f32le',
        'pipe:1',
      ],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    if (decoded.error || decoded.status !== 0) {
      throw decoded.error ?? new Error(decoded.stderr.toString());
    }
    const waveform = new Float32Array(decoded.stdout.byteLength / 4);
    for (let i = 0; i < waveform.length; i++) waveform[i] = decoded.stdout.readFloatLE(i * 4);
    const before = performance.now();
    const output = await transcriber(waveform, {
      language,
      task: 'transcribe',
      max_new_tokens: 64,
      do_sample: false,
    });
    if (typeof output.text !== 'string') throw new Error('Invalid ASR response');
    const result = {
      key,
      voice,
      fixtureKind: 'synthetic-Kokoro-82M',
      expected: clip.text,
      actual: output.text.trim(),
      milliseconds: Math.round(performance.now() - before),
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }
} finally {
  await transcriber.dispose();
}
const report = {
  model: lock.model,
  backend: 'onnxruntime-node CPU; separate browser WASM verification is required',
  modelLoadMs,
  fixtures: 'Paso synthetic Kokoro clips; not a human speech or pronunciation benchmark',
  results,
};
const outputOption = args.indexOf('--output');
if (outputOption >= 0 && args[outputOption + 1]) {
  await writeFile(resolve(args[outputOption + 1]), JSON.stringify(report, null, 2) + '\n');
}
console.log(
  `Completed ${results.length} actual local model transcriptions. Inspect differences; this is not an accuracy certification.`,
);
