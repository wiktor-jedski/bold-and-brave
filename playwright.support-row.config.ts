/**
 * Dedicated promised-row Playwright configuration (ARCH-024, ARCH-028,
 * REQ-012, REQ-013).
 *
 * This configuration runs the local promised-row acceptance: it launches
 * the system Chromium executable resolved from `PATH` by the
 * `check:support-row` gate, and it sets the promised 1920 × 1080
 * CSS-pixel viewport and 1.0 device-pixel ratio from the shared
 * `SUPPORT_PROMISE` record (REQ-013). It is used only by
 * `bun run check:support-row`; the default `playwright.config.ts`
 * remains the general Playwright browser check that GitHub-hosted
 * pull-request CI runs, and this configuration never runs in that
 * workflow (no promised-row claim in CI).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import { SUPPORT_PROMISE } from './src/browser/support'
import { SYSTEM_FACTS_PATH } from './scripts/check-support-row'

/** Project root derived from this configuration file's own location. */
const PROJECT_ROOT = fileURLToPath(new URL('.', import.meta.url))

/** The system facts written by the `check:support-row` gate before launch. */
const SYSTEM_FACTS_FILE = join(PROJECT_ROOT, SYSTEM_FACTS_PATH)

/** The single authored support row that the acceptance reuses (REQ-012). */
const PROMISED_ROW = SUPPORT_PROMISE.rows[0]

const system = JSON.parse(readFileSync(SYSTEM_FACTS_FILE, 'utf8')) as {
  readonly executablePath: string
}

export default defineConfig({
  testDir: './tests/e2e-support-row',
  projects: [
    {
      name: 'promised-row',
      use: {
        browserName: 'chromium',
        baseURL: 'http://localhost:4173',
        // The promised 1920 × 1080 CSS-pixel viewport and maximum
        // device-pixel ratio of 1.0 (REQ-013, PVS-SCP-008), read from the
        // shared support record instead of being re-authored (REQ-012).
        viewport: {
          width: PROMISED_ROW.viewport.width,
          height: PROMISED_ROW.viewport.height,
        },
        deviceScaleFactor: PROMISED_ROW.maxDevicePixelRatio,
        // Launch the system Chromium executable resolved from `PATH` by
        // the gate (ARCH-024).
        launchOptions: {
          executablePath: system.executablePath,
        },
      },
    },
  ],
  webServer: {
    command: 'bun run build && bun run preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
