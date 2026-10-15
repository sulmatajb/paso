# Conversation and generated speech credits

Paso source is AGPL-3.0-only. Model downloads are optional and governed by their own licenses.

- **Qwen3.5-4B**, Alibaba Cloud / Qwen Team. Apache-2.0 model weights. Original: https://huggingface.co/Qwen/Qwen3.5-4B . MLC conversion: https://huggingface.co/mlc-ai/Qwen3.5-4B-q4f16_1-MLC . Immutable revision, library URL, and weight hashes are in `scripts/models/conversation.lock.json`.
- **WebLLM**, MLC AI. Apache-2.0. https://github.com/mlc-ai/web-llm . Paso pins npm version 0.2.86.
- **Kokoro-82M v1.0**, hexgrad. Apache-2.0 model. The Transformers.js ONNX conversion is pinned to `onnx-community/Kokoro-82M-v1.0-ONNX` revision `1939ad2a8e416c0acfeecc08a694d14ef25f2231`. https://huggingface.co/hexgrad/Kokoro-82M . https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX . Voice provenance and SIWIS attribution also apply; see `/licenses/audio/NOTICE.md`.
- **ephone 1.0.2**, sjmik, including eSpeak NG. GPL-3.0-or-later. Unmodified browser phonemizer package. Source and build instructions: https://github.com/sjmik/ephone-js . Underlying eSpeak NG: https://github.com/espeak-ng/espeak-ng . License: `ephone-GPL-3.0.txt`.
- **Whisper Base**, OpenAI. MIT. **Transformers.js** and **ONNX Runtime** license copies are under `/licenses/audio/`.

No voice is advertised as a certified regional accent. Runtime model responses are synthetic and can be inaccurate. Model publishers receive download requests; local inference does not send recordings or conversation text to them.
