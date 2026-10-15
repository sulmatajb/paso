import os
os.environ.setdefault('GRADIO_ANALYTICS_ENABLED', 'False')
import spaces  # Must precede CUDA initialization.
import gradio as gr
import json
from service import VOICES, messages_for


RUNTIME = None

@spaces.GPU(duration=30)
def reply(language: str, scenario: str, history: str) -> str:
    """Generate a short response from Qwen using a bounded learner conversation."""
    try:
        return RUNTIME.reply(language, scenario, history)
    except ValueError as error:
        raise gr.Error(str(error)) from None

def create_demo(runtime):
    global RUNTIME
    RUNTIME = runtime

    def transcribe(audio: tuple, language: str) -> str:
        """Recognize a short recording with Whisper; review the transcript before sending."""
        try:
            return runtime.transcribe(audio, language)
        except ValueError as error:
            raise gr.Error(str(error)) from None

    def speak(text: str, language: str, voice: str) -> tuple:
        """Generate WAV speech with one of the six supported Kokoro voices."""
        try:
            return runtime.speak(text, language, voice)
        except ValueError as error:
            raise gr.Error(str(error)) from None

    def send(text, language, scenario, history):
        if not isinstance(text,str) or not 1 <= len(text.strip()) <= 500:
            raise gr.Error('Write a short reply first.')
        turns = [*(history or [])[-7:], {'role':'user','content':text.strip()}]
        messages_for(language, scenario, json.dumps(turns))
        answer = reply(language, scenario, json.dumps(turns,ensure_ascii=False))
        turns.append({'role':'assistant','content':answer})
        return turns, turns, answer, ''

    with gr.Blocks(title='Paso · free voice practice',delete_cache=(60,60)) as demo:
        gr.Markdown('# paso.\n### A little conversation. A big step.\nPractice Spanish, French, or English with open models. No model downloads on your phone.')
        gr.Markdown('**Free community demo:** queues and daily GPU limits apply. When the allowance runs out, try again after it resets. No paid API or automatic paid fallback. Use this canonical Hugging Face page while signed in for your own free allowance.')
        with gr.Row():
            language = gr.Dropdown([('Español','es'),('Français','fr'),('English','en')],value='es',label='Practice language')
            scene = gr.Dropdown([('Let’s just talk','open'),('At the café','cafe'),('First introductions','meet'),('Around town','town'),('Weekend plans','weekend')],value='open',label='Scene')
        history = gr.State([])
        conversation = gr.Chatbot(label='Your conversation',height=360)
        recording = gr.Audio(sources=['microphone'],type='numpy',format='wav',label='Record a reply · up to 20 seconds')
        recognize = gr.Button('Recognize recording')
        draft = gr.Textbox(label='Check the words, then send',placeholder='Or type your reply…',max_lines=4)
        gr.Examples([['Hola, me llamo Alex. ¿Cómo estás?'],['Quisiera un café con leche.']], inputs=draft)
        with gr.Row():
            submit = gr.Button('Send reply',variant='primary')
            reset = gr.Button('New conversation')
        with gr.Row():
            voice = gr.Dropdown(VOICES['es'],value='ef_dora',label='Partner voice')
            listen = gr.Button('Listen to last reply')
        last_reply = gr.Textbox(visible=False)
        playback = gr.Audio(label='Partner voice',format='wav',autoplay=False)
        gr.Markdown('Recordings and conversation text are sent to this Hugging Face Space. Gradio temporarily caches uploaded and generated audio; periodic cleanup is enabled. No training, analytics, or persistent conversation database is added by this app. Model replies can be wrong; this is practice, not a language exam.')
        recognize.click(transcribe,[recording,language],draft,api_name='transcribe',concurrency_limit=1,concurrency_id='speech')
        submit.click(send,[draft,language,scene,history],[conversation,history,last_reply,draft],api_visibility="private",concurrency_limit=1,concurrency_id='chat')
        listen.click(speak,[last_reply,language,voice],playback,api_name='listen_ui',api_visibility="private",concurrency_limit=1,concurrency_id='speech')
        def reset_conversation():
            return [], [], '', '', None, None
        reset.click(reset_conversation,[],[conversation,history,last_reply,draft,recording,playback],api_visibility="private",queue=False)
        scene.change(reset_conversation,[],[conversation,history,last_reply,draft,recording,playback],api_visibility="private",queue=False)
        def change_language(value):
            return gr.Dropdown(choices=VOICES[value],value=VOICES[value][0]), [], [], '', '', None, None
        language.change(change_language,language,[voice,conversation,history,last_reply,draft,recording,playback],api_visibility="private",queue=False)
        # Explicit, bounded API contract for the Paso frontend; never accepts a system prompt.
        api_voice = gr.Dropdown([v for values in VOICES.values() for v in values],value='ef_dora',visible=False)
        api_text = gr.Textbox(visible=False)
        api_audio = gr.Audio(format='wav',visible=False)
        api_speech = gr.Button(visible=False)
        api_speech.click(speak,[api_text,language,api_voice],api_audio,api_name='speak',concurrency_limit=1,concurrency_id='speech')
        api_history = gr.Textbox(visible=False)
        api_reply = gr.Textbox(visible=False)
        api_trigger = gr.Button(visible=False)
        api_trigger.click(reply,[language,scene,api_history],api_reply,api_name='reply',concurrency_limit=1,concurrency_id='chat')
    return demo.queue(max_size=12,default_concurrency_limit=1)


if __name__ == '__main__':
    from models import Runtime
    demo = create_demo(Runtime())
    demo.launch(max_file_size='5mb',show_error=False,mcp_server=True)
