import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  projects: [{ name: 'chromium', use: { browserName: 'chromium', baseURL: 'http://localhost:4173' } }],
  webServer: {
    command: 'bun run build && bun run preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
