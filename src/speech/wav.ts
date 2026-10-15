export function wavBlob(audio: Float32Array, sampleRate = 24000) {
  const buffer = new ArrayBuffer(44 + audio.length * 2),
    view = new DataView(buffer);
  const word = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  word(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  word(8, 'WAVE');
  word(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, 'data');
  view.setUint32(40, audio.length * 2, true);
  for (let i = 0; i < audio.length; i++)
    view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, audio[i])) * 32767), true);
  return new Blob([buffer], { type: 'audio/wav' });
}
