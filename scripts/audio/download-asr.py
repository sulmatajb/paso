"""Download pinned multilingual Whisper q8 files for local verification."""

import argparse
from pathlib import Path

from download import verified_models

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--model", choices=["tiny", "base"], default="base")
    args = parser.parse_args()
    lock_name = "asr-base-model.lock.json" if args.model == "base" else "asr-model.lock.json"
    verified_models(args.model_dir, download=True, lock_path=Path(__file__).with_name(lock_name))
