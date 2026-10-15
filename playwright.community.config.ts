import { defineConfig } from '@playwright/test';
import base from './playwright.config';
if (!process.env.PASO_HF_SPACE)
  throw Error('Set PASO_HF_SPACE to your verified public owner/space.');
export default defineConfig({
  ...base,
  testDir: './tests/models',
  testMatch: 'community.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  projects: base.projects?.filter((project) => project.name?.startsWith('mobile-')),
});
