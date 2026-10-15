import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/models',
  workers: 1,
  retries: 0,
  timeout: 600000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'chrome',
    launchOptions: { args: ['--use-angle=metal'] },
    viewport: { width: 393, height: 851 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
});
