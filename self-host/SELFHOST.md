# Server conversations with no model downloads on phones

One maintainer runs **Qwen + Whisper + Kokoro**; learners only open Paso in their browser. The package requires no paid API, hosting subscription, or commercial model license. Use hardware you already own or compute donated by a contributor. Running hardware still consumes electricity and bandwidth; this source distribution does not supply an unlimited public server.

## Start once on the maintainer's computer

Requires Python 3.11+, Docker Compose, about 3.25 GB for model files plus container images, and sufficient RAM for inference. An 8 GB machine is a starting point for evaluation, not a tested capacity guarantee. CPU latency depends on hardware; all supplied services support CPU operation.

From this directory:

```sh
python3 start.py
```

The script preserves an existing secret, creates a random bearer key with restricted permissions if needed, downloads and verifies pinned models, then starts both containers. It never creates a cloud account or purchases hosting. Models download once on the host, not on each learner's phone. To stop:

```sh
docker compose down
```

Models and the secret remain for the next start. Keep `models/` and `secrets/` out of Git. Services bind only to localhost:

| Endpoint                   | Port | Model                          |
| -------------------------- | ---- | ------------------------------ |
| `/v1/chat/completions`     | 8080 | Qwen3.5-4B, alias `paso-qwen3` |
| `/v1/audio/transcriptions` | 8880 | Whisper Base, CPU int8         |
| `/v1/audio/speech`         | 8880 | Kokoro, six voices             |
| `/health`                  | 8880 | Speech readiness               |

For downloads without starting services, run `python3 download-models.py --speech`. `--only-speech` skips Qwen; `--directory PATH` uses another model directory.

## Connect Paso

Connect the services through an HTTPS reverse proxy on infrastructure you control. Localhost on your computer is **not** reachable from the existing hosted Paso Worker. Use an existing secured endpoint; this package does not open your router, create a public tunnel, or buy a domain. Configure these **server runtime variables**, never browser settings:

| Variable                | Value                                               |
| ----------------------- | --------------------------------------------------- |
| `CONVERSATION_URL`      | HTTPS endpoint ending in `/v1/chat/completions`     |
| `CONVERSATION_API_KEY`  | Contents of `secrets/inference-key.txt`             |
| `CONVERSATION_MODEL`    | `paso-qwen3`                                        |
| `VOICE_URL`             | HTTPS endpoint ending in `/v1/audio/speech`         |
| `VOICE_API_KEY`         | Same key                                            |
| `TRANSCRIPTION_URL`     | HTTPS endpoint ending in `/v1/audio/transcriptions` |
| `TRANSCRIPTION_API_KEY` | Same key                                            |

With all three endpoints configured, signed-in learners get recording, conversation replies, and generated voices without browser model downloads or WebGPU. Internet is required for these features. A partial configuration only moves the configured features to the server. Without configured endpoints, the existing optional on-device mode remains available; deployment alone does not start a model server.

Paso authenticates each request, checks origin and payload limits, and enforces a shared 30 requests/minute/account limit across chat, recognition, and voice. The speech service accepts only short PCM WAV recordings, requires its bearer key, serializes model inference, and processes audio in memory without saving recordings or logging text. Users see the recording destination before using the microphone. Overload returns a retryable error; there is no paid fallback.

Accounts outside Sites need a verified identity provider or authenticated gateway. See the main README; do not expose a raw Worker that trusts client-supplied identity headers.

## Free public demo option

A Hugging Face ZeroGPU Space may provide a quota-limited demo if the maintainer's personal account is eligible. This is optional, not an app dependency or an unlimited hosting promise. Current rules require a verified email and an account older than 30 days; free accounts may host two ZeroGPU Spaces. Users face queues and daily GPU quotas. Choose only free ZeroGPU hardware, without PRO, paid hardware, or purchased credits. [Official ZeroGPU rules](https://huggingface.co/docs/hub/spaces-zerogpu).

A browser must use the learner's own identity for signed-in quota. Do not proxy all visitors through the maintainer's token. External embeds do not automatically inherit a learner's Hugging Face login; the canonical Space page is the reliable signed-in route. No Space is provisioned by `start.py`.

## Model and dependency provenance

- Qwen3.5-4B: Apache 2.0. [Original](https://huggingface.co/Qwen/Qwen3.5-4B); [GGUF conversion](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF), revision `e87f176479d0855a907a41277aca2f8ee7a09523`.
- llama.cpp official image is pinned by digest in `compose.yaml`. Context: 2,048 tokens, one concurrent request, thinking disabled.
- [Whisper Base conversion](https://huggingface.co/Systran/faster-whisper-base), revision `ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66`; [faster-whisper](https://github.com/SYSTRAN/faster-whisper), MIT. The model uses the upstream Whisper MIT license.
- Kokoro assets, hashes, and model URLs are in `models.lock.json`; Python runtime requirements in `tts/requirements.txt`. [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx). Preserve the model and voice notices in `public/licenses/` when redistributing.

## Reproduce the speech smoke test

After downloading models, install `tts/requirements.txt` in a Python virtual environment and run:

```sh
python tts/smoke-test.py
# Or point at an existing verified model directory:
python tts/smoke-test.py --models-dir /path/to/models
```

This starts an ephemeral localhost server, recognizes a bundled synthetic Spanish clip, generates a real Kokoro reply, and checks authentication and malformed requests. It never opens a physical microphone or contacts a paid service.

## Verification boundary

See `../VERIFICATION.md` for actual test results. The Docker stack and Qwen GGUF conversion have not been exercised end to end on this development machine. Container build configuration is not a production capacity benchmark. Test your actual host, HTTPS gateway, authentication, and mobile browsers before inviting learners. Model responses can contain mistakes and are practice material, not pronunciation grades or certified instruction.
