# Verification — 2026-10-14

## Public repository verification

The source release was installed from the lockfile, built, and exercised from a fresh GitHub clone. The documented local development identity, D1 initialization, and `.dev.vars` community configuration were verified without consuming live GPU quota. All 42 unit/integration tests and the original 27-case browser matrix passed on the development Mac, and all 588 audio clips passed checksum and full decoding checks. Gitleaks scanned the public Git history with only the documented generated-fingerprint and class-import exceptions.

The first Linux CI run passed 26 browser cases but could not start the WebKit recorder. An isolated diagnostic run established that `typeof MediaRecorder` is `undefined` in that Playwright Linux WebKit build. The CI matrix therefore runs Chromium on Linux and the real WebKit recording path on macOS. The local default follows the same platform boundary. An additional browser case explicitly verifies the typed fallback when recording is unavailable. This is an OS/runtime limitation, not evidence of physical-phone compatibility. Current remote results are linked by the README's CI badge.

## Free Hugging Face community server

The public Space `bessi190/paso-voice-practice` is running commit `8f7bbba7794965d22c606082ef092c9ba9ada91c` on verified `zero-a10g` (ZeroGPU Free) hardware. No paid hardware, subscription, Inference Provider, or owner token is configured. The app integration uses `HUGGINGFACE_SPACE` and anonymous direct browser requests, with a link to the canonical Space for signed-in personal allowance. Being signed in elsewhere does not automatically authenticate Paso's cross-origin requests.

- A real anonymous API turn passed through Whisper → Qwen → Kokoro. The bundled Spanish clip produced “Me llamo Alex.”; Qwen answered the learner's question in Spanish; Kokoro returned a valid 24 kHz WAV. One smoke run took approximately 2.7 seconds for transcription, 4.2 seconds for the reply, and 7.3 seconds for speech. These include API overhead and are not latency or capacity guarantees.
- All six configured voices generated real audio remotely, covering Spanish, French, and English. Public API discovery confirms `/transcribe`, `/reply`, and `/speak`. The signed-in canonical Space generated a relevant French reply after the anonymous API allowance was exhausted.
- 42 unit/integration tests pass, including anonymous transport configuration, bounded history, quota errors without fallback, cancellation and timeout during cold startup, WAV uploads, and audio URL checks. These transport checks use controlled responses; the API smoke above uses the real hosted models.
- Six frontend cases passed across desktop Chromium, phone-sized Chromium, and phone-sized WebKit. They cover no-download community controls, the canonical fallback link, privacy disclosure, and the prior server-recording flow. Those UI cases use controlled configuration/transcription responses.
- The real remote-model browser case passed on phone-sized Chromium with WebGPU disabled. It records a synthetic clip through MediaRecorder, sends it to the actual Space, reviews/corrects the transcript, receives a generated reply, plays generated audio, and reloads saved history. No model weights or WASM runtime downloads were requested. A WebKit run completed these assertions, but test teardown failed when overlapping test processes used the same artifact directory; the isolated repeat was blocked by the free quota. A clean WebKit real-model suite pass is therefore not claimed.
- The actual anonymous allowance was exhausted during verification. This exposed a missing Gradio status-event subscription, which was fixed. Separate real quota cases then passed in both mobile Chromium and mobile WebKit: the interface states the free limit, preserves the learner's message, enables retry, and links to the signed-in canonical Space. The app does not pool an owner token, change identities, purchase credits, or switch providers.
- TypeScript, production build, formatting of changed application files, and Python compilation pass. Gradio's temporary audio cache is disclosed in the interface and privacy document; periodic cleanup is enabled.

Daily quota, queueing, cold starts, recognition mistakes, and model-language errors remain limitations. The editable transcript is intentional: the same synthetic clip produced imperfect wording through WebKit's recording codec. Physical phones and human microphones have not been tested in this update.

## Server speech update

The complete server mode now includes Whisper recognition, Qwen replies, and Kokoro voices. The app advertises each configured capability independently and discloses recording uploads before microphone use. No paid API or hosting service was provisioned.

- 36 unit/integration tests pass. New coverage checks authenticated same-origin recognition, strict PCM WAV validation, actual byte limits without Content-Length, fixed upstream routing, request quotas, malformed/busy upstream responses, and absence of audio persistence.
- The server-mode browser case passed on desktop Chromium, phone-sized Chromium, and phone-sized WebKit with WebGPU disabled and no model download requests. It records a synthetic clip through the real MediaRecorder/decoder/resampler, reviews the returned transcript, and exercises a failed-recognition retry/typed fallback. The recognition response is controlled in this browser test; actual model execution is tested separately below. WebKit's debugging interface does not expose Blob upload bytes; byte assertions run in Chromium and server unit tests.
- The Python HTTP service ran natively with real pinned Whisper Base and Kokoro. Whisper recognized the bundled Spanish clip as “Me llamo Alex.” in about 0.52 seconds after startup; Kokoro produced a 24 kHz WAV reply in about 0.84 seconds on the development Mac. Authentication and malformed-input checks passed. These are single-request smoke measurements, not capacity benchmarks. Reproduce with `self-host/tts/smoke-test.py`.
- TypeScript, production build, formatting, Python compilation, and Docker Compose configuration validation pass. The Docker daemon was unavailable, so the complete Compose/Qwen-GGUF stack is still not claimed tested end to end.
- That earlier update left the Site in optional local mode. The free community server described above was created and validated in the subsequent update.

