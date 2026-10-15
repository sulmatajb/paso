import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assessment from '../../src/content/placement/es-en.json' with { type: 'json' };
import spanish from '../../src/content/courses/es-en.json' with { type: 'json' };
async function audit(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function visit(page: Page, hash: string) {
  await page.goto(`/#${hash}`);
  await expect(page.locator('main')).toBeVisible();
}
test('placement resumes and unlocks without XP; account imports guest work and merges offline work across two devices', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  await visit(page, 'placement');
  await page.getByRole('button', { name: 'Find my starting point', exact: true }).click();
  await page
    .getByRole('button', { name: assessment.groups[0].questions[0].answers[0], exact: true })
    .click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: assessment.groups[0].questions[1].prompt, exact: true }),
  ).toBeVisible();
  // Continue the already-persisted check.
  for (const [gi, group] of assessment.groups.slice(0, 2).entries())
    for (const [qi, q] of group.questions.entries()) {
      if (gi === 0 && qi === 0) continue;
      if (gi === 1)
        await page.getByRole('button', { name: 'Not sure — skip', exact: true }).click();
      else {
        await expect(page.getByRole('heading', { name: q.prompt, exact: true })).toBeVisible();
        if (q.type === 'choice')
          await page.getByRole('button', { name: q.answers[0], exact: true }).click();
        else await page.getByRole('textbox').fill(q.answers[0]);
        await page.getByRole('button', { name: 'Next', exact: true }).click();
      }
    }
  await audit(page);
  await page.getByRole('button', { name: 'Start here', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: spanish.lessons[5].title, exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('0 XP', { exact: true })).toBeVisible();
  const id = `qa-${info.project.name}-${crypto.randomUUID()}`,
    headers = {
      'oai-authenticated-user-id': id,
      'oai-authenticated-user-email': 'learner@example.test',
      'oai-authenticated-user-full-name': 'Test Learner',
      'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
    };
  // These test-only trusted-proxy headers target the local Worker. Hosted identity is dispatch-owned.
  await page.context().setExtraHTTPHeaders(headers);
  await visit(page, 'account');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Add my guest progress', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add my guest progress', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'All progress synced' })).toBeVisible();
  await audit(page);
  const second = await browser.newContext({
    extraHTTPHeaders: headers,
    viewport: info.project.use.viewport ?? { width: 390, height: 844 },
  });
  const other = await second.newPage();
  other.setDefaultTimeout(15000);
  await other.goto('http://127.0.0.1:5173/#account');
  await expect(other.getByRole('status').filter({ hasText: 'All progress synced' })).toBeVisible();
  await other.goto('http://127.0.0.1:5173/#learn');
  await expect(
    other.getByRole('heading', { name: spanish.lessons[5].title, exact: true }),
  ).toBeVisible();
  await second.setOffline(true);
  await other.goto('http://127.0.0.1:5173/#conversation');
  await other.getByRole('button', { name: /Your usual, please/ }).click();
  await expect(
    other.getByRole('heading', { name: 'Your usual, please.', exact: true, level: 1 }),
  ).toBeVisible();
  await other.goto('http://127.0.0.1:5173/#account');
  await other.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect(other.locator('.sync-status.offline')).toBeVisible();
  await second.setOffline(false);
  await expect(other.getByRole('status').filter({ hasText: 'All progress synced' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'All progress synced' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add my guest progress', exact: true }),
  ).toHaveCount(0);
  await visit(page, 'conversation');
  await expect(
    page.getByRole('heading', { name: 'Your conversations', exact: true }),
  ).toBeVisible();
  const remote = await other.request.get('http://127.0.0.1:5173/api/progress');
  const record = await remote.json();
  expect(record.snapshot.progress.filter((p: { placedAt?: string }) => p.placedAt)).toHaveLength(5);
  expect(record.snapshot.conversations).toHaveLength(1);
  await second.close();
});
test('new account, placement and conversation views fit 320px and remain accessible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 820 });
  for (const route of ['account', 'placement', 'conversation']) {
    await visit(page, route);
    await audit(page);
  }
  await page.getByRole('button', { name: /Make a new friend/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Make a new friend.', exact: true, level: 1 }),
  ).toBeVisible();
  await audit(page);
});
