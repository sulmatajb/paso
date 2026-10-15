"""Fetch pinned models once on the host; never download weights on learner phones."""
import argparse
import hashlib
import json
import os
import urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--speech', action='store_true', help='Include Whisper and Kokoro')
parser.add_argument('--only-speech', action='store_true', help='Skip Qwen')
parser.add_argument('--directory', type=Path, default=Path(__file__).resolve().parent/'models')
args = parser.parse_args()
root = args.directory
root.mkdir(parents=True, exist_ok=True)
files = json.loads(Path(__file__).with_name('models.lock.json').read_text())

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

for item in files:
    if item['service'] == 'speech' and not (args.speech or args.only_speech):
        continue
    if item['service'] == 'conversation' and args.only_speech:
        continue
    target = root/item['name']
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and digest(target) == item['sha256']:
        print(f"{item['name']}: verified existing file", flush=True)
        continue
    temporary = target.with_suffix(target.suffix+'.part')
    try:
        with urllib.request.urlopen(item['url'], timeout=120) as source, temporary.open('wb') as dest:
            while chunk := source.read(1024*1024):
                dest.write(chunk)
        if digest(temporary) != item['sha256']:
            raise RuntimeError(f"Checksum mismatch: {item['name']}")
        os.replace(temporary, target)
        print(f"{item['name']}: downloaded and verified", flush=True)
    finally:
        temporary.unlink(missing_ok=True)
