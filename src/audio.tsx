import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import manifestJson from '../public/audio/manifest.json';
import type { Settings } from './storage';
export type Voice = { id: string; name: string; language: string; description: string };
type Clip = { url: string; text: string; bytes: number; sha256: string };
const sourceManifest = manifestJson as unknown as {
  voices: Voice[];
  clips: Record<string, Record<string, Clip>>;
};
export const audioManifest = {
  voices: sourceManifest.voices,
  clips: Object.fromEntries(
    Object.entries(sourceManifest.clips).map(([key, voices]) => [
      key,
      Object.fromEntries(
        Object.entries(voices).map(([id, clip]) => [
          id,
          { ...clip, url: `${clip.url}?v=${clip.sha256.slice(0, 16)}` },
        ]),
      ),
    ]),
  ),
};
export const AUDIO_CACHE = 'paso-audio-v2';
type Player = {
  active: string | null;
  stop: () => void;
  play: (key: string, language: string, voiceId?: string, slow?: boolean) => Promise<void>;
};
const AudioContext = createContext<Player>({
  active: null,
  stop: () => {},
  play: async () => {
    throw new Error('Audio unavailable');
  },
});
export function AudioProvider({ settings, children }: { settings: Settings; children: ReactNode }) {
  const player = useRef<HTMLAudioElement | null>(null);
  const request = useRef(0);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const stop = () => {
      request.current++;
      player.current?.pause();
      setActive(null);
    };
    window.addEventListener('hashchange', stop);
    return () => {
      window.removeEventListener('hashchange', stop);
      request.current++;
      player.current?.pause();
    };
  }, []);
  async function play(key: string, language: string, voiceId?: string, slow = false) {
    const id = ++request.current;
    player.current?.pause();
    setActive(null);
    const voice =
      voiceId ??
      settings.voices[language] ??
      audioManifest.voices.find((v) => v.language === language)?.id;
    const clip = voice ? audioManifest.clips[key]?.[voice] : undefined;
    if (!clip) throw new Error('This voice has no clip.');
    const audio = new Audio(clip.url);
    player.current = audio;
    audio.playbackRate = slow ? 0.75 : settings.playbackRate;
    audio.onended = () => {
      if (id === request.current) setActive(null);
    };
    audio.onerror = () => {
      if (id === request.current) setActive(null);
    };
    setActive(`${key}:${voice}:${slow}`);
    try {
      await audio.play();
    } catch (error) {
      if (id === request.current) setActive(null);
      throw error;
    }
  }
  function stop() {
    request.current++;
    player.current?.pause();
    setActive(null);
  }
  return <AudioContext.Provider value={{ active, play, stop }}>{children}</AudioContext.Provider>;
}
export const useAudio = () => useContext(AudioContext);
export function courseClips(courseId: string) {
  return Object.entries(audioManifest.clips)
    .filter(([key]) => key.startsWith(`${courseId}/`))
    .flatMap(([, voices]) => Object.values(voices));
}
export async function cachedClipCount(courseId: string) {
  if (!('caches' in window)) return 0;
  const cache = await caches.open(AUDIO_CACHE);
  return (await Promise.all(courseClips(courseId).map((c) => cache.match(c.url)))).filter(Boolean)
    .length;
}
export async function downloadCourse(courseId: string, onProgress: (n: number) => void) {
  const cache = await caches.open(AUDIO_CACHE);
  let done = 0;
  for (const clip of courseClips(courseId)) {
    if (!(await cache.match(clip.url))) {
      const response = await fetch(clip.url, { cache: 'reload' });
      if (!response.ok || response.status !== 200) throw new Error('Audio download failed.');
      await cache.put(clip.url, response);
    }
    onProgress(++done);
  }
}
