import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import spanish from '../../src/content/courses/es-en.json' with { type: 'json' };
import french from '../../src/content/courses/fr-en.json' with { type: 'json' };
import english from '../../src/content/courses/en-es.json' with { type: 'json' };
import manifest from '../../public/audio/manifest.json' with { type: 'json' };
import { validateCourse, type Exercise, type Lesson } from '../../src/content/schema';
const course = validateCourse(spanish);
async function accessible(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    r.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function visit(page: Page, route: string) {
  await page.goto(`/#${route}`);
  await expect(page.locator('main')).toBeVisible();
}
async function solve(page: Page, e: Exercise, last: boolean, spanishUI = false) {
  await expect(page.getByRole('heading', { name: e.title, exact: true })).toBeVisible();
  if (e.type === 'choice' || e.type === 'dialogue')
    await page.locator('.choice').filter({ hasText: e.answer }).click();
  if (e.type === 'speak') {
    await page.getByRole('button', { name: 'Type instead (assisted)', exact: true }).click();
    await page.locator('textarea').fill(e.answers[0]);
  }
  if (e.type === 'write' || e.type === 'listen') await page.locator('textarea').fill(e.answers[0]);
  if (e.type === 'order')
    for (const word of e.answer)
      await page
        .locator('.word-bank')
        .getByRole('button', { name: word, exact: true })
        .filter({ visible: true })
        .first()
        .click();
  if (e.type === 'match')
    for (const pair of e.pairs) {
      await page.getByRole('button', { name: pair.left, exact: true }).click();
      await page.getByRole('button', { name: pair.right, exact: true }).click();
    }
  await page
    .getByRole('button', { name: spanishUI ? 'Comprobar' : 'Check answer', exact: true })
    .click();
  await expect(
    page.getByText(spanishUI ? '¡Muy bien!' : 'Nicely done!', { exact: true }),
  ).toBeVisible();
  await fits(page);
  const cursor = Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'));
  await page
    .getByRole('button', {
      name: last
        ? spanishUI
          ? 'Terminar lección'
          : 'Finish lesson'
        : spanishUI
          ? 'Continuar'
          : 'Continue',
      exact: true,
    })
    .click();
  if (last) await expect(page.locator('.completion-content')).toBeVisible();
  else
    await expect(page.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      String(cursor + 1),
    );
}
async function complete(page: Page, l: Lesson, spanishUI = false) {
  for (let i = 0; i < l.exercises.length; i++)
    await solve(page, l.exercises[i], i === l.exercises.length - 1, spanishUI);
}
// Observe the real browser media pipeline. Do not substitute synthesized or mocked playback.
async function observeAudio(page: Page) {
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    (window as unknown as { playedAudio: HTMLAudioElement[] }).playedAudio = [];
    window.Audio = class extends NativeAudio {
      constructor(src?: string) {
        super(src);
        (window as unknown as { playedAudio: HTMLAudioElement[] }).playedAudio.push(this);
      }
    };
  });
}
async function audioPlayed(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = (window as unknown as { playedAudio: HTMLAudioElement[] }).playedAudio.at(-1);
        return !!a && a.currentTime > 0 && !a.error;
      }),
    )
    .toBe(true);
}

