import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test('real community Whisper → Qwen → Kokoro works without phone model downloads', async ({
  page,
}, info) => {
  test.skip(
    !process.env.PASO_HF_SPACE,
    'Opt in with a verified public Space; this uses its free quota.',
  );
  const modelDownloads: string[] = [];
  page.on('request', (request) => {
    if (/\.onnx|\.wasm|params_shard|\.safetensors|\.gguf/.test(request.url()))
      modelDownloads.push(request.url());
  });
  // Only deployment configuration is supplied locally. All model responses are real remote calls.
  await page.route('**/api/account', (route) =>
    route.fulfill({
      json: {
        user: null,
        communitySpace: process.env.PASO_HF_SPACE,
        conversation: true,
        transcription: true,
        voice: true,
      },
    }),
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined });
    const NativeAudio = window.Audio;
    (window as any).playedAudio = [];
    window.Audio = class extends NativeAudio {
      constructor(src?: string) {
        super(src);
        (window as any).playedAudio.push(this);
      }
    };
    // WebKit may return a new wrapper for mediaDevices; retain this test double.
    const devices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { value: devices });
    Object.defineProperty(devices, 'getUserMedia', {
      value: async () => {
        const context = new AudioContext();
        await context.resume();
        const response = await fetch('/audio/es-from-en/es-first-hello/name/ef_dora.mp3');
        const source = context.createBufferSource();
        source.buffer = await context.decodeAudioData(await response.arrayBuffer());
        const destination = context.createMediaStreamDestination();
        source.connect(destination);
        source.start(context.currentTime + 0.1);
        const track = destination.stream.getAudioTracks()[0],
          stop = track.stop.bind(track);
        track.stop = () => {
          stop();
          void context.close();
        };
        return destination.stream;
      },
    });
  });
  await page.goto('/#conversation');
  await expect(page.getByText('Community server ready')).toBeVisible();
  await page.getByRole('button', { name: /Make a new friend/ }).click();
  await page.getByRole('button', { name: 'Record reply', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop · 3s / 20s', exact: true })).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole('button', { name: /Stop ·/ }).click();
  // Codec differences can change ASR wording. Require the spoken name, then
  // exercise the learner's transcript correction before sending to Qwen.
  await expect(page.getByRole('textbox')).toHaveValue(/Alex/i, { timeout: 120000 });
  await page.getByRole('textbox').fill('Me llamo Alex. ¿De dónde eres?');
  await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(
    page.locator('.chat-message.assistant').nth(1).or(page.getByRole('alert')),
  ).toBeVisible({ timeout: 120000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.chat-message.assistant')).toHaveCount(2, { timeout: 120000 });
  const reply = await page.locator('.chat-message.assistant p').last().innerText();
  expect(reply.length).toBeGreaterThan(5);
  expect(reply).not.toContain('<think>');
  await page.getByRole('button', { name: 'Play reply', exact: true }).last().click();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as any).playedAudio.some(
            (audio: HTMLAudioElement) => audio.currentTime > 0 && !audio.error,
          ),
        ),
      { timeout: 90000 },
    )
    .toBe(true);
  expect(modelDownloads).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach('real-remote-result', {
    body: JSON.stringify({ space: process.env.PASO_HF_SPACE, reply, modelDownloads }),
    contentType: 'application/json',
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('community-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.reload();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(2);
});

test('real exhausted community quota preserves the reply and offers the free account page', async ({
  page,
}) => {
  test.skip(
    !process.env.PASO_HF_SPACE || !process.env.PASO_EXPECT_QUOTA,
    'Run only when the anonymous quota is already exhausted.',
  );
  await page.route('**/api/account', (route) =>
    route.fulfill({
      json: {
        user: null,
        communitySpace: process.env.PASO_HF_SPACE,
        conversation: true,
        transcription: true,
        voice: true,
      },
    }),
  );
  await page.goto('/#conversation');
  await page.getByRole('button', { name: /Make a new friend/ }).click();
  await page.getByRole('textbox').fill('Hola, me llamo Alex.');
  await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The free GPU allowance is used up', {
    timeout: 120000,
  });
  await expect(page.locator('.chat-message.user')).toContainText('Hola, me llamo Alex.');
  await expect(page.getByRole('button', { name: 'Get reply to your saved message' })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Open Hugging Face practice' })).toHaveAttribute(
    'href',
    `https://huggingface.co/spaces/${process.env.PASO_HF_SPACE}`,
  );
});
