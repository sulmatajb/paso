---
title: Paso Voice Practice
emoji: 🗣️
colorFrom: green
colorTo: yellow
sdk: gradio
sdk_version: 6.30.0
python_version: 3.12
app_file: app.py
license: agpl-3.0
short_description: Free language conversation with Qwen, Whisper and Kokoro
---

# Paso · voice practice

An independent open-source language-practice demo for Spanish, French, and English. Phones send short recordings and receive text/audio; model weights remain on this Space.

**Choose free ZeroGPU hardware.** This package does not use an Inference Provider, paid API, owner API token, or automatic paid fallback. Free usage has queues and daily quotas. It is a community demo, not unlimited hosting. [Current ZeroGPU rules](https://huggingface.co/docs/hub/spaces-zerogpu).

## Deploy

1. In an eligible personal Hugging Face account, create a **public Gradio Space** and select **ZeroGPU** with a displayed free price. Stop if only paid hardware is offered.
2. Upload this directory's files at the Space repository root. Do not upload model weights, `.venv`, `__pycache__`, tokens, or the parent app's private hosting metadata.
3. Wait for the build and model loading. Verify the Space UI and all three API endpoints before connecting Paso.
4. Set the Paso server runtime variable `HUGGINGFACE_SPACE` to the exact `owner/space-name`. No Hugging Face owner token belongs in Paso. Restart/redeploy the app with this configuration.

The browser calls this public Space directly. Anonymous requests use HF's shared anonymous allowance. Opening the canonical Hugging Face Space while signed in permits use under the learner's own free allowance. Being signed in to HF elsewhere does **not** automatically grant signed-in quota to cross-origin requests from Paso. The app includes a canonical-link fallback and never purchases credits or rotates identities to bypass quotas.

## API

- `/transcribe`: Gradio audio file plus language `es`, `fr`, or `en`; returns one transcript. Recordings must be about 0.5–20 seconds. The user reviews the transcript before sending it to the conversation model.
- `/reply`: language, scene (`open`, `cafe`, `meet`, `town`, `weekend`), and a JSON string with up to ten recent `{role, content}` messages; returns one short reply. System prompts and role configuration are owned by the server.
- `/speak`: text (maximum 500 characters), language, voice; returns a WAV file. Spanish: `ef_dora`, `em_alex`, `em_santa`; French: `ff_siwis`; English: `af_heart`, `am_michael`.

Inference is queued with one active chat job and one speech job. Qwen requests up to 30 seconds of ZeroGPU time per invocation; actual runtime and availability must be measured on the deployed Space. Whisper and Kokoro use CPU. Limits return errors rather than triggering paid inference or downloads on phones.

## Privacy

This Space receives recordings, text to synthesize, and recent conversation history. There is no training, analytics integration, or persistent conversation database in this app. Gradio temporarily stores uploaded/generated files; `delete_cache=(60,60)` enables periodic cleanup. These files are not encrypted from the host and are not a suitable place for private information. The host platform controls its infrastructure logs and retention. Paso's separate account sync retains confirmed text, not recordings. The standalone Space keeps conversation state only for the active Gradio session.

## Open models and attribution

- [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B), Apache 2.0, revision `851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a`.
- [Whisper Base conversion](https://huggingface.co/Systran/faster-whisper-base), MIT, revision `ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66`; faster-whisper/CTranslate2 use MIT.
- [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), Apache 2.0. Kokoro-ONNX is MIT. Kokoro/eSpeak NG phonemization dependencies include GPL-3.0-or-later components. Pinned model files and hashes are in `models.lock.json`; preserve the included notices when redistributing.
- App code: AGPL-3.0-only. Paso contains original material and is not affiliated with Duolingo.

Generated language can contain errors. This is a practice partner, not a certified curriculum or pronunciation examiner.
