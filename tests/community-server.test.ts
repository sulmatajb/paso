import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stub = vi.hoisted(() => ({
  connect: vi.fn(),
  submit: vi.fn(),
  cancel: vi.fn(),
  handleFile: vi.fn((value: Blob) => value),
  account: { communitySpace: 'paso-test/voice' as string | null },
}));
vi.mock('../src/sync/client', () => ({ accountState: () => stub.account }));
vi.mock('@gradio/client', () => ({
  Client: { connect: stub.connect },
  handle_file: stub.handleFile,
}));

function result(events: unknown[]) {
  return {
    cancel: stub.cancel,
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  stub.account.communitySpace = 'paso-test/voice';
  stub.connect.mockResolvedValue({ submit: stub.submit });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('free community server transport', () => {
  it('uses the public Space without a token and bounds conversation history', async () => {
    stub.submit.mockReturnValue(
      result([
        { type: 'status', stage: 'pending' },
        { type: 'data', data: ['¡Hola! ¿Cómo estás?'] },
      ]),
    );
    const { communityReply } = await import('../src/conversation/huggingface');
    const messages = Array.from({ length: 12 }, (_, i) => ({ role: 'user', content: `hola ${i}` }));
    expect(await communityReply('es', 'cafe', messages)).toBe('¡Hola! ¿Cómo estás?');
    expect(stub.connect).toHaveBeenCalledWith('paso-test/voice', {
      events: ['data', 'status'],
      status_callback: expect.any(Function),
    });
    expect(stub.submit).toHaveBeenCalledWith('/reply', [
      'es',
      'cafe',
      JSON.stringify(messages.slice(-8)),
    ]);
  });

  it('reports exhausted quota without retries or fallback inference', async () => {
    stub.submit.mockReturnValue(
      result([{ type: 'status', stage: 'error', message: 'GPU quota exceeded' }]),
    );
    const { communityReply } = await import('../src/conversation/huggingface');
    await expect(communityReply('es', 'open', [{ role: 'user', content: 'Hola' }])).rejects.toThrow(
      'free GPU allowance is used up',
    );
    expect(stub.submit).toHaveBeenCalledTimes(1);
  });

  it('cancels while a cold Space is connecting without submitting a late job', async () => {
    let connected!: (value: { submit: typeof stub.submit }) => void;
    stub.connect.mockReturnValue(
      new Promise((resolve) => {
        connected = resolve;
      }),
    );
    const { communityReply, cancelCommunityRequests } =
      await import('../src/conversation/huggingface');
    const request = communityReply('es', 'open', [{ role: 'user', content: 'Hola' }]);
    const failure = expect(request).rejects.toThrow('Cancelled');
    await vi.waitFor(() => expect(stub.connect).toHaveBeenCalled());
    cancelCommunityRequests();
    connected({ submit: stub.submit });
    await failure;
    expect(stub.submit).not.toHaveBeenCalled();
  });

  it('times out a cold Space and does not submit when it eventually wakes', async () => {
    vi.useFakeTimers();
    let connected!: (value: { submit: typeof stub.submit }) => void;
    stub.connect.mockReturnValue(
      new Promise((resolve) => {
        connected = resolve;
      }),
    );
    const { communityReply } = await import('../src/conversation/huggingface');
    const request = communityReply('fr', 'open', [{ role: 'user', content: 'Bonjour' }]);
    const failure = expect(request).rejects.toThrow('may be waking up or busy');
    await vi.advanceTimersByTimeAsync(120001);
    connected({ submit: stub.submit });
    await failure;
    expect(stub.submit).not.toHaveBeenCalled();
  });

  it('uploads a short WAV and returns the editable transcript', async () => {
    stub.submit.mockReturnValue(result([{ type: 'data', data: ['Me llamo Alex.'] }]));
    const { communityTranscribe } = await import('../src/conversation/huggingface');
    expect(
      await communityTranscribe(new Float32Array(16000), 'es', new AbortController().signal),
    ).toBe('Me llamo Alex.');
    const blob = stub.handleFile.mock.calls[0][0];
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(32044);
    expect(stub.submit).toHaveBeenCalledWith('/transcribe', [blob, 'es']);
  });

  it('does not fetch a generated audio URL outside a secure HF Space', async () => {
    const fetchAudio = vi.fn();
    vi.stubGlobal('fetch', fetchAudio);
    stub.submit.mockReturnValue(
      result([{ type: 'data', data: [{ url: 'https://unrelated.example/audio.wav' }] }]),
    );
    const { communitySpeak } = await import('../src/conversation/huggingface');
    await expect(communitySpeak('Hola', 'es', 'ef_dora')).rejects.toThrow('Invalid voice response');
    expect(fetchAudio).not.toHaveBeenCalled();
  });
});
