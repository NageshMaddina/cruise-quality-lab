const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.E2E_PORT || 3100);

module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['e2e/**/*.spec.js', 'live/**/*.spec.js'],
  fullyParallel: true,
  workers: process.env.CI ? undefined : 2, // cap local browsers so slower laptops don't time out on launch
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0, // one retry in CI; a pass-on-retry is reported as flaky, not hidden
  reporter: [['list'], ['json', { outputFile: 'results/e2e.json' }], ['html', { outputFolder: 'results/e2e-html', open: 'never' }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop-chrome', testMatch: 'e2e/**/*.spec.js', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-android', testMatch: 'e2e/**/*.spec.js', use: { ...devices['Pixel 7'] } },
    { name: 'live-page', testMatch: 'live/**/*.spec.js', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: `node src/server.js`,
    env: { PORT: String(PORT), DEMO_BUG: process.env.DEMO_BUG || '' },
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false
  }
});
