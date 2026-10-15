import lock from '../../scripts/audio/asr-base-model.lock.json';
export const SPEECH_MODEL = lock.model;
export const SPEECH_CACHE = 'paso-speech-base-v1';
export const SPEECH_PACK_MB = Math.ceil(lock.modelAndRuntimeBytes / 1000000);
export async function speakingPackCached() {
  try {
    const cache = await caches.open(SPEECH_CACHE);
    const urls = [
      ...lock.files.map((file) => file.url),
      ...lock.runtime.files.map(
        (file) => new URL(`/asr-runtime/${file.name}`, location.origin).href,
      ),
    ];
    return (
      await Promise.all(
        urls.map(async (url) => {
          const response = await cache.match(url);
          return !!response && response.ok;
        }),
      )
    ).every(Boolean);
  } catch {
    return false;
  }
}
