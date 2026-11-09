import { defineConfig, devices } from '@playwright/test';

const webUrl = process.env.WEB_URL ?? 'http://localhost:5173';
const apiUrl = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: webUrl,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter api dev',
      url: `${apiUrl}/health/live`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: '..',
    },
    {
      command: 'pnpm --filter web dev',
      url: webUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: '..',
    },
  ],
});
