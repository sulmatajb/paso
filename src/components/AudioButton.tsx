import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useAudio } from '../audio';
import { useI18n } from '../i18n';
export function AudioButton({
  clipKey,
  language,
  text,
  label,
  small = false,
  voiceId,
  slow = false,
}: {
  clipKey: string;
  language: string;
  text?: string;
  label?: string;
  small?: boolean;
  voiceId?: string;
  slow?: boolean;
}) {
  const { t } = useI18n();
  const { active, play } = useAudio();
  const [failed, setFailed] = useState(false);
  const playing =
    !!active?.startsWith(`${clipKey}:`) &&
    (voiceId ? active.includes(`:${voiceId}:`) : true) &&
    active.endsWith(`:${slow}`);
  const caption = label ?? (slow ? t.slow : t.play);
  async function start() {
    setFailed(false);
    try {
      await play(clipKey, language, voiceId, slow);
    } catch {
      setFailed(true);
    }
  }
  return (
    <span className="audio-wrap">
      <button
        className={`audio-button ${small ? 'small' : ''} ${playing ? 'playing' : ''}`}
        type="button"
        onClick={() => void start()}
        aria-label={text ? `${caption}: ${text}` : caption}
        aria-pressed={playing}
      >
        {failed ? <VolumeX size={18} /> : <Volume2 size={18} />}{' '}
        {!small && <span>{playing ? t.playing : caption}</span>}
      </button>
      {failed && (
        <span className="audio-notice" role="status">
          {t.soundUnavailable}
        </span>
      )}
    </span>
  );
}
