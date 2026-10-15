# Paso speech attribution

The lesson clips in `/audio/` are synthetic speech generated locally from Paso's
original course text. They are not human recordings or custom voice clones.
Paso contributors make their original lesson content and generated audio
available under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/),
to the extent copyright applies. The repository's `LICENSE-CONTENT` contains
the full license text.

## Model and inference software

- **Kokoro-82M v1.0**, by hexgrad and contributors. The model and supplied voice
  embeddings are identified as **Apache-2.0** in the
  [official model card](https://huggingface.co/hexgrad/Kokoro-82M).
  A copy of the license is in `Apache-2.0.txt`.
- **kokoro-onnx 0.6.1**, by thewh1teagle and contributors, **MIT**. See
  `kokoro-onnx-MIT.txt` and the
  [upstream repository](https://github.com/thewh1teagle/kokoro-onnx).
- The ONNX model and voice bundle come from the upstream
  [`model-files-v1.1` release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1).
  Exact download URLs, SHA-256 hashes and versions are recorded in
  `/audio/manifest.json` and `scripts/audio/models.lock.json`.
- Runtime generation also uses ONNX Runtime, NumPy, phonemizer and its bundled
  eSpeak NG library. These are development-time dependencies installed from
  `scripts/audio/requirements.txt`; they and the model weights are not bundled
  in the web application. Their package licenses remain with those packages.

## Optional local speech recognition

- **Whisper Base and Tiny**, OpenAI, **MIT** for both code and model weights. See
  `Whisper-MIT.txt` and the [official repository](https://github.com/openai/whisper).
  The license snapshot is from upstream commit
  `86098128c0b4f24f0e2aa2994de830614b474227`.
- **onnx-community/whisper-tiny**, the ONNX Community's conversion of
  `openai/whisper-tiny`, revision
  `ff4177021cc41f7db950912b73ea4fdf7d01d8e7`. The conversion's
  [model card](https://huggingface.co/onnx-community/whisper-tiny)
  identifies its upstream model. Tiny was evaluated as a smaller q8 candidate.
  Required files, sizes and SHA-256 checksums are pinned in
  `scripts/audio/asr-model.lock.json`. Model weights are not stored in Git.
- **onnx-community/whisper-base**, the app’s default multilingual recognizer,
  revision `1846881b6b3a3024392c1eea3ad983695bc23925`:
  [conversion model card](https://huggingface.co/onnx-community/whisper-base).
  Its q8 encoder and merged decoder are pinned in
  `scripts/audio/asr-base-model.lock.json`. The model is downloaded only when
  the learner enables local speech recognition.
  OpenAI's original Whisper repository licenses the code and model weights
  under MIT. The Hugging Face `openai/whisper-base` model card also labels its
  repository Apache-2.0; both upstream license texts are retained here.
- **Transformers.js 4.3.1**, Hugging Face and contributors, **Apache-2.0**:
  `Transformers.js-Apache-2.0.txt`.
- **ONNX Runtime Web 1.31.0-dev.20260914-8d85527a0**, Microsoft and contributors,
  **MIT**: `ONNX-Runtime-MIT.txt`. The same-origin WASM runtime is copied from
  that npm dependency. Its upstream dependency notices are retained in
  `ONNX-Runtime-ThirdPartyNotices.txt`.

The ASR smoke-test fixtures are Paso's existing, labeled Kokoro-generated clips
under the content license above. No microphone recording or third-party human
recording was collected to make those fixtures.

## Upstream training-data attribution

We retain the model author's training-data credits; the original datasets are
not distributed in Paso.

- **SIWIS French Speech Synthesis Database, 2016**: Junichi Yamagishi,
  Pierre-Edouard Honnet, Philip Garner and Alexandros Lazaridis (2017).
  University of Edinburgh, Centre for Speech Technology Research.
  [doi:10.7488/ds/1705](https://doi.org/10.7488/ds/1705), **CC BY 4.0**
  (`SIWIS-CC-BY-4.0.txt`). Kokoro's French `ff_siwis` synthetic voice is associated
  with this training source. Paso's audio is newly synthesized from different
  text, encoded as MP3, with short silence padding.
- **Koniwa / tnc**: open Japanese narration collection, including Television
  Nishinippon announcers' recordings, **CC BY 3.0**.
  [Upstream collection](https://github.com/koniwa/koniwa) ·
  [license](https://creativecommons.org/licenses/by/3.0/).
  The Kokoro model card credits this source in its shared training set.

Snapshots of the model author's model card and voice inventory are retained as
`upstream-model-card.md` and `upstream-VOICES.md`, at revision
`f3ff3571791e39611d31c381e3a41a3af07b4987`. Attribution does not imply endorsement
of Paso by any model author, dataset contributor, or voice performer.
