import { useAccount } from '../sync/client';
import { useEffect, useRef, useState } from 'react';
import {
  Download,
  Mic,
  Square,
  RotateCcw,
  Keyboard,
  ShieldCheck,
  LoaderCircle,
} from 'lucide-react';
import { speakingPackCached, SPEECH_PACK_MB } from '../speech/config';
import { cancelSpeech, loadSpeechModel, transcribe, useSpeechModel } from '../speech/client';
import { beginRecording, type Recording } from '../speech/recorder';
import { comparedWords, speechMatches } from '../speech/matching';
import { useAudio } from '../audio';
import { useI18n } from '../i18n';
export function SpeechPack() {
  const state = useSpeechModel(),
    { locale } = useI18n(),
    es = locale === 'es';
  const [cached, setCached] = useState(false);
  useEffect(() => {
    let active = true;
    void speakingPackCached().then((value) => {
      if (active) setCached(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="speech-pack">
      <div className="pack-icon">
        <Download size={22} />
      </div>
      <div>
        <strong>{es ? 'Activa la práctica oral' : 'Get ready to speak'}</strong>
        <p>
          {cached
            ? es
              ? 'El paquete está guardado en este dispositivo. Actívalo para practicar.'
              : 'The pack is saved on this device. Enable it to practice.'
            : es
              ? `Descarga inicial de unos ${SPEECH_PACK_MB} MB. Whisper reconoce tu voz en este dispositivo.`
              : `Initial download, about ${SPEECH_PACK_MB} MB. Whisper recognizes speech on your device.`}
        </p>
      </div>
      {state.status === 'loading' ? (
        <>
          <p role="status">
            <LoaderCircle className="spin" size={16} />
            {es ? 'Preparando' : 'Preparing'} · {(state.bytes / 1000000).toFixed(1)} MB
          </p>
          <button type="button" className="text-button" onClick={cancelSpeech}>
            {es ? 'Cancelar' : 'Cancel download'}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="primary-button"
          onClick={() => void loadSpeechModel().catch(() => {})}
        >
          <Download size={17} />
          {cached
            ? es
              ? 'Activar voz'
              : 'Enable speaking'
            : es
              ? 'Descargar paquete de voz'
              : 'Download speaking pack'}
        </button>
      )}
      {state.status === 'error' && (
        <p className="inline-error" role="alert">
          {es
            ? 'No se pudo cargar el modelo. Comprueba la conexión y el espacio disponible; inténtalo otra vez.'
            : 'The model could not load. Check your connection and free storage, then try again.'}
        </p>
      )}
      <small>
        <ShieldCheck size={14} />
        {es
          ? 'El audio de tu micrófono no sale del dispositivo.'
          : 'Your microphone audio stays on this device.'}
      </small>
    </div>
  );
}
export function SpeakingInput({
  target,
  answers,
  language,
  disabled,
  onChange,
  onAssisted,
  value,
}: {
  target: string;
  answers: string[];
  language: string;
  disabled: boolean;
  onChange: (text: string) => void;
  onAssisted: () => Promise<unknown>;
  value: string;
}) {
  const account = useAccount(),
    model = useSpeechModel(),
    { locale } = useI18n(),
    es = locale === 'es';
  const { stop: stopAudio } = useAudio();
  const [mode, setMode] = useState<'voice' | 'text'>('voice'),
    [phase, setPhase] = useState<'idle' | 'requesting' | 'recording' | 'decoding' | 'transcribing'>(
      'idle',
    ),
    [recording, setRecording] = useState<Recording | null>(null),
    [error, setError] = useState(''),
    [seconds, setSeconds] = useState(0);
  const capture = useRef<Awaited<ReturnType<typeof beginRecording>> | null>(null),
    active = useRef(true),
    url = useRef(''),
    operation = useRef(0),
    capturing = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      operation.current++;
      capture.current?.cancel();
      if (url.current) URL.revokeObjectURL(url.current);
      if (capturing.current) cancelSpeech();
    };
  }, []);
  useEffect(() => {
    if (phase !== 'recording') return;
    const started = Date.now(),
      timer = setInterval(
        () => setSeconds(Math.min(12, Math.floor((Date.now() - started) / 1000))),
        250,
      );
    return () => clearInterval(timer);
  }, [phase]);
  async function finish() {
    if (!capture.current) return;
    const current = capture.current;
    capture.current = null;
    const id = operation.current;
    setPhase('decoding');
    try {
      const result = await current.stop();
      if (!active.current || id !== operation.current) {
        URL.revokeObjectURL(result.url);
        return;
      }
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = result.url;
      setRecording(result);
      if (result.seconds < 0.6 || result.rms < 0.004) throw new Error('silence');
      setPhase('transcribing');
      capturing.current = true;
      const text = (await transcribe(result.audio, language)).trim();
      if (!active.current || id !== operation.current) return;
      if (!text) throw new Error('silence');
      if (text.split(/\s+/).length > Math.max(20, target.split(/\s+/).length * 3))
        throw new Error('unclear');
      onChange(text);
    } catch (cause) {
      if (active.current && id === operation.current)
        setError(
          cause instanceof Error && cause.message === 'silence'
            ? es
              ? 'No se oyó una frase. Acerca el micrófono e inténtalo otra vez.'
              : 'We didn’t hear a phrase. Move closer to your microphone and try again.'
            : es
              ? 'No se pudo reconocer la grabación. Puedes repetir o escribir.'
              : 'This recording could not be recognized. Try again or type instead.',
        );
    } finally {
      capturing.current = false;
      if (active.current && id === operation.current) setPhase('idle');
    }
  }
  async function start() {
    if (phase !== 'idle' || disabled) return;
    stopAudio();
    setError('');
    onChange('');
    setSeconds(0);
    setPhase('requesting');
    const id = ++operation.current;
    try {
      const next = await beginRecording(() => void finish());
      if (!active.current || id !== operation.current) {
        next.cancel();
        return;
      }
      capture.current = next;
      setPhase('recording');
    } catch (cause) {
      if (active.current && id === operation.current) {
        setPhase('idle');
        setError(
          cause instanceof DOMException && cause.name === 'NotAllowedError'
            ? es
              ? 'El micrófono está bloqueado. Permítelo en el navegador o escribe la frase.'
              : 'Microphone access is blocked. Allow it in your browser, or type the phrase.'
            : es
              ? 'No se pudo abrir el micrófono. Puedes escribir la frase.'
              : 'The microphone could not open. You can type the phrase instead.',
        );
      }
    }
  }
  async function typeInstead() {
    operation.current++;
    capture.current?.cancel();
    capture.current = null;
    if (capturing.current) cancelSpeech();
    setPhase('idle');
    const saved = await onAssisted();
    if (saved === false) return;
    if (active.current) {
      setMode('text');
      onChange('');
    }
  }
  const pending = phase === 'decoding' || phase === 'transcribing';
  return (
    <div className="speaking-input">
      {mode === 'voice' ? (
        <>
          {model.status === 'idle' || model.status === 'loading' || model.status === 'error' ? (
            <SpeechPack />
          ) : (
            <div className={`recording-pad ${phase === 'recording' ? 'is-recording' : ''}`}>
              <div className="mic-orbit">
                <button
                  type="button"
                  className="record-button"
                  disabled={
                    disabled || pending || phase === 'requesting' || model.status === 'transcribing'
                  }
                  aria-label={
                    phase === 'recording'
                      ? es
                        ? 'Terminar grabación'
                        : 'Stop recording'
                      : es
                        ? 'Grabar frase'
                        : 'Record phrase'
                  }
                  onClick={() => void (phase === 'recording' ? finish() : start())}
                >
                  {pending || phase === 'requesting' ? (
                    <LoaderCircle className="spin" size={28} />
                  ) : phase === 'recording' ? (
                    <Square size={25} fill="currentColor" />
                  ) : (
                    <Mic size={30} />
                  )}
                </button>
              </div>
              <strong role="status">
                {phase === 'recording'
                  ? `${es ? 'Escuchando' : 'Listening'} · ${seconds}s / 12s`
                  : pending
                    ? es
                      ? account.transcription
                        ? 'Reconociendo en el servidor…'
                        : 'Reconociendo en tu dispositivo…'
                      : account.transcription
                        ? 'Recognizing on the server…'
                        : 'Recognizing on your device…'
                    : phase === 'requesting'
                      ? es
                        ? 'Permite el micrófono…'
                        : 'Allow microphone access…'
                      : value
                        ? es
                          ? 'Toca para repetir'
                          : 'Tap to try again'
                        : es
                          ? 'Toca y di la frase'
                          : 'Tap and say the phrase'}
              </strong>
              <small>
                {es ? 'Toca el cuadrado cuando termines.' : 'Tap the square when you’re finished.'}
              </small>
            </div>
          )}
          {account.transcription && (
            <p className="quiet-note">
              {account.communitySpace
                ? es
                  ? 'Tu grabación se envía a Hugging Face, que guarda temporalmente el audio para procesarlo.'
                  : 'Your recording goes to Hugging Face, which temporarily caches audio for processing.'
                : es
                  ? 'La grabación se envía al servidor para reconocer las palabras. El audio no se guarda en tu historial.'
                  : 'Your recording is sent to this app’s server for recognition. Audio is not added to your learning record.'}
            </p>
          )}
          {recording && (
            <div className="recording-playback">
              <span>{es ? 'Tu grabación' : 'Your recording'}</span>
              <audio
                controls
                src={recording.url}
                aria-label={es ? 'Tu grabación' : 'Your recording'}
              />
            </div>
          )}
          {value && (
            <div
              className={`transcript-result ${speechMatches(value, answers, language) ? 'matched' : ''}`}
              role="status"
            >
              <span className="eyebrow">{es ? 'El modelo oyó' : 'The model heard'}</span>
              <p lang={language}>{value}</p>
              <div
                className="recognized-words"
                aria-label={es ? 'Palabras de la frase detectadas' : 'Target words detected'}
              >
                {comparedWords(value, target, language).map((item, i) => (
                  <span key={i} className={item.matched ? 'heard' : 'unheard'}>
                    {item.word}
                  </span>
                ))}
              </div>
              <small>
                {speechMatches(value, answers, language)
                  ? es
                    ? 'Las palabras coinciden.'
                    : 'The words match.'
                  : es
                    ? 'No coincide del todo. Escucha y repite, o escribe para seguir.'
                    : 'Not quite a match. Listen and retry, or type to continue.'}
              </small>
            </div>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <p className="speech-caveat">
            {es
              ? 'Comprobación de palabras, no puntuación de pronunciación. El reconocimiento puede equivocarse.'
              : 'Word recognition, not a pronunciation score. The model can mishear you.'}
          </p>
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() => void typeInstead()}
          >
            <Keyboard size={16} />
            {es ? 'Escribir en su lugar (con ayuda)' : 'Type instead (assisted)'}
          </button>
        </>
      ) : (
        <div className="write-answer">
          <label htmlFor="spoken-fallback">
            {es ? 'Práctica escrita · con ayuda' : 'Written practice · assisted'}
          </label>
          <textarea
            id="spoken-fallback"
            value={value}
            lang={language}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
          />
          <p className="quiet-note">
            {es
              ? 'Cuenta como práctica escrita, no oral.'
              : 'This counts as written practice, not a spoken answer.'}
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setMode('voice');
              onChange('');
            }}
          >
            <RotateCcw size={15} />
            {es ? 'Volver al micrófono' : 'Back to microphone'}
          </button>
        </div>
      )}
    </div>
  );
}
