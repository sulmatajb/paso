export type Recording = { audio: Float32Array; url: string; seconds: number; rms: number };
export function resample(input: Float32Array, sourceRate: number, targetRate = 16000) {
  const length = Math.floor((input.length * targetRate) / sourceRate),
    output = new Float32Array(length);
  // Average each source window when downsampling; interpolate when upsampling.
  const ratio = sourceRate / targetRate;
  for (let i = 0; i < length; i++) {
    const start = i * ratio,
      end = (i + 1) * ratio;
    if (ratio >= 1) {
      let sum = 0,
        weight = 0;
      for (let j = Math.floor(start); j < Math.ceil(end) && j < input.length; j++) {
        const w = Math.min(j + 1, end) - Math.max(j, start);
        sum += input[j] * w;
        weight += w;
      }
      output[i] = sum / weight;
    } else {
      const j = Math.floor(start),
        fraction = start - j;
      output[i] =
        input[j] * (1 - fraction) + (input[Math.min(j + 1, input.length - 1)] ?? 0) * fraction;
    }
  }
  return output;
}
export async function beginRecording(onLimit: () => void, durationMs = 12000) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
    throw new Error('unsupported');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream);
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop());
    throw error;
  }
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  let timer: ReturnType<typeof setTimeout>,
    cancelled = false;
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
    recorder.onerror = () => {
      clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      reject(new Error('recording'));
    };
  });
  // Keep an early recording error handled until stop() awaits its result.
  void stopped.catch(() => {});
  try {
    recorder.start();
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
  timer = setTimeout(onLimit, durationMs);
  return {
    cancel() {
      cancelled = true;
      clearTimeout(timer);
      if (recorder.state !== 'inactive') recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
    },
    async stop(): Promise<Recording> {
      if (recorder.state !== 'inactive') recorder.stop();
      const blob = await stopped;
      if (cancelled) throw new Error('Cancelled');
      const context = new AudioContext();
      try {
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        const mono = new Float32Array(decoded.length);
        for (let c = 0; c < decoded.numberOfChannels; c++) {
          const channel = decoded.getChannelData(c);
          for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / decoded.numberOfChannels;
        }
        const audio = resample(mono, decoded.sampleRate),
          seconds = audio.length / 16000;
        const rms = Math.sqrt(audio.reduce((sum, n) => sum + n * n, 0) / Math.max(1, audio.length));
        return { audio, seconds, rms, url: URL.createObjectURL(blob) };
      } finally {
        await context.close();
      }
    },
  };
}
