import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  // One shared backend and JSON database: specs run one at a time.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'iPad landscape', testIgnore: /kiosk-terminal\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1180, height: 820 } } },
    // Lenovo Tab M10 class tablet (1920×1200 panel at 1.5×) in both orientations, with touch.
    { name: 'M10 landscape', testMatch: /kiosk-terminal\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, screen: { width: 1280, height: 800 }, hasTouch: true } },
    { name: 'M10 portrait', testMatch: /kiosk-terminal\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 800, height: 1280 }, screen: { width: 800, height: 1280 }, hasTouch: true } },
  ],
  webServer: [
    { command: 'npm --prefix backend run build && node e2e/start-backend.cjs', url: 'http://127.0.0.1:3100/health', reuseExistingServer: false, timeout: 30_000 },
    { command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --outDir .rofe-e2e-dist', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 60_000, env: { ROFE_BUILD_OUT_DIR: '.rofe-e2e-dist', VITE_API_URL: 'http://127.0.0.1:3100' } },
  ],
});
