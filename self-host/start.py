"""One-time maintainer setup. No cloud account, paid API, or subscription is created."""
import os
import secrets
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
subprocess.run(['docker', 'compose', 'version'], check=True)
(root/'secrets').mkdir(exist_ok=True)
key = root/'secrets/inference-key.txt'
# Preserve existing keys when rerun. Never print the secret.
try:
    descriptor = os.open(key, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
except FileExistsError:
    if len(key.read_text().strip()) < 32:
        raise SystemExit('Existing inference-key.txt is invalid; replace it before starting.')
else:
    with os.fdopen(descriptor, 'w') as stream:
        stream.write(secrets.token_urlsafe(48))
subprocess.run([sys.executable, str(root/'download-models.py'), '--speech'], check=True)
subprocess.run(['docker', 'compose', 'up', '-d', '--build'], cwd=root, check=True)
print('Services started on localhost ports 8080 and 8880. See SELFHOST.md to connect Paso securely.')
