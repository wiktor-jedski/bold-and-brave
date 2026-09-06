import { defineConfig } from '@playwright/test';

const chromiumPath = process.env.CHROMIUM_PATH;
const headless = process.env.PVS_HEADED !== '1';
if (!chromiumPath) throw new Error('Set CHROMIUM_PATH to Chromium 151.0.7922.137 before running browser checks.');

export default defineConfig({
  testDir: './tests',
  testMatch: 'browser.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/browser',
  preserveOutput: 'always',
  reporter: [['list'], ['html', { outputFolder: 'test-results/browser-report', open: 'never' }]],
  projects: [
    { name: 'functional', grepInvert: /SCN-17-PERFORMANCE-BRIDGE/ },
    { name: 'performance', grep: /SCN-17-PERFORMANCE-BRIDGE/, use: { trace: 'off', video: 'off', screenshot: 'off' } },
  ],
  use: {
    baseURL: process.env.PVS_BASE_URL ?? 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // Only bounded transition clips are recorded by the evidence fixture, never full-run video.
    video: 'off',
    launchOptions: {
      executablePath: chromiumPath,
      ignoreDefaultArgs: ['--enable-unsafe-swiftshader', '--no-startup-window', '--hide-scrollbars'],
      args: [
        '--enable-unsafe-webgpu',
        `--enable-features=${headless ? 'Vulkan,VulkanFromANGLE,DefaultANGLEVulkan' : 'Vulkan'}`,
        '--use-angle=vulkan',
        ...(headless ? ['--disable-vulkan-surface'] : ['--ozone-platform=x11']),
      ],
    },
  },
  webServer: process.env.PVS_BASE_URL ? undefined : {
    command: 'bun run dev --host 127.0.0.1 --port 4173 --strictPort',
    url: process.env.PVS_BASE_URL ?? 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
