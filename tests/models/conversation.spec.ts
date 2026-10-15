import { test as base, expect, chromium } from '@playwright/test';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
// A regular browser profile reflects the intended persistent model cache. Chromium's
// incognito storage quota is too small for this optional 2.4 GB pack on some machines.
const test = base.extend({
  context: async ({}, use) => {
    const profile = await mkdtemp(join(tmpdir(), 'paso-model-qa-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chrome',
      headless: true,
      args: ['--use-angle=metal'],
      viewport: { width: 393, height: 851 },
      baseURL: 'http://127.0.0.1:5173',
    });
    try {
      await use(context);
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  },
});
test('real Whisper → Qwen → Kokoro conversation, durable history and offline restart', async ({
  page,
  context,
}, info) => {
  const uploads: string[] = [];
  page.on('request', (r) => {
    if (!['GET', 'HEAD'].includes(r.method())) uploads.push(r.url());
  });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('Model browser:', m.text());
  });
  page.on('pageerror', (e) => console.log('Model exception:', e.message));
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    (window as any).playedAudio = [];
    window.Audio = class extends NativeAudio {
      constructor(src?: string) {
        super(src);
        (window as any).playedAudio.push(this);
      }
    };
    (window as any).liveTracks = [];
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const ctx = new AudioContext();
        await ctx.resume();
        const response = await fetch('/audio/es-from-en/es-first-hello/name/ef_dora.mp3');
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const destination = ctx.createMediaStreamDestination();
        source.connect(destination);
        source.start(ctx.currentTime + 0.25);
        const track = destination.stream.getAudioTracks()[0],
          stop = track.stop.bind(track);
        track.stop = () => {
          stop();
          void ctx.close();
        };
        (window as any).liveTracks.push(track);
        return destination.stream;
      },
    });
  });
  await page.goto('/#conversation');
  await expect(
    page.getByRole('button', { name: 'Download conversation pack', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Download conversation pack', exact: true }).click();
  await expect(
    page.getByText('On-device model ready', { exact: true }).or(page.getByRole('alert')),
  ).toBeVisible({ timeout: 300000 });
  await expect(page.getByText('On-device model ready', { exact: true })).toBeVisible();
  console.log('Chat model loaded');
  await page.getByRole('button', { name: /Make a new friend/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Make a new friend.', exact: true, level: 1 }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Enable generated voices · 94 MB', exact: true }).click();
  await expect(
    page.getByLabel('Read replies aloud', { exact: true }).or(page.getByRole('alert')),
  ).toBeVisible({ timeout: 120000 });
  await expect(page.getByLabel('Read replies aloud', { exact: true })).toBeVisible();
  console.log('Voice model loaded');
  await page.getByRole('button', { name: 'Enable mic · 94 MB', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record reply', exact: true })).toBeVisible({
    timeout: 120000,
  });
  await page.getByRole('button', { name: 'Record reply', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop · 3s / 20s', exact: true })).toBeVisible({
    timeout: 12000,
  });
  await page.getByRole('button', { name: /Stop ·/ }).click();
  await expect(page.getByRole('textbox')).toHaveValue(/Me llamo Alex/i, { timeout: 60000 });
  expect(
    await page.evaluate(() =>
      (window as any).liveTracks.every((t: MediaStreamTrack) => t.readyState === 'ended'),
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(2, { timeout: 60000 });
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as any).playedAudio.some((a: HTMLAudioElement) => a.currentTime > 0 && !a.error),
        ),
      { timeout: 60000 },
    )
    .toBe(true);
  await page.getByRole('textbox').fill('Vivo en Chicago y me gusta cocinar. ¿Qué te gusta hacer?');
  await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(3, { timeout: 60000 });
  const transcript = await page.locator('.chat-message p').allTextContents();
  console.log('Actual model transcript:', JSON.stringify(transcript));
  expect(transcript.join(' ')).not.toContain('<think>');
  expect(transcript[2].length).toBeGreaterThan(5);
  expect(transcript[4]).not.toBe(transcript[2]);
  await writeFile(
    info.outputPath('real-conversation.json'),
    JSON.stringify({ transcript, uploads }, null, 2),
  );
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    audit.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('conversation-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByText('2 replies · 1 spoken turns.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.locator('.chat-message')).toHaveCount(5);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.chat-message')).toHaveCount(5);
  await page.getByRole('button', { name: 'Try another conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Download conversation pack', exact: true }).click();
  await expect(page.getByRole('textbox')).toBeEnabled({ timeout: 90000 });
  console.log('Cached conversation model works offline');
  await page.getByRole('button', { name: 'Enable generated voices · 94 MB', exact: true }).click();
  await expect(page.getByLabel('Read replies aloud', { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await page.getByRole('textbox').fill('Hola, me llamo Ana.');
  await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(2, { timeout: 60000 });
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as any).playedAudio.some((a: HTMLAudioElement) => a.currentTime > 0 && !a.error),
        ),
      { timeout: 60000 },
    )
    .toBe(true);
  expect(uploads).toEqual([]);
  await context.setOffline(false);
});
