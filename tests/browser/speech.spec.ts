import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
// Exercise the real microphone capture/decoder/worker pipeline with a licensed
// synthetic fixture. No physical microphone is opened and ASR is not mocked.
test('real local speech, replay, saved transcript, denied microphone and cached offline reload', async ({
  page,
  context,
}, info) => {
  test.setTimeout(240000);
  const uploads: string[] = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type()) || message.text().includes('Synthetic'))
      console.log('Speech browser:', message.text());
  });
  page.on('pageerror', (error) => console.log('Speech exception:', error.message));
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.method() !== 'HEAD') uploads.push(r.url());
  });
  await page.addInitScript(() => {
    (window as unknown as { denyMic: boolean; liveTracks: MediaStreamTrack[] }).denyMic = false;
    (window as unknown as { liveTracks: MediaStreamTrack[] }).liveTracks = [];
    const testDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { value: testDevices });
    Object.defineProperty(testDevices, 'getUserMedia', {
      value: async () => {
        if ((window as unknown as { denyMic: boolean }).denyMic)
          throw new DOMException('Test denial', 'NotAllowedError');
        const context = new AudioContext();
        await context.resume();
        const response = await fetch('/audio/es-from-en/es-first-hello/name/ef_dora.mp3');
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        const source = context.createBufferSource();
        source.buffer = buffer;
        const dest = context.createMediaStreamDestination();
        source.connect(dest);
        source.start(context.currentTime + 0.25);
        const track = dest.stream.getAudioTracks()[0],
          stop = track.stop.bind(track);
        track.stop = () => {
          stop();
          void context.close();
        };
        (window as unknown as { liveTracks: MediaStreamTrack[] }).liveTracks.push(track);
        return dest.stream;
      },
    });
  });
  await page.goto('/#speak');
  await expect(page.getByRole('heading', { name: 'Find your voice.' })).toBeVisible();
  await page.getByRole('button', { name: 'Download speaking pack', exact: true }).click();
  await expect(
    page
      .getByRole('button', { name: 'Record phrase', exact: true })
      .or(page.locator('.speech-pack .inline-error')),
  ).toBeVisible({ timeout: 150000 });
  await expect(page.getByRole('button', { name: 'Record phrase', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record phrase', exact: true }).click();
  await expect(page.getByText('Listening · 3s / 12s', { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByText('The words match.', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.transcript-result p')).toContainText(/Me llamo Alex/i);
  expect(
    await page.evaluate(() =>
      (window as unknown as { liveTracks: MediaStreamTrack[] }).liveTracks.every(
        (t) => t.readyState === 'ended',
      ),
    ),
  ).toBe(true);
  await page.locator('audio').evaluate(async (audio) => {
    await (audio as HTMLAudioElement).play();
  });
  await expect
    .poll(() => page.locator('audio').evaluate((audio) => (audio as HTMLAudioElement).currentTime))
    .toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('speaking-match.png'), fullPage: true });
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  );
  await page.getByRole('button', { name: 'Save & next phrase', exact: true }).click();
  await expect(page.getByText('1 spoken answers saved', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { denyMic: boolean }).denyMic = true;
  });
  await page.getByRole('button', { name: 'Record phrase', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone access is blocked');
  await page.getByRole('button', { name: 'Type instead (assisted)', exact: true }).click();
  await page.getByRole('textbox').fill('Me llamo Alex');
  await page.getByRole('button', { name: 'Save & next phrase', exact: true }).click();
  await expect(page.getByText('1 spoken answers saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Record phrase', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const speechCache = await page.evaluate(async () =>
    (await (await caches.open('paso-speech-base-v1')).keys()).map((request) => request.url),
  );
  expect(speechCache).toHaveLength(9);
  expect(speechCache.every((url) => !url.includes('/resolve/main/'))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('1 spoken answers saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Download speaking pack|Enable speaking/ }).click();
  await expect(
    page
      .getByRole('button', { name: 'Record phrase', exact: true })
      .or(page.locator('.speech-pack .inline-error')),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Record phrase', exact: true })).toBeVisible();
  // The fake microphone's fixture must also be available offline; normal lesson
  // audio has its own explicit download feature. Cache just this test fixture.
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Record phrase', exact: true }).click();
  await expect(page.getByText('Listening · 3s / 12s', { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByText('The words match.', { exact: true })).toBeVisible({ timeout: 60000 });
  expect(uploads).toEqual([]);
  await context.setOffline(false);
});
