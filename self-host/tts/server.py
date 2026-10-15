"""Authenticated, bounded Whisper and Kokoro endpoints. Put behind an HTTPS gateway."""
from __future__ import annotations
import hashlib
import hmac
import io
import json
import os
import struct
import threading
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(os.environ.get('PASO_MODELS_DIR', '/models'))
KEY = ''
MODEL = None
RECOGNIZER = None
VOICES = {'ef_dora':'es', 'em_alex':'es', 'em_santa':'es', 'ff_siwis':'fr-fr', 'af_heart':'en-us', 'am_michael':'en-us'}
LOCK = threading.Lock()
MAX_AUDIO = 44 + 21 * 16000 * 2


def load_models():
    global KEY, MODEL, RECOGNIZER
    from kokoro_onnx import Kokoro
    from faster_whisper import WhisperModel
    lockfile = Path(__file__).with_name('models.lock.json')
    if not lockfile.exists():
        lockfile = Path(__file__).parent.parent/'models.lock.json'
    for item in json.loads(lockfile.read_text()):
        if item['service'] != 'speech':
            continue
        with (ROOT/item['name']).open('rb') as stream:
            actual = hashlib.file_digest(stream, 'sha256').hexdigest()
        if not hmac.compare_digest(actual, item['sha256']):
            raise RuntimeError(f"Checksum mismatch: {item['name']}")
    KEY = Path(os.environ.get('PASO_KEY_FILE', '/run/secrets/inference_key')).read_text().strip()
    if len(KEY) < 32:
        raise RuntimeError('Inference key must contain at least 32 characters')
    MODEL = Kokoro(str(ROOT/'kokoro-v1.0.onnx'), str(ROOT/'voices-v1.0.bin'))
    RECOGNIZER = WhisperModel(str(ROOT/'whisper-base'), device='cpu', compute_type='int8',
                             cpu_threads=min(os.cpu_count() or 2, 4), num_workers=1,
                             local_files_only=True)


def decode_wav(data):
    # Accept only the canonical PCM format our client emits; no codec or file-path inputs.
    if not 16044 <= len(data) <= MAX_AUDIO:
        raise ValueError('Recording must be between 0.5 and 21 seconds')
    if (data[:4] != b'RIFF' or data[8:16] != b'WAVEfmt ' or data[36:40] != b'data'
        or struct.unpack_from('<I', data, 4)[0] != len(data)-8
        or struct.unpack_from('<IHHIIHH', data, 16) != (16, 1, 1, 16000, 32000, 2, 16)
        or struct.unpack_from('<I', data, 40)[0] != len(data)-44 or (len(data)-44) % 2):
        raise ValueError('Use mono 16 kHz PCM16 WAV')
    return np.frombuffer(data, dtype='<i2', offset=44).astype(np.float32)/32768


def transcription_input(content_type, body):
    message = BytesParser(policy=default).parsebytes(
        ('Content-Type: '+content_type+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+body)
    if not message.is_multipart() or message.defects:
        raise ValueError('Expected multipart upload')
    fields = {}
    for part in message.iter_parts():
        name = part.get_param('name', header='content-disposition')
        if name not in ('file', 'language', 'model') or name in fields or part.is_multipart():
            raise ValueError('Unexpected or duplicate upload field')
        fields[name] = part.get_payload(decode=True)
    language = fields.get('language', b'').decode('ascii')
    if language not in ('es', 'en', 'fr') or fields.get('model') != b'whisper-base':
        raise ValueError('Use Whisper Base and a supported language')
    return decode_wav(fields.get('file', b'')), language


class Handler(BaseHTTPRequestHandler):
    server_version = 'PasoSpeech/2'

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def log_message(self, fmt, *args):
        # Never log text, bearer tokens, recordings, or generated audio.
        return

    def send(self, status, body, media='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', media)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def error(self, status, message):
        self.send(status, json.dumps({'error':message}).encode())

    def do_GET(self):
        if self.path == '/health':
            return self.send(200, b'{"status":"ready","models":["kokoro","whisper-base"]}')
        self.error(404, 'Not found')

    def do_POST(self):
        if self.path not in ('/v1/audio/speech', '/v1/audio/transcriptions'):
            return self.error(404, 'Not found')
        if not KEY or not hmac.compare_digest(self.headers.get('Authorization',''), 'Bearer '+KEY):
            return self.error(401, 'Unauthorized')
        is_asr = self.path.endswith('/transcriptions')
        expected_type = 'multipart/form-data' if is_asr else 'application/json'
        if self.headers.get_content_type() != expected_type:
            return self.error(415, 'Unexpected request media type')
        try:
            length = int(self.headers.get('Content-Length','0'))
        except ValueError:
            return self.error(400, 'Invalid request length')
        if length < 2 or length > (MAX_AUDIO+8192 if is_asr else 4096):
            return self.error(413, 'Request body is too small or too large')
        try:
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise ValueError('Incomplete request')
            if is_asr:
                audio, language = transcription_input(self.headers['Content-Type'], raw)
            else:
                body = json.loads(raw)
                text = body.get('input')
                voice = body.get('voice', 'ef_dora')
                speed = body.get('speed', 0.94)
                if (not isinstance(body, dict) or not isinstance(text, str)
                    or not 1 <= len(text.strip()) <= 500 or voice not in VOICES
                    or body.get('model','kokoro') != 'kokoro'
                    or body.get('response_format','wav') != 'wav'
                    or isinstance(speed, bool) or not isinstance(speed,(int,float))
                    or not 0.7 <= speed <= 1.2):
                    raise ValueError('Invalid speech input')
        except (ValueError, TypeError, AttributeError, UnicodeError):
            return self.error(400, 'Invalid audio, language, or speech input')
        if not LOCK.acquire(blocking=False):
            return self.error(429, 'Speech service is busy; retry shortly')
        try:
            if is_asr:
                segments, _ = RECOGNIZER.transcribe(audio, language=language, beam_size=1,
                                                   condition_on_previous_text=False,
                                                   without_timestamps=True)
                transcript = ' '.join(segment.text.strip() for segment in segments).strip()
                if len(transcript) > 1000:
                    raise RuntimeError('Transcript exceeds limit')
                self.send(200, json.dumps({'text':transcript}, ensure_ascii=False).encode())
            else:
                audio, sample_rate = MODEL.create(text.strip(), voice=voice, speed=float(speed), lang=VOICES[voice])
                if not np.all(np.isfinite(audio)) or not 0 < len(audio) <= sample_rate * 45:
                    raise RuntimeError('Invalid generated waveform')
                output = io.BytesIO()
                sf.write(output, audio, sample_rate, format='WAV', subtype='PCM_16')
                self.send(200, output.getvalue(), 'audio/wav')
        except Exception:
            self.error(500, 'Speech processing failed')
        finally:
            LOCK.release()


if __name__ == '__main__':
    load_models()
    address = (os.environ.get('PASO_HOST','127.0.0.1'), int(os.environ.get('PASO_PORT','8880')))
    ThreadingHTTPServer(address, Handler).serve_forever()
