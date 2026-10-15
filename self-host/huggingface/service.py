"""Input and output contracts shared by the Space UI and Paso browser client."""
import json
import re
import numpy as np

LANGUAGES = {'es': 'Spanish', 'fr': 'French', 'en': 'English'}
CITIES = {'es': 'Valencia', 'fr': 'Lyon', 'en': 'Bristol'}
ROLES = {
    'open': 'a patient language-exchange partner discussing the learner’s chosen topic',
    'cafe': 'a friendly café server',
    'meet': 'a friendly new acquaintance at a language exchange',
    'town': 'a helpful local giving simple fictional directions in a town',
    'weekend': 'a friend making simple weekend plans',
}
VOICES = {'es': ['ef_dora', 'em_alex', 'em_santa'], 'fr': ['ff_siwis'], 'en': ['af_heart', 'am_michael']}
VOICE_LANG = {'es':'es', 'fr':'fr-fr', 'en':'en-us'}


def messages_for(language, scenario, history):
    if language not in LANGUAGES or scenario not in ROLES:
        raise ValueError('Choose a supported language and scene.')
    if not isinstance(history, str) or len(history) > 16000:
        raise ValueError('Conversation is too long.')
    messages = json.loads(history)
    if not isinstance(messages, list) or not 1 <= len(messages) <= 10:
        raise ValueError('Send one to ten recent messages.')
    for message in messages:
        if (not isinstance(message, dict) or set(message) != {'role', 'content'}
            or message['role'] not in ('user', 'assistant')
            or not isinstance(message['content'], str) or not 1 <= len(message['content']) <= 2000):
            raise ValueError('Invalid conversation message.')
    if messages[-1]['role'] != 'user':
        raise ValueError('Send your reply first.')
    prompt = (f'You are Maya, a friendly {LANGUAGES[language]} conversation partner. '
              f'Your fictional home is {CITIES[language]}, and you enjoy cooking pasta and hiking. '
              f'The user is a different person. Reply only in {LANGUAGES[language]}, using one or two '
              'short, grammatically correct sentences. Answer the latest question first, then ask '
              'at most one relevant follow-up. Continue the topic without repeating introductions. '
              f'In this scene, you are {ROLES[scenario]}.')
    return [{'role':'system','content':prompt}, *messages[-8:]]


def clean_reply(raw):
    if re.search(r'<think>', raw, re.I) and not re.search(r'</think>', raw, re.I):
        raise ValueError('The model did not finish. Please retry.')
    text = re.sub(r'<think>.*?</think>', '', raw, flags=re.S|re.I)
    text = re.sub(r'<\|[^>]*\|>', '', text)
    text = re.sub(r'^\s*(assistant|response|reply)\s*:\s*', '', text, flags=re.I).strip()
    if not text or len(text) > 1000:
        raise ValueError('The model returned an incomplete reply. Please retry.')
    return text


def audio_for(recording, language):
    if language not in LANGUAGES or recording is None:
        raise ValueError('Record a short reply and choose a language.')
    sample_rate, values = recording
    data = np.asarray(values)
    if (sample_rate not in (8000, 16000, 22050, 24000, 32000, 44100, 48000)
        or data.ndim not in (1, 2) or (data.ndim == 2 and data.shape[1] not in (1, 2))
        or not sample_rate * 0.5 <= len(data) <= sample_rate * 21):
        raise ValueError('Keep recordings between 0.5 and 20 seconds.')
    if data.dtype == np.int16:
        data = data.astype(np.float32)/32768
    elif np.issubdtype(data.dtype, np.floating):
        data = data.astype(np.float32)
    else:
        raise ValueError('Unsupported audio format.')
    if data.ndim == 2:
        data = data.mean(axis=1)
    if not np.isfinite(data).all() or np.max(np.abs(data)) > 1.01:
        raise ValueError('Invalid recording.')
    if np.sqrt(np.mean(data * data)) < 0.004:
        raise ValueError('We did not hear enough speech. Try speaking closer to the microphone.')
    if sample_rate != 16000:
        data = np.interp(np.arange(int(len(data)*16000/sample_rate))*sample_rate/16000,
                         np.arange(len(data)), data).astype(np.float32)
    return data


def voice_for(text, language, voice):
    if (language not in VOICES or voice not in VOICES[language] or not isinstance(text, str)
        or not 1 <= len(text.strip()) <= 500):
        raise ValueError('Choose a voice for this language and at most 500 text characters.')
    return text.strip(), VOICE_LANG[language]