test('five lesson Spanish unit, reload, unlocking, durable review and language isolation', async ({
  page,
  context,
}, info) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await observeAudio(page);
  await visit(page, 'learn');
  await expect(page.locator('.path-row')).toHaveCount(5);
  await expect(page.locator('.path-row').nth(1)).toBeDisabled();
  await fits(page);
  await accessible(page);
  await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
  await page.screenshot({ path: info.outputPath('home-viewport.png') });
  await page.getByRole('button', { name: 'Start learning: Your first hello', exact: true }).click();
  await page.getByRole('button', { name: 'A Gracias', exact: true }).click();
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.getByText('Almost. Let’s try that again.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Almost. Let’s try that again.')).toBeVisible();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('button', { name: 'Need a nudge?', exact: true }).click();
  await accessible(page);
  await complete(page, course.lessons[0]);
  await expect(page.getByText('11 / 12', { exact: true })).toBeVisible();
  await accessible(page);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'One more conversation, unlocked.' }),
  ).toBeVisible();
  await visit(page, 'review');
  await page.getByRole('button', { name: 'Start review', exact: true }).click();
  await page.getByRole('button', { name: 'I don’t remember · show answer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  await accessible(page);
  await page.screenshot({ path: info.outputPath('review.png'), fullPage: true });
  for (let i = 0; i < 6; i++) {
    if (i > 0) {
      await expect(page.locator('.review-top > span')).toHaveText(`${i + 1}/6`);
      const translation = await page.locator('.recall-translation').innerText();
      const target = course.lessons[0].phrases.find((p) => p.translation === translation)!.target;
      await page
        .getByRole('textbox', { name: 'Your answer', exact: true })
        .fill(i === 2 ? 'incorrect' : target);
      await page.getByRole('button', { name: 'Check answer', exact: true }).click();
      await expect(
        page.getByText(i === 2 ? 'We’ll practice this again.' : 'You remembered it.', {
          exact: true,
        }),
      ).toBeVisible();
    }
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await expect(page.getByText('6 phrases reviewed', { exact: false })).toBeVisible();
  await visit(page, 'review');
  await expect(page.getByRole('button', { name: 'Start review', exact: true })).toBeDisabled();
  await visit(page, 'learn');
  await page
    .getByRole('button', { name: 'Start learning: A stop at the café', exact: true })
    .click();
  for (let index = 1; index < 5; index++) {
    const l = course.lessons[index];
    for (let i = 0; i < l.exercises.length; i++) {
      const e = l.exercises[i];
      if (e.type === 'listen' && index === 1 && i === 6) {
        await page.getByRole('button', { name: 'Play phrase', exact: true }).click();
        await audioPlayed(page);
        await expect(page.locator('.exercise-main')).not.toContainText(
          l.phrases.find((p) => p.id === e.phraseId)!.target,
        );
        await accessible(page);
        await page.screenshot({ path: info.outputPath('listening.png'), fullPage: true });
      }
      if (e.type === 'listen' && index === 1 && i === 10) {
        await context.setOffline(true);
        await page.getByRole('button', { name: 'Play phrase', exact: true }).click();
        await expect(
          page.getByText('Audio couldn’t play. You can use the transcript and continue.'),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Show transcript', exact: true }).click();
        await expect(
          page.getByText('Transcript shown. This answer will count as assisted.'),
        ).toBeVisible();
        await page.reload();
        await expect(
          page.getByText('Transcript shown. This answer will count as assisted.'),
        ).toBeVisible();
        await context.setOffline(false);
      }
      await solve(page, e, i === l.exercises.length - 1);
    }
    if (index < 4) await page.getByRole('button', { name: 'Next lesson', exact: true }).click();
  }
  await expect(page.getByText('Unit complete. Look how far you’ve come.')).toBeVisible();
  await page.getByRole('button', { name: 'Next lesson', exact: true }).click();
  await complete(page, course.lessons[5]);
  await visit(page, 'learn');
  await expect(page.getByLabel('360 XP', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '01 ' + course.units![0].title, exact: true }).click();
  await expect(page.locator('.path-row.is-done')).toHaveCount(5);
  await visit(page, 'courses');
  await accessible(page);
  await page.getByRole('button', { name: `Course: ${french.title}`, exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Start learning: Your first bonjour' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start learning: Your first bonjour' }).click();
  await complete(page, validateCourse(french).lessons[0]);
  await visit(page, 'courses');
  await page.getByRole('button', { name: `Course: ${english.title}`, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page.getByRole('button', { name: 'Empezar: Tu primer hello', exact: true }).click();
  await complete(page, validateCourse(english).lessons[0], true);
  await visit(page, 'courses');
  await page.getByRole('button', { name: `Curso: ${spanish.title}`, exact: true }).click();
  await expect(page.getByLabel('480 XP', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '01 ' + course.units![0].title, exact: true }).click();
  await expect(page.locator('.path-row.is-done')).toHaveCount(5);
  await visit(page, 'speak');
  await accessible(page);
  await fits(page);
  // WebKit forwards the service worker's expected missing-audio network errors
  // as page errors. Keep checking every unrelated exception after this deliberate outage.
  const offlineClip = '/audio/es-from-en/es-at-the-cafe/cafe-coffee/ef_dora.mp3';
  expect(
    errors.filter(
      (message) =>
        !(
          message.includes(offlineClip) &&
          (message.startsWith('no-response:') || message.startsWith('/127.0.0.1:5173/audio/'))
        ),
    ),
  ).toEqual([]);
});

test('voice selection, search, export, offline reload and audio range requests', async ({
  page,
  context,
}, info) => {
  // This journey downloads a full course and installs the offline shell. The
  // download assertion alone permits 30s; allow the rest of the flow time too.
  test.setTimeout(120000);
  await observeAudio(page);
  await visit(page, 'settings');
  await accessible(page);
  await page.getByRole('button', { name: 'Alex', exact: true }).click();
  await page.getByRole('button', { name: 'Preview voice: Alex', exact: true }).click();
  await audioPlayed(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Alex', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Playback speed').selectOption('0.8');
  await page.getByRole('button', { name: 'Download course audio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Available offline', exact: true })).toBeDisabled({
    timeout: 30000,
  });
  await page.screenshot({ path: info.outputPath('settings.png'), fullPage: true });
  await fits(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export learning record' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const record = JSON.parse(Buffer.concat(chunks).toString());
  expect(record.settings.voices.es).toBe('em_alex');
  expect(record.schemaVersion).toBe(4);
  await visit(page, 'words');
  await page.getByRole('textbox', { name: 'Search phrases' }).fill('café');
  await expect(page.locator('.phrasebook-card').first()).toContainText('café');
  await fits(page);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return registration?.active?.state ?? registration?.installing?.state ?? 'not registered';
        }),
      { message: 'The offline shell must activate before disconnecting', timeout: 60000 },
    )
    .toBe('activated');
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your pocket phrasebook.' })).toBeVisible();
  await page.getByRole('button', { name: 'Listen: Hola', exact: true }).click();
  await audioPlayed(page);
  expect(
    await page.evaluate(
      () => (window as unknown as { playedAudio: HTMLAudioElement[] }).playedAudio.at(-1)?.src,
    ),
  ).toContain('em_alex');
  const audio = manifest.clips['es-from-en/es-first-hello/hello'].em_alex;
  const clip = `${audio.url}?v=${audio.sha256.slice(0, 16)}`;
  expect(
    await page.evaluate(async (url) => {
      const r = await fetch(url, { headers: { Range: 'bytes=0-127' } });
      return { status: r.status, bytes: (await r.arrayBuffer()).byteLength };
    }, clip),
  ).toEqual({ status: 206, bytes: 128 });
  await visit(page, 'learn');
  await page.getByRole('button', { name: 'Start learning: Your first hello' }).click();
  await solve(page, course.lessons[0].exercises[0], false);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: course.lessons[0].exercises[1].title }),
  ).toBeVisible();
  await context.setOffline(false);
});

