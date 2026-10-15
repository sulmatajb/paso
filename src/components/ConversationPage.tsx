import {
  useCommunityServer,
  spacePage,
  cancelCommunityRequests,
} from '../conversation/huggingface';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  MessageCircle,
  Volume2,
  Square,
  Download,
  LoaderCircle,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import type { AppData } from '../storage';
import type { Conversation } from '../learning-records';
import { scenarios, getScenario, type ConversationLanguage } from '../conversation/scenarios';
import { startConversation, appendMessage, finishConversation } from '../conversation/storage';
import {
  chatModel,
  voiceModel,
  useChatModel,
  useVoiceModel,
  chatSupport,
  loadChat,
  loadVoice,
  reply,
  synthesize,
} from '../conversation/client';
import { getCourse } from '../content/catalog';
import { useAccount } from '../sync/client';
import { ConversationComposer } from './ConversationComposer';
import { audioManifest } from '../audio';
type Commit = <T>(fn: () => Promise<T>) => Promise<{ ok: true; value: T } | { ok: false }>;
export function ConversationPage({
  data,
  courseId,
  id,
  commit,
  navigate,
}: {
  data: AppData;
  courseId: string;
  id?: string;
  commit: Commit;
  navigate: (route: string) => void;
}) {
  const course = getCourse(courseId),
    language = course.targetLanguage as ConversationLanguage,
    account = useAccount(),
    community = useCommunityServer(),
    chat = useChatModel(),
    voice = useVoiceModel();
  const [error, setError] = useState(''),
    [working, setWorking] = useState(false),
    [unsupported, setUnsupported] = useState<string | null>(null),
    [voiceId, setVoiceId] = useState(data.settings.voices[language]),
    [playing, setPlaying] = useState(''),
    [autoVoice, setAutoVoice] = useState(false);
  const alive = useRef(true),
    audio = useRef<HTMLAudioElement | null>(null),
    clipUrls = useRef(new Map<string, string>()),
    operation = useRef(0),
    end = useRef<HTMLDivElement | null>(null);
  const conversation = data.conversations.find((c) => c.id === id && c.courseId === courseId),
    scenario = conversation ? getScenario(conversation.scenarioId) : null;
  const ready = account.conversation || chat.status === 'ready' || chat.status === 'generating',
    voiceReady = account.voice || voice.status === 'ready' || voice.status === 'generating';
  const pending = conversation?.messages.at(-1)?.role === 'user';
  const userTurns = conversation?.messages.filter((m) => m.role === 'user').length ?? 0;
  useEffect(() => {
    void chatSupport().then(setUnsupported);
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current++;
      audio.current?.pause();
      for (const url of clipUrls.current.values()) URL.revokeObjectURL(url);
      clipUrls.current.clear();
      cancelCommunityRequests();
      chatModel.cancel();
      voiceModel.cancel();
    };
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [conversation?.messages.length]);
  function stopPlayback() {
    operation.current++;
    audio.current?.pause();
    if (voiceModel.state.status === 'generating') voiceModel.cancel();
    setPlaying('');
  }
  async function play(text: string, messageId: string) {
    stopPlayback();
    const serial = operation.current;
    setError('');
    setPlaying(messageId);
    try {
      const key = `${messageId}:${voiceId}`;
      let url = clipUrls.current.get(key);
      if (!url) {
        const blob = await synthesize(text, language, voiceId);
        url = URL.createObjectURL(blob);
        if (!alive.current || operation.current !== serial) {
          URL.revokeObjectURL(url);
          return;
        }
        clipUrls.current.set(key, url);
      }
      if (!alive.current || operation.current !== serial) return;
      const player = new Audio(url);
      audio.current = player;
      player.onended = () => setPlaying('');
      await player.play();
    } catch {
      if (alive.current && operation.current === serial) {
        setPlaying('');
        setError('Could not play the generated voice. Tap play to retry; the text is saved.');
      }
    }
  }
  async function prepareChat() {
    setError('');
    try {
      await loadChat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare conversations.');
    }
  }
  async function prepareVoice() {
    setError('');
    try {
      await loadVoice();
      setAutoVoice(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare voices.');
    }
  }
  async function begin(scenarioId: string) {
    const result = await commit(() => startConversation(courseId, scenarioId));
    if (result.ok) navigate(`conversation/${result.value.id}`);
  }
  async function respond(current: Conversation) {
    setWorking(true);
    setError('');
    try {
      const text = await reply(current);
      if (!alive.current) return;
      const saved = await commit(() =>
        appendMessage(current.id, current.messages.at(-1)!.id, text, 'assistant', 'model'),
      );
      if (saved.ok && autoVoice && (account.voice || voiceModel.state.status === 'ready'))
        void play(text, saved.value.messages.at(-1)!.id);
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : 'Your reply is saved. Try generating the response again.',
        );
    } finally {
      if (alive.current) setWorking(false);
    }
  }
  async function send(text: string, input: 'voice' | 'text') {
    if (!conversation || working) return false;
    stopPlayback();
    const result = await commit(() =>
      appendMessage(conversation.id, conversation.messages.at(-1)!.id, text, 'user', input),
    );
    if (!result.ok) return false;
    void respond(result.value);
    return true;
  }
  async function finish() {
    if (!conversation) return;
    stopPlayback();
    await commit(() => finishConversation(conversation.id));
  }
  const modelCard = (
    <section className="model-setup">
      <div>
        <span className="eyebrow">YOUR CONVERSATION PARTNER</span>
        <h2>{ready ? 'Ready when you are.' : 'A real conversation, on your terms.'}</h2>
        <p>
          {account.communitySpace
            ? 'Speak and listen with our free community server. Open models run on Hugging Face, so your phone downloads no model weights.'
            : account.conversation
              ? account.transcription && account.voice
                ? 'Speak, listen, and learn without downloading models. This app’s server processes your recordings and generates replies with open-source models.'
                : 'The host’s open-source model generates replies from your conversation text. Voice features show where recordings are processed.'
              : 'Qwen generates new replies on your device. The optional 2.4 GB download needs a capable device with several GB of free memory. Text stays local unless account sync is enabled.'}
        </p>
      </div>
      {account.communitySpace && (
        <p className="quiet-note community-notice">
          Shared free allowance · queues and daily limits apply.{' '}
          <a href={spacePage(account.communitySpace)} target="_blank" rel="noopener noreferrer">
            Practice on Hugging Face
          </a>{' '}
          to use your signed-in free allowance there.
        </p>
      )}
      {!ready && !account.conversation && (
        <>
          <button
            className="primary-button"
            disabled={chat.status === 'loading' || !!unsupported}
            onClick={() => void prepareChat()}
          >
            {chat.status === 'loading' ? (
              <LoaderCircle size={18} className="spinning" />
            ) : (
              <Download size={18} />
            )}{' '}
            {chat.status === 'loading'
              ? `Preparing · ${Math.round(chat.progress * 100)}%`
              : 'Download conversation pack'}
          </button>
          {chat.status === 'loading' && (
            <button className="text-button" onClick={() => chatModel.cancel()}>
              Cancel download
            </button>
          )}
          {unsupported && <p className="quiet-note">{unsupported}</p>}
        </>
      )}
      {ready && (
        <span className="ready-pill">
          <CheckCircle2 size={16} />
          {account.communitySpace
            ? 'Community server'
            : account.conversation
              ? 'Hosted model'
              : 'On-device model'}{' '}
          ready
        </span>
      )}
    </section>
  );
  if (!conversation)
    return (
      <main className="content-page conversations-home" id="main-content">
        <div className="page-heading">
          <span className="eyebrow">
            <MessageCircle size={16} /> REAL CONVERSATIONS
          </span>
          <h1>A little chat. A big step.</h1>
          <p className="page-description">
            Say it your way. A patient partner responds to what you say and keeps the conversation
            going.
          </p>
        </div>
        {modelCard}
        {error && (
          <p role="alert" className="conversation-error">
            {error}
          </p>
        )}
        <div className="scenario-grid">
          {scenarios.map((s) => (
            <button className="scenario-card" onClick={() => void begin(s.id)} key={s.id}>
              <span className="scenario-emoji" aria-hidden="true">
                {s.icon}
              </span>
              <small>{s.place}</small>
              <h2>{s.title}</h2>
              <p>{s.description}</p>
              <span>
                Start a conversation
                <ArrowRight size={17} />
              </span>
            </button>
          ))}
        </div>
        {data.conversations.some((c) => c.courseId === courseId) && (
          <section className="conversation-history">
            <h2>Your conversations</h2>
            {data.conversations
              .filter((c) => c.courseId === courseId)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .slice(0, 10)
              .map((c) => (
                <button key={c.id} onClick={() => navigate(`conversation/${c.id}`)}>
                  <MessageCircle size={19} />
                  <span>
                    <strong>{getScenario(c.scenarioId).place}</strong>
                    <small>
                      {new Date(c.updatedAt).toLocaleDateString()} ·{' '}
                      {c.messages.filter((m) => m.role === 'user').length} replies ·{' '}
                      {c.completedAt ? 'Finished' : 'Continue'}
                    </small>
                  </span>
                  <ArrowRight size={17} />
                </button>
              ))}
          </section>
        )}
        <a className="secondary-button" href="#speak">
          Practice individual phrases instead
        </a>
        <p className="quiet-note">
          AI replies can contain mistakes. These are fictional practice scenes, not real bookings,
          directions, or professional advice.
        </p>
      </main>
    );
  return (
    <main className="content-page conversation-page" id="main-content">
      <button
        className="text-button conversation-back"
        onClick={() => {
          stopPlayback();
          navigate('conversation');
        }}
      >
        <ArrowLeft size={17} />
        All conversations
      </button>
      <header className="conversation-header">
        <span className="scenario-emoji" aria-hidden="true">
          {scenario!.icon}
        </span>
        <div>
          <span className="eyebrow">{scenario!.place}</span>
          <h1>{scenario!.title}</h1>
          <p>Beginner · {userTurns} / 12 replies</p>
        </div>
        {!conversation.completedAt && (
          <button
            className="text-button"
            disabled={working || userTurns === 0}
            onClick={() => void finish()}
          >
            Finish
          </button>
        )}
      </header>
      {!ready && !conversation.completedAt && modelCard}
      <details className="conversation-guide">
        <summary>Things to try</summary>
        <ul>
          {scenario!.goals.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
        <div lang={language}>
          {scenario!.starters[language].map((s) => (
            <p key={s}>{s}</p>
          ))}
        </div>
      </details>
      <div className="voice-toolbar">
        <label>
          Partner voice
          <select
            value={voiceId}
            onChange={(e) => {
              stopPlayback();
              setVoiceId(e.target.value);
            }}
          >
            {audioManifest.voices
              .filter((v) => v.language === language)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
        </label>
        {voiceReady ? (
          <label className="auto-voice">
            <input
              type="checkbox"
              checked={autoVoice}
              onChange={(e) => setAutoVoice(e.target.checked)}
            />
            Read replies aloud
          </label>
        ) : (
          <button
            className="text-button"
            disabled={voice.status === 'loading'}
            onClick={() => void prepareVoice()}
          >
            {voice.status === 'loading' ? 'Preparing voices…' : 'Enable generated voices · 94 MB'}
          </button>
        )}
      </div>
      <div className="chat-log" role="log" aria-label="Conversation messages" aria-live="polite">
        {conversation.messages.map((m) => (
          <article className={`chat-message ${m.role}`} key={m.id}>
            <span className="message-author">
              {m.role === 'user' ? (m.input === 'voice' ? 'You · spoken' : 'You') : 'Your partner'}
            </span>
            <p lang={language}>{m.text}</p>
            {m.role === 'assistant' && voiceReady && (
              <button
                className="message-play"
                aria-label={playing === m.id ? 'Stop voice' : 'Play reply'}
                disabled={!!playing && playing !== m.id}
                onClick={() => (playing === m.id ? stopPlayback() : void play(m.text, m.id))}
              >
                {playing === m.id ? <Square size={15} /> : <Volume2 size={15} />}{' '}
                {playing === m.id
                  ? voice.status === 'generating'
                    ? 'Generating voice…'
                    : 'Stop'
                  : 'Listen'}
              </button>
            )}
          </article>
        ))}
        {working && (
          <div className="typing-indicator" role="status">
            <span />
            <span />
            <span />
            Your partner is thinking
          </div>
        )}
        <div ref={end} />
      </div>
      {error && (
        <p className="conversation-error" role="alert">
          {error}
        </p>
      )}
      {pending && !working && !conversation.completedAt && (
        <button
          className="secondary-button full-width"
          disabled={!ready}
          onClick={() => void respond(conversation)}
        >
          <RotateCcw size={17} />
          Get reply to your saved message
        </button>
      )}
      {conversation.completedAt ? (
        <section className="conversation-summary">
          <CheckCircle2 size={27} />
          <h2>You showed up and spoke.</h2>
          <p>
            {userTurns} replies · {conversation.messages.filter((m) => m.input === 'voice').length}{' '}
            spoken turns. Your conversation is saved so you can revisit it.
          </p>
          <button className="primary-button" onClick={() => void begin(conversation.scenarioId)}>
            Try another conversation
            <ArrowRight size={17} />
          </button>
        </section>
      ) : userTurns >= 12 ? (
        <button
          className="primary-button full-width"
          disabled={working}
          onClick={() => void finish()}
        >
          Finish & save conversation
        </button>
      ) : (
        <>
          {account.communitySpace && (
            <p className="quiet-note community-notice" role="status">
              {community.message || 'Free community server · daily limits apply.'}{' '}
              <a href={spacePage(account.communitySpace)} target="_blank" rel="noopener noreferrer">
                Open Hugging Face practice
              </a>
            </p>
          )}
          <ConversationComposer
            key={conversation.id}
            language={language}
            disabled={!ready || working || pending}
            send={send}
            stopPlayback={stopPlayback}
          />
        </>
      )}
    </main>
  );
}
