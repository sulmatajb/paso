"""Download the pinned public model assets; verify before inference. No API key."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from urllib.request import urlopen

LOCK_PATH = Path(__file__).with_name("models.lock.json")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verified_models(model_dir: Path, *, download: bool = False, lock_path: Path = LOCK_PATH) -> dict:
    lock = json.loads(lock_path.read_text())
    model_dir.mkdir(parents=True, exist_ok=True)
    for spec in lock["files"]:
        destination = model_dir / spec["name"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists() and download:
            temporary = destination.with_suffix(destination.suffix + ".part")
            print(f"Downloading {spec['name']} ({spec['bytes'] / 1_000_000:.1f} MB)", flush=True)
            with urlopen(spec["url"], timeout=60) as source, temporary.open("wb") as file:
                while chunk := source.read(1024 * 1024):
                    file.write(chunk)
            if temporary.stat().st_size != spec["bytes"] or sha256(temporary) != spec["sha256"]:
                temporary.unlink()
                raise RuntimeError(f"Downloaded file did not match the pinned hash: {spec['name']}")
            os.replace(temporary, destination)
        if not destination.exists():
            raise FileNotFoundError(f"Missing {destination}; run download.py first")
        if destination.stat().st_size != spec["bytes"] or sha256(destination) != spec["sha256"]:
            raise RuntimeError(f"Model integrity check failed: {destination}")
        print(f"Verified {spec['name']}", flush=True)
    return lock


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", required=True, type=Path)
    args = parser.parse_args()
    verified_models(args.model_dir, download=True)
