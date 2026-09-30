import { defineConfig, devices } from '@playwright/test';

// Explicit opt-in only: this creates temporary rooms in the configured project.
// Keep hosted-service checks separate from deterministic CI tests.
export default defineConfig({
  testDir: './e2e-live', workers: 1, timeout: 180000,
  expect: { timeout: 15000 }, reporter: 'list', outputDir: 'test-results-live',
  use: { baseURL: 'http://127.0.0.1:5175', ...devices['Desktop Chrome'], screenshot: 'only-on-failure' },
  webServer: { command: 'npm run preview -- --port 5175', url: 'http://127.0.0.1:5175', reuseExistingServer: false },
});
