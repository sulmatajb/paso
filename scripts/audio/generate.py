"""Synthesize every course phrase with pinned, local Kokoro-82M CPU inference."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time

from download import sha256, verified_models

ROOT = Path(__file__).resolve().parents[2]
SPEED = 0.92
VOICES = [
    {"id": "ef_dora", "name": "Dora", "language": "es", "description": "Spanish · feminine synthetic voice"},
    {"id": "em_alex", "name": "Alex", "language": "es", "description": "Spanish · masculine synthetic voice"},
    {"id": "em_santa", "name": "Santa", "language": "es", "description": "Spanish · masculine synthetic voice"},
    {"id": "af_heart", "name": "Heart", "language": "en", "description": "American English · feminine synthetic voice"},
    {"id": "am_michael", "name": "Michael", "language": "en", "description": "American English · masculine synthetic voice"},
    {"id": "ff_siwis", "name": "Siwis", "language": "fr", "description": "French · feminine synthetic voice"},
]
PHONEMIZER_LANGUAGES = {"es": "es", "en": "en-us", "fr": "fr-fr"}


def safe_id(value: str) -> str:
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", value):
        raise ValueError(f"Unsafe content identifier: {value!r}")
    return value


def phrase_jobs(content_dir: Path) -> list[dict]:
    jobs = []
    keys = set()
    for course_path in sorted(content_dir.glob("*.json")):
        course = json.loads(course_path.read_text())
        language = course["targetLanguage"]
        if isinstance(language, dict):
            language = language["code"]
        language = language.split("-")[0]
        if language not in PHONEMIZER_LANGUAGES:
            raise ValueError(f"Configure voices and phonemizer language for {language!r}")
        for lesson in course["lessons"]:
            for phrase in lesson["phrases"]:
                key = "/".join(safe_id(item) for item in (course["id"], lesson["id"], phrase["id"]))
                if key in keys:
                    raise ValueError(f"Duplicate phrase key: {key}")
                keys.add(key)
                if not isinstance(phrase["target"], str) or not phrase["target"].strip():
                    raise ValueError(f"Empty phrase: {key}")
                for voice in VOICES:
                    if voice["language"] == language:
                        jobs.append({"key": key, "text": phrase["target"], "language": language, "voice": voice["id"]})
    if not jobs:
        raise ValueError(f"No course phrases in {content_dir}")
    return jobs


def save_manifest(path: Path, manifest: dict) -> None:
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    os.replace(temporary, path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--content-dir", type=Path, default=ROOT / "src/content/courses")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "public/audio")
    parser.add_argument("--force", action="store_true", help="Regenerate even when text and model are unchanged")
    args = parser.parse_args()
    if not shutil.which("ffmpeg"):
        parser.error("ffmpeg is required to encode compact MP3 assets")
    jobs = phrase_jobs(args.content_dir)
    lock = verified_models(args.model_dir)
    # Import heavy inference dependencies only after content/model validation.
    import numpy as np
    from kokoro_onnx import Kokoro
    import soundfile as sf

    args.output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = args.output_dir / "manifest.json"
    previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"clips": {}}
    manifest = {
        "schemaVersion": 1,
        "model": {**lock["model"], "files": lock["files"]},
        "audioLicense": "CC-BY-SA-4.0",
        "voices": VOICES,
        "generation": {"speed": SPEED, "sampleRate": 24000, "codec": "mp3", "bitrateKbps": 64},
        "clips": {},
    }
    model = None
    started = time.monotonic()
    for number, job in enumerate(jobs, start=1):
        relative = Path(job["key"]) / f"{job['voice']}.mp3"
        path = args.output_dir / relative
        fingerprint = hashlib.sha256(json.dumps({**job, "model": lock, "speed": SPEED, "format": "mp3-64k-v1"}, sort_keys=True).encode()).hexdigest()
        cached = previous.get("clips", {}).get(job["key"], {}).get(job["voice"])
        if not args.force and cached and cached.get("generationKey") == fingerprint and path.exists() and sha256(path) == cached.get("sha256"):
            clip = cached
        else:
            if model is None:
                model = Kokoro(str(args.model_dir / "kokoro-v1.0.onnx"), str(args.model_dir / "voices-v1.0.bin"))
            samples, sample_rate = model.create(job["text"], voice=job["voice"], speed=SPEED, lang=PHONEMIZER_LANGUAGES[job["language"]])
            duration = len(samples) / sample_rate
            peak = float(np.max(np.abs(samples)))
            rms = float(np.sqrt(np.mean(samples ** 2)))
            if not np.all(np.isfinite(samples)) or duration < 0.2 or duration > 30 or peak < 0.01 or rms < 0.001:
                raise RuntimeError(f"Invalid/silent inference output for {job}: duration={duration}, peak={peak}, rms={rms}")
            # Small silence pads keep initial/final consonants away from playback boundaries.
            padding = np.zeros(int(sample_rate * 0.08), dtype=samples.dtype)
            samples = np.concatenate([padding, samples, padding])
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(dir=args.model_dir, prefix="encode-") as temporary:
                wav = Path(temporary) / "speech.wav"
                mp3 = Path(temporary) / "speech.mp3"
                sf.write(wav, samples, sample_rate, subtype="PCM_16")
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-map_metadata", "-1", "-ac", "1", "-ar", str(sample_rate), "-c:a", "libmp3lame", "-b:a", "64k", str(mp3)], check=True)
                shutil.copyfile(mp3, path)
            clip = {"url": "/audio/" + relative.as_posix(), "text": job["text"], "language": job["language"], "durationSeconds": round(len(samples) / sample_rate, 3), "sampleRate": sample_rate, "bytes": path.stat().st_size, "sha256": sha256(path), "generationKey": fingerprint}
        manifest["clips"].setdefault(job["key"], {})[job["voice"]] = clip
        if number % 10 == 0 or number == len(jobs):
            print(f"{number}/{len(jobs)} clips ready ({time.monotonic() - started:.1f}s)", flush=True)
    save_manifest(manifest_path, manifest)
    print(f"Wrote {manifest_path}: {len(manifest['clips'])} phrases / {len(jobs)} clips", flush=True)


if __name__ == "__main__":
    main()
