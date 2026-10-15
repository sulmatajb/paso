import { useAccount } from '../sync/client';
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Send, Download, LoaderCircle } from 'lucide-react';
import { beginRecording, type Recording } from '../speech/recorder';
import { loadSpeechModel, transcribe, useSpeechModel, cancelSpeech } from '../speech/client';
import { useAudio } from '../audio';
export function ConversationComposer({
  language,
  disabled,
  send,
  stopPlayback,
}: {
  language: string;
  disabled: boolean;
  send: (text: string, input: 'voice' | 'text') => Promise<boolean>;
  stopPlayback: () => void;
}) {
  const account = useAccount(),
    speech = useSpeechModel(),
    reference = useAudio(),
    [draft, setDraft] = useState(''),
    [input, setInput] = useState<'voice' | 'text'>('text'),
    [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [clip, setClip] = useState(''),
    [error, setError] = useState(''),
    [starting, setStarting] = useState(false);
  const recorder = useRef<Awaited<ReturnType<typeof beginRecording>> | null>(null),
    mounted = useRef(true),
    clipRef = useRef(''),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    generation = useRef(0);
  const busy =
    disabled || speech.status === 'loading' || speech.status === 'transcribing' || starting;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      recorder.current?.cancel();
      if (timer.current) clearInterval(timer.current);
      if (clipRef.current) URL.revokeObjectURL(clipRef.current);
      cancelSpeech();
    };
  }, []);
  function clearClip() {
    if (clipRef.current) URL.revokeObjectURL(clipRef.current);
    clipRef.current = '';
    setClip('');
  }
  async function stop() {
    const current = recorder.current;
    if (!current) return;
    recorder.current = null;
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
    let result: Recording | undefined;
    const request = ++generation.current;
    try {
      result = await current.stop();
      if (!mounted.current || request !== generation.current) {
        URL.revokeObjectURL(result.url);
        return;
      }
      clearClip();
      clipRef.current = result.url;
      setClip(result.url);
      if (result.seconds < 0.6 || result.rms < 0.004)
        throw Error('We did not hear enough speech. Try again a little closer to the microphone.');
      const text = await transcribe(result.audio, language);
      if (!mounted.current || request !== generation.current) return;
      if (!text.trim() || text.trim().split(/\s+/).length > Math.max(12, result.seconds * 5))
        throw Error('Could not recognize that clearly. Please try again.');
      setDraft(text.trim());
      setInput('voice');
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : 'Microphone unavailable. You can type your reply.',
        );
    }
  }
  async function record() {
    if (busy) return;
    setError('');
    stopPlayback();
    reference.stop();
    if (speech.status !== 'ready') {
      try {
        await loadSpeechModel();
      } catch {
        setError('Could not load speech recognition. Retry or type your reply.');
      }
      return;
    }
    setStarting(true);
    try {
      const current = await beginRecording(() => void stop(), 20000);
      if (!mounted.current) {
        current.cancel();
        return;
      }
      recorder.current = current;
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow it in your browser settings or type your reply.'
          : 'Could not open the microphone. You can type your reply.',
      );
    } finally {
      if (mounted.current) setStarting(false);
    }
  }
  async function submit() {
    if (!draft.trim() || busy || recording) return;
    if (await send(draft.trim(), input)) {
      setDraft('');
      setInput('text');
      clearClip();
    }
  }
  return (
    <div className="conversation-composer">
      {clip && (
        <audio className="recording-preview" controls src={clip} aria-label="Your recorded reply" />
      )}
      <label htmlFor="conversation-reply">
        {input === 'voice' ? 'Check what we heard, then send' : 'Your reply'}
      </label>
      <textarea
        id="conversation-reply"
        value={draft}
        maxLength={500}
        disabled={busy || recording}
        onChange={(e) => {
          setDraft(e.target.value);
          setInput('text');
        }}
        lang={language}
        placeholder="Say something, or type here…"
        rows={2}
      />
      <div className="composer-actions">
        {recording ? (
          <button className="record-stop" onClick={() => void stop()}>
            <Square size={17} fill="currentColor" />
            Stop · {seconds}s / 20s
          </button>
        ) : (
          <button className="secondary-button" disabled={busy} onClick={() => void record()}>
            {speech.status === 'loading' || speech.status === 'transcribing' ? (
              <LoaderCircle size={18} className="spinning" />
            ) : speech.status === 'ready' ? (
              <Mic size={18} />
            ) : (
              <Download size={18} />
            )}{' '}
            {speech.status === 'loading'
              ? 'Loading speech…'
              : speech.status === 'transcribing'
                ? 'Listening back…'
                : speech.status === 'ready'
                  ? 'Record reply'
                  : 'Enable mic · 94 MB'}
          </button>
        )}
        <button
          className="primary-button"
          disabled={!draft.trim() || busy || recording}
          onClick={() => void submit()}
          aria-label="Send reply"
        >
          <Send size={18} />
          <span>Send</span>
        </button>
      </div>
      {error && (
        <p className="conversation-error" role="alert">
          {error}
        </p>
      )}
      <small>
        {account.communitySpace
          ? 'Your recording goes to our Hugging Face Space. It temporarily caches audio for processing. Review the words before sending.'
          : account.transcription
            ? 'Your recording is sent to this app’s server for recognition. Audio is not added to your learning record. Review the transcript before sending.'
            : 'Recordings stay on your device. Review the transcript before sending.'}
      </small>
    </div>
  );
}
