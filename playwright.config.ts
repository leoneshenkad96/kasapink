import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const localChromeCandidates = process.platform === 'win32'
  ? [
      `${process.env.PROGRAMFILES ?? 'C:/Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
    ]
  : [];
const browserExecutable = process.env.E2E_BROWSER_EXECUTABLE
  ?? localChromeCandidates.find((candidate) => candidate && existsSync(candidate));

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    ...(browserExecutable ? { launchOptions: { executablePath: browserExecutable } } : {}),
  },
  webServer: process.env.E2E_MANAGED_SERVER === '1' ? {
    command: 'pnpm local:start',
    url: `${baseURL}/api/healthz`,
    timeout: 120_000,
    reuseExistingServer: true,
  } : undefined,
});
