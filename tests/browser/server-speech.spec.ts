import { test, expect } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
test('community mode shows the free quota and recording disclosure without download controls', async ({
  page,
}) => {
  const modelRequests: string[] = [];
  page.on('request', (request) => {
    if (/\.onnx|\.wasm|params_shard|\.safetensors/.test(request.url()))
      modelRequests.push(request.url());
  });
  await page.route('**/api/account', (route) =>
    route.fulfill({
      json: {
        user: null,
        communitySpace: 'bessi190/paso-voice-practice',
        conversation: true,
        voice: true,
        transcription: true,
      },
    }),
  );
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
  await page.goto('/#conversation');
  await expect(page.getByText('Community server ready')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Practice on Hugging Face', exact: true }),
  ).toHaveAttribute('href', 'https://huggingface.co/spaces/bessi190/paso-voice-practice');
  await expect(page.getByRole('button', { name: 'Download conversation pack' })).toHaveCount(0);
  await page.getByRole('button', { name: /Make a new friend/ }).click();
  await expect(page.getByText('Free community server · daily limits apply.')).toBeVisible();
  await expect(
    page.getByText('Your recording goes to our Hugging Face Space', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Enable generated voices/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Record reply', exact: true })).toBeEnabled();
  expect(modelRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('server mode records and reviews replies on phones without downloading model weights', async ({
  page,
  browserName,
}) => {
  const modelRequests: string[] = [];
  let failRecognition = false,
    uploads = 0;
  page.on('request', (request) => {
    if (/huggingface|webllm|\.onnx|\.wasm|params_shard/.test(request.url()))
      modelRequests.push(request.url());
  });
  await page.route('**/api/account', (route) =>
    route.fulfill({
      json: {
        user: {
          userId: 'test-server',
          displayName: 'Test Learner',
          email: 'learner@example.test',
          fullName: null,
        },
        conversation: true,
        voice: true,
        transcription: true,
      },
    }),
  );
  await page.route('**/api/progress', (route) =>
    route.fulfill({
      json: route.request().method() === 'GET' ? { revision: 0, snapshot: null } : { revision: 1 },
    }),
  );
  await page.route('**/api/transcription?*', async (route) => {
    uploads++;
    const wav = route.request().postDataBuffer();
    // WebKit's debugger does not expose Blob request bytes; Chromium does.
    if (wav) {
      expect(wav.subarray(0, 4).toString()).toBe('RIFF');
      expect(wav.readUInt32LE(24)).toBe(16000);
      expect(wav.readUInt16LE(22)).toBe(1);
      expect(wav.length).toBeLessThanOrEqual(672044);
      expect(wav.length).toBeGreaterThan(16044);
    } else {
      expect(browserName).toBe('webkit');
    }
    expect(route.request().headers()['content-type']).toBe('audio/wav');
    await route.fulfill({
      status: failRecognition ? 502 : 200,
      json: failRecognition
        ? { error: 'Speech recognition is busy. Retry or type your reply.' }
        : { text: 'Me llamo Alex.' },
    });
  });
  await page.addInitScript(() => {
    // Use a bundled synthetic clip, never a person's real microphone.
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
    Object.defineProperty(navigator, 'gpu', { value: undefined });
  });
  await page.goto('/#conversation');
  await expect(
    page.getByText('Speak, listen, and learn without downloading models.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download conversation pack' })).toHaveCount(0);
  await page.getByRole('button', { name: /Make a new friend/ }).click();
  await expect(
    page.getByText('Your recording is sent to this app’s server', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Record reply', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop · 3s / 20s', exact: true })).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole('button', { name: /Stop ·/ }).click();
  await expect(page.getByRole('textbox')).toHaveValue('Me llamo Alex.');
  await expect(page.getByText('Check what we heard, then send')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send reply' })).toBeEnabled();
  expect(uploads).toBe(1);
  failRecognition = true;
  await page.getByRole('button', { name: 'Record reply', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop · 3s / 20s', exact: true })).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole('button', { name: /Stop ·/ }).click();
  await expect(page.getByRole('alert')).toContainText('Speech recognition is busy');
  await expect(page.getByRole('textbox')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Record reply', exact: true })).toBeEnabled();
  await page.getByRole('textbox').fill('Hola, me llamo Alex.');
  expect(modelRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
