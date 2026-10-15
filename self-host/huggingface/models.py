"""Own open models only. No inference provider API, paid fallback, or owner token."""
import hashlib
import json
import os
import urllib.request
from pathlib import Path
import numpy as np
from service import audio_for, messages_for, clean_reply, voice_for

QWEN = 'Qwen/Qwen3.5-4B'
REVISION = '851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a'


def fetch_assets(root):
    root.mkdir(parents=True, exist_ok=True)
    for item in json.loads(Path(__file__).with_name('models.lock.json').read_text()):
        if item['service'] != 'speech':
            continue
        target = root/item['name']
        target.parent.mkdir(parents=True, exist_ok=True)
        def digest(path):
            with path.open('rb') as stream:
                return hashlib.file_digest(stream,'sha256').hexdigest()
        if target.exists() and digest(target) == item['sha256']:
            continue
        temporary = target.with_suffix(target.suffix+'.part')
        try:
            with urllib.request.urlopen(item['url'],timeout=120) as source, temporary.open('wb') as dest:
                while chunk := source.read(1024*1024):
                    dest.write(chunk)
            if digest(temporary) != item['sha256']:
                raise RuntimeError('Model checksum mismatch')
            os.replace(temporary,target)
        finally:
            temporary.unlink(missing_ok=True)


class Runtime:
    def __init__(self, load_chat=True):
        from faster_whisper import WhisperModel
        from kokoro_onnx import Kokoro
        root = Path(os.environ.get('PASO_MODELS_DIR', '/tmp/paso-models'))
        fetch_assets(root)
        self.asr = WhisperModel(str(root/'whisper-base'),device='cpu',compute_type='int8',
                                cpu_threads=2,num_workers=1,local_files_only=True)
        self.tts = Kokoro(str(root/'kokoro-v1.0.onnx'),str(root/'voices-v1.0.bin'))
        self.chat = None
        if load_chat:
            import torch
            from transformers import AutoTokenizer, Qwen3_5ForConditionalGeneration
            self.tokenizer = AutoTokenizer.from_pretrained(QWEN, revision=REVISION)
            # Called during module startup after importing spaces, never lazily in GPU work.
            self.chat = Qwen3_5ForConditionalGeneration.from_pretrained(
                QWEN,revision=REVISION,dtype=torch.bfloat16,attn_implementation='sdpa',
                low_cpu_mem_usage=True).to('cuda')

    def transcribe(self, audio, language):
        samples = audio_for(audio, language)
        segments, _ = self.asr.transcribe(samples,language=language,beam_size=1,
                                         condition_on_previous_text=False,without_timestamps=True)
        text = ' '.join(s.text.strip() for s in segments).strip()
        if not text or len(text) > 1000:
            raise ValueError('Could not recognize this clearly. Retry or type your reply.')
        return text

    def reply(self, language, scenario, history):
        import torch
        if self.chat is None:
            raise RuntimeError('Conversation model is not loaded.')
        messages = messages_for(language, scenario, history)
        inputs = self.tokenizer.apply_chat_template(messages,tokenize=True,add_generation_prompt=True,
                    enable_thinking=False,return_dict=True,return_tensors='pt').to('cuda')
        if inputs['input_ids'].shape[-1] > 1800:
            raise ValueError('This conversation is too long. Start a new short conversation.')
        with torch.inference_mode():
            output = self.chat.generate(**inputs,max_new_tokens=128,do_sample=True,
                    temperature=0.4,top_p=0.8,repetition_penalty=1.0,
                    pad_token_id=self.tokenizer.eos_token_id)
        return clean_reply(self.tokenizer.decode(output[0][inputs['input_ids'].shape[-1]:],skip_special_tokens=True))

    def speak(self, text, language, voice):
        text, tag = voice_for(text, language, voice)
        audio, sample_rate = self.tts.create(text,voice=voice,speed=0.94,lang=tag)
        if not np.isfinite(audio).all() or not 0 < len(audio) <= sample_rate * 45:
            raise ValueError('Could not generate speech.')
        return sample_rate, audio
