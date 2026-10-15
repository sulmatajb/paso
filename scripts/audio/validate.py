"""Verify course coverage, content provenance, hashes and decodable audio."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess

from download import sha256
from generate import ROOT, phrase_jobs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--content-dir", type=Path, default=ROOT / "src/content/courses")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "public/audio")
    args = parser.parse_args()
    manifest = json.loads((args.output_dir / "manifest.json").read_text())
    jobs = phrase_jobs(args.content_dir)
    total_bytes = 0
    total_seconds = 0.0
    failures = []
    for job in jobs:
        clip = manifest.get("clips", {}).get(job["key"], {}).get(job["voice"])
        if not clip:
            failures.append(f"Missing {job['key']} / {job['voice']}")
            continue
        try:
            expected = "/audio/" + job["key"] + "/" + job["voice"] + ".mp3"
            assert clip["url"] == expected, f"Unexpected URL {clip['url']}"
            assert clip["text"] == job["text"], "Content changed; regenerate audio"
            path = args.output_dir / clip["url"].removeprefix("/audio/")
            assert sha256(path) == clip["sha256"], "Audio checksum differs"
            assert path.stat().st_size == clip["bytes"], "Audio size differs"
            probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_name,sample_rate,channels", "-of", "json", str(path)], check=True, capture_output=True, text=True)
            metadata = json.loads(probe.stdout)
            stream = metadata["streams"][0]
            duration = float(metadata["format"]["duration"])
            assert stream["codec_name"] == "mp3" and stream["sample_rate"] == "24000" and stream["channels"] == 1, "Unexpected codec"
            assert 0.2 < duration < 30, f"Unexpected duration: {duration}"
            subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"], check=True, capture_output=True)
            total_bytes += path.stat().st_size
            total_seconds += duration
        except (AssertionError, OSError, subprocess.CalledProcessError, KeyError, ValueError) as error:
            failures.append(f"{job['key']} / {job['voice']}: {error}")
    if failures:
        raise SystemExit("\n".join(failures))
    print(f"PASS: {len(jobs)} clips across {len(manifest['clips'])} phrases; {total_bytes:,} bytes; {total_seconds:.1f}s; full decode and SHA-256 verified")


if __name__ == "__main__":
    main()