test('keyboard support, storage failure, and failed writes are explicit', async ({ page }) => {
  await visit(page, 'learn');
  await page.getByRole('button', { name: 'Start learning: Your first hello' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Start with a hello.' })).toBeFocused();
  await page.getByRole('button', { name: 'B Hola', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Check answer', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toBeFocused();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  await page.addInitScript(() =>
    Object.defineProperty(window, 'indexedDB', {
      get: () => {
        throw new DOMException('Storage unavailable', 'SecurityError');
      },
    }),
  );
  await page.reload();
  await expect(page.getByText(/We couldn’t open your saved progress/)).toBeVisible();
});
test('write failure does not advance an unsaved step', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    let calls = 0;
    IDBObjectStore.prototype.put = function (...args) {
      calls++;
      if (calls > 1) throw new DOMException('Storage full', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await visit(page, 'learn');
  await page.getByRole('button', { name: 'Start learning: Your first hello' }).click();
  await page.getByRole('button', { name: 'B Hola', exact: true }).click();
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('That step couldn’t be saved');
  await expect(page.getByText('Nicely done!', { exact: true })).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Check answer', exact: true })).toBeDisabled();
});

test('compact navigation and practice screens fit a 320px phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const route of ['learn', 'courses', 'review', 'speak', 'settings', 'words']) {
    await visit(page, route);
    await fits(page);
    await accessible(page);
  }
  await visit(page, 'learn');
  await page.getByRole('button', { name: 'Start learning: Your first hello', exact: true }).click();
  await fits(page);
  await accessible(page);
});