## Earlier phase 4 checks

TypeScript and the production Worker/client/PWA build pass. All 32 unit/integration tests pass, including the original curriculum/FSRS checks and new placement scoring, idempotent application, conversation persistence, conflict merging, authenticated D1 isolation, revision conflicts, request limits, and inference-route quotas. Server tests execute a local D1 implementation; model-gateway tests use a controlled upstream fixture.

The original 25 Spanish lessons, 300 exercises, 190 phrases, English/French starter lessons, and 588 bundled voice clips are retained. Phase 3's audio hashes, codec/decoding checks, and synthetic ASR comparison remain documented in `scripts/audio/`.

## Browser validation

The ordinary matrix comprises 24 cases across desktop Chromium, phone-sized Chromium, and phone-sized WebKit. Development failures were corrected and the affected cases rerun successfully. It covers:

- Lesson completion, hints, wrong answers, reload/resume, prerequisites, XP, and course switching.
- Spaced repetition, mistake review, durable scheduling, phrase search, voice selection, JSON export, offline shell, downloaded audio, and HTTP 206 audio seeking.
- Keyboard/focus behavior, unavailable storage, failed writes, and responsive layouts down to 320 CSS pixels. Representative views pass Axe WCAG 2 A/AA and 2.1 AA scans.
- Real Whisper Base q8 inference through MediaRecorder, decoding, and resampling; recording cleanup, transcript persistence, permission-denied and typed fallbacks, and cached offline inference.
- Placement resume and application; signed-out/signed-in account separation; explicit guest-progress import; authenticated synchronization between two isolated browser contexts; offline changes and reconnection conflict merging.

Browser account tests use development identity headers against the real local API/D1 database. They do not prove the production sign-in provider flow. The six new account/placement/layout cases were rerun after the final import-banner and model-copy changes.

## Actual conversation model evaluation

Six open models were compared using real generated responses. Qwen3.5-4B was selected after smaller models showed repetition or malformed Spanish/French. A nine-turn sample across Spanish, French, and English was run at both 0.7 and 0.4 temperature. The selected 0.4 configuration produced relevant responses but still one awkward Spanish greeting and occasional invented context. This is a narrow smoke test, not a validated teaching-quality benchmark.

On the tested M4 Mac with 16 GB unified RAM and Chrome 155, the selected model took approximately 125 seconds to download/load from a cold cache, four seconds from a warm cache, and a median 2.17 seconds per reply. These measurements are from the isolated research fixture, not a promise for other devices. The optional pack is about 2.4 GB. Budget roughly 4 GB of GPU memory plus browser/speech overhead.

The app's separate real-model suite passed end to end in three minutes on the test machine. It exercises Whisper → editable transcript → Qwen-generated response → Kokoro playback, saved history, completion, reload, accessibility, and an offline restart. It uses a disposable regular Chrome profile because private-mode cache quotas can be smaller than the model pack. It injects a licensed synthetic microphone fixture; it never opens the developer's physical microphone. No canned chat reply or paid inference API is used.

## Self-hosting evidence

The optional Python Kokoro HTTP service was tested with real Spanish/French WAV generation and authentication/input-error cases. The pinned GGUF metadata and llama.cpp container recipe were verified against primary sources. The Docker stack has not been run end to end. The independently deployed Hugging Face server is described above.

## Practical limits

- Physical phones, real human microphones, accents/noise, battery usage, low-memory behavior, and load/concurrency still need testing. Phone-sized browser emulation does not establish those properties.
- A compatible WebGPU device is required for local conversations. Lessons, placement, and transcription have separate requirements. Hosts can configure server inference for devices unable to run Qwen locally.
- Generated dialogue can be wrong. No model-generated grammar or pronunciation score determines mastery.
- Placement is an original Spanish curriculum entry check, not certified CEFR assessment. English and French have starter lessons and conversation support, not full courses or placement tests.
- Teacher and fluent-speaker editorial review remains pending. The app is a working beta, not a Duolingo-scale curriculum or a complete production operations program.
- Accounts use Sites sign-in. Other hosts must supply verified identity; see README and SECURITY. Account sync stores confirmed transcripts and learning records, never raw recordings. Browser caches may be evicted. Arbitrary backup restore and account-deletion UI are not implemented.
- The original hosted learning app is owner-private; the voice Space is public. The GitHub source release has no deployment identity or private runtime state. Its current CI result is visible in the README badge.
