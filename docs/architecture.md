# Architecture and operating limits

## Models and device requirements

For ordinary phones, maintainers can connect the [free Hugging Face Space package](../self-host/huggingface/README.md). Whisper, Qwen, and Kokoro run on the Space; phones upload short recordings and receive text and audio without downloading weights. This uses free ZeroGPU with queues and daily quotas, not an unlimited service. The following download sizes apply only to the optional **on-device mode**.

The [Paso community demo](https://huggingface.co/spaces/bessi190/paso-voice-practice) runs this package on ZeroGPU Free. It supports Spanish, French, and English conversations and six synthetic voice choices.

| Feature                  | Open-source model         | Initial optional download                      | Runtime                  |
| ------------------------ | ------------------------- | ---------------------------------------------- | ------------------------ |
| Microphone transcription | Whisper Base q8           | About 94 MB including runtime                  | Browser WASM             |
| Generated conversation   | Qwen3.5-4B q4f16          | About 2.4 GB                                   | WebGPU with `shader-f16` |
| Generated partner voice  | Kokoro-82M q8             | About 94 MB, plus shared runtime if not cached | Browser WASM + ephone    |
| Lesson listening         | Kokoro pre-generated MP3s | Course audio only                              | Ordinary audio playback  |

The local chat model has a 2,048-token context and uses substantially more working memory than its download size. Budget roughly 4 GB of GPU memory, plus speech models; actual support depends on the device/browser. Current Chrome with a compatible GPU was tested. Devices without WebGPU can still use lessons, placement, and transcription, and can use conversations when the host configures a server model. Cached files can be evicted by the browser. A first download needs internet access. Use a regular browser window with at least 3 GB of free storage; private-browsing cache limits may prevent this model from loading.

Model revisions are pinned in source. Conversation weights and their hashes are in `scripts/models/conversation.lock.json`; speech recognition locks are in `scripts/audio/`. Dynamic Kokoro uses ONNX revision `1939ad2a8e416c0acfeecc08a694d14ef25f2231`. The multilingual phonemizer is `ephone@1.0.2` (GPL-3.0-or-later), not the English-only npm `phonemizer` wrapper.

## Accounts, sync, and privacy

Hosted identity is provided by Sites / Sign in with ChatGPT. Each request is authorized server-side using the stable authenticated user ID, never a user ID supplied in JSON. The database is partitioned by that ID; guest and signed-in records use separate IndexedDB databases locally. Sign-out does not delete a person's offline copy from the device.

Sync uses a revision check plus a deterministic merge and retries. Independent lesson completions and event records are retained. Concurrent review schedules keep one complete, latest FSRS state; they are not added together. Settings use their last edit timestamp. Simultaneous edits of one in-progress lesson can choose one run; completed credit is never removed. Offline changes are sent on reconnect, focus, or explicit **Sync now**. Clock errors can affect timestamp-based conflict choices. The current server accepts snapshots up to 1.8 MB (below [D1’s row limit](https://developers.cloudflare.com/d1/platform/limits/)) and returns a visible error rather than silently dropping oversized records.

Microphone audio is processed locally by default. When a maintainer enables server recognition, the interface discloses this and sends short recordings to that configured service. The bundled speech server processes audio in memory without writing recordings to disk. Confirmed transcripts and learning records are saved locally; they also sync when signed in. Model publishers receive ordinary model-file downloads. If a host enables a remote conversation or voice service, the app sends text to that configured service through authenticated server routes; microphone audio stays local unless server recognition is also enabled. There are no analytics or advertising SDKs.

The optional community Space is a separate mode: the browser sends recordings and text directly to that public Hugging Face Space. Gradio temporarily caches uploaded/generated audio and runs periodic cleanup. Paso never includes raw recordings in progress sync. See [privacy details](../PRIVACY.md) before using a public community demo.

Localhost and a hosted origin are separate installations. Account sync applies within the same deployment; it does not move guest records between unrelated origins. JSON export is a readable backup; file restore is not implemented. See [privacy details](../PRIVACY.md).

## Repository map

| Directory                           | Responsibility                                           |
| ----------------------------------- | -------------------------------------------------------- |
| `src/components/`                   | Learning, placement, account, and conversation screens   |
| `src/content/`                      | Validated courses, placement questions, catalog          |
| `src/conversation/`, `src/speech/`  | Optional local models and remote transports              |
| `src/sync/`, `src/storage.ts`       | Offline storage, account separation, sync and migrations |
| `app/api/`, `server/`               | Account, progress, and authenticated inference routes    |
| `db/`, `drizzle/`                   | Server schema and SQL migrations                         |
| `public/audio/`, `public/licenses/` | Bundled audio, provenance, third-party notices           |
| `self-host/`                        | Optional inference services and Hugging Face Space       |
| `tests/`                            | Unit, API, browser, and opt-in real-model verification   |

The server exposes a public Space ID, not an owner credential. With community mode enabled, browsers call Gradio directly. Otherwise configured inference services are reached through authenticated Worker routes, or the learner explicitly chooses local models. These modes have different privacy and capacity properties; see [PRIVACY.md](../PRIVACY.md).
