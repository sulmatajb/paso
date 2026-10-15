import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testIgnore: '**/speech.spec.ts',
  fullyParallel: true,
  // Media capture and offline-cache setup share limited CI runner resources.
  workers: process.env.CI ? 1 : 3,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], viewport: { width: 393, height: 851 } },
    },
    // Playwright's Linux WebKit omits MediaRecorder. Run the actual recording
    // journey on macOS, where WebKit exposes the same media API as Safari.
    ...(process.platform === 'darwin'
      ? [
          {
            name: 'mobile-webkit',
            use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
          },
        ]
      : []),
  ],
  webServer: {
    command: 'npm run preview -- --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
