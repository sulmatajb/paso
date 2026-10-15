import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const target = resolve('public/asr-runtime');
await mkdir(target, { recursive: true });
for (const filename of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'])
  await copyFile(resolve('node_modules/onnxruntime-web/dist', filename), resolve(target, filename));
console.log('Prepared same-origin ONNX speech runtime.');
