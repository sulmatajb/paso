import argparse, importlib.util, os, secrets, threading, json, urllib.request, io, time, wave, tempfile
from pathlib import Path
import numpy as np
from faster_whisper.audio import decode_audio
root=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--models-dir', type=Path, default=root/'self-host/models')
args=parser.parse_args()
temporary=tempfile.TemporaryDirectory(prefix='paso-speech-test-')
key=Path(temporary.name)/'key.txt'
key.write_text(secrets.token_urlsafe(48));key.chmod(0o600)
os.environ['PASO_MODELS_DIR']=str(args.models_dir.resolve())
os.environ['PASO_KEY_FILE']=str(key)
spec=importlib.util.spec_from_file_location('speech_server',root/'self-host/tts/server.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.load_models()
server=module.ThreadingHTTPServer(('127.0.0.1',0),module.Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
headers={'Authorization':'Bearer '+key.read_text()}
try:
 audio=decode_audio(str(root/'public/audio/es-from-en/es-first-hello/name/ef_dora.mp3'),sampling_rate=16000)
 output=io.BytesIO()
 with wave.open(output,'wb') as wav:
  wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes((audio*32767).astype('<i2').tobytes())
 boundary='paso-test-boundary'
 body=b''
 for name,value in [('language',b'es'),('model',b'whisper-base'),('file',output.getvalue())]:
  head=f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
  if name=='file':head+='; filename="speech.wav"\r\nContent-Type: audio/wav'
  body+=head.encode()+b'\r\n\r\n'+value+b'\r\n'
 body+=f'--{boundary}--\r\n'.encode()
 start=time.monotonic()
 req=urllib.request.Request(base+'/v1/audio/transcriptions',data=body,headers={**headers,'Content-Type':'multipart/form-data; boundary='+boundary})
 with urllib.request.urlopen(req,timeout=60) as response: result=json.load(response)
 print('Real Whisper:',result,'seconds:',round(time.monotonic()-start,2),flush=True)
 assert 'alex' in result['text'].lower(),result
 req=urllib.request.Request(base+'/v1/audio/speech',data=json.dumps({'input':'Hola, Alex. ¿Cómo estás?','voice':'ef_dora'}).encode(),headers={**headers,'Content-Type':'application/json'})
 start=time.monotonic()
 with urllib.request.urlopen(req,timeout=60) as response:generated=response.read()
 with wave.open(io.BytesIO(generated)) as wav:assert wav.getnframes()>24000 and wav.getframerate()==24000
 print('Real Kokoro:',len(generated),'WAV bytes, seconds:',round(time.monotonic()-start,2),flush=True)
 for auth,raw,ctype,expected in [('',body,'multipart/form-data; boundary='+boundary,401),(headers['Authorization'],b'{}','application/json',415),(headers['Authorization'],b'bad','multipart/form-data; boundary=x',400)]:
  req=urllib.request.Request(base+'/v1/audio/transcriptions',data=raw,headers={'Authorization':auth,'Content-Type':ctype})
  try:urllib.request.urlopen(req);raise AssertionError('Should fail')
  except urllib.error.HTTPError as error:assert error.code==expected,error.code
 print('Authentication and malformed-input checks passed',flush=True)
finally:
 server.shutdown();server.server_close();key.unlink(missing_ok=True);temporary.cleanup()
