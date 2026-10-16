import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end participant simulations against a production build that stores
 * data locally in ./.data-e2e (no Supabase needed).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3200', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 860 } } },
  ],
  webServer: {
    command: 'npx next start -p 3200',
    url: 'http://localhost:3200',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { STUDY_LOCAL_STORE: '1' },
  },
});
