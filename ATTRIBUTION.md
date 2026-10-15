# Attribution

- Original application, lesson text, brand treatment, and illustrations: Paso contributors, 2026. No third-party curriculum or Duolingo assets are used.
- React / React DOM: Meta and contributors, MIT.
- Dexie: David Fahlander and contributors, Apache-2.0.
- Zod: Colin McDonnell and contributors, MIT.
- Lucide icons: Lucide contributors, ISC; includes upstream Feather-derived icons under MIT.
- DM Sans and Fraunces: their respective font authors, SIL Open Font License 1.1, distributed via Fontsource. Font license files are included in `public/licenses/`.
- Vite, TypeScript, Vitest, Playwright, axe-core, and Prettier are development tooling with their own licenses in their packages.

The application license does not replace these licenses. Dependency versions are locked in `package-lock.json`. Original text is in `src/content/courses/*.json`; original illustration artwork is in `src/components/Artwork.tsx` and `public/favicon.svg`. Illustration artwork and course text are CC BY-SA 4.0; surrounding application code is AGPL-3.0-only.

Phase 2 additions:

- FSRS TypeScript implementation: [open-spaced-repetition/ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), MIT. Algorithm attribution retained through its dependency package.
- Kokoro-82M v1.0 model: Hexgrad contributors, Apache-2.0; `kokoro-onnx` runtime: MIT. All synthetic voices, upstream notices, and the French SIWIS training-source attribution are documented in [the audio notice](public/licenses/audio/NOTICE.md). See [speech generation](docs/speech.md) for pinned weights and reproducibility.
- Vite PWA plugin and Workbox provide service-worker generation and offline media support; their upstream licenses are retained in dependencies.
- Current original curriculum lives in `src/content/courses/*.json`. The former single-lesson file is superseded by these versioned packages.

Phase 3 additions:

- Whisper model: OpenAI, MIT; pinned ONNX conversion by onnx-community.
- Transformers.js: Hugging Face and contributors, Apache-2.0.
- ONNX Runtime: Microsoft and contributors, MIT, with third-party notices.
- Exact revisions, model/runtime licenses, and reproducible inference evidence are in [speech documentation](docs/speech.md) and [audio notices](public/licenses/audio/NOTICE.md).
