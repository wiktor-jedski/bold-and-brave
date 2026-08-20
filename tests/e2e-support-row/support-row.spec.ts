/**
 * Promised-row acceptance spec (ARCH-024, ARCH-028, REQ-012, REQ-013,
 * REQ-015, REQ-134).
 *
 * This spec runs only through `bun run check:support-row` with the
 * dedicated `playwright.support-row.config.ts`: it launches the system
 * Chromium resolved from `PATH` in headed mode through the active desktop
 * session at the promised 1920 × 1080 CSS-pixel viewport and 1.0
 * device-pixel ratio (REQ-013). It measures the actual browser version,
 * platform, architecture, GPU, driver, browser dimensions, and
 * device-pixel ratio, validates the complete environment record against
 * the shared `SUPPORT_PROMISE` record (REQ-012), and only then writes the
 * machine-readable evidence `test-results/support-row/environment.json`
 * without a Linux distribution version (PVS-SCP-007). A mismatched value
 * fails the test before the evidence file exists, so a wrong environment
 * cannot produce passing evidence.
 *
 * The same headed launch exercises the real Phase 6 startup through the
 * built product (REQ-011, REQ-014, REQ-134, REQ-135): the spec waits for
 * the `Loading Scene` delivery state, which the product enters only after
 * every ordered gate — secure context, WebGPU presence, physical adapter,
 * core-only device, and Three.js WebGPU backend — passes, reads the
 * machine-readable startup record the product reports, validates it
 * against the shared support row and the gate-verified host GPU and
 * driver row, and only then writes
 * `test-results/support-row/startup.json`. A headless launch, a software
 * adapter, a failed gate, or a mismatched record fails the test before
 * the startup evidence file exists. GitHub-hosted pull-request CI runs
 * the general `playwright.config.ts` checks and never this spec.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { SUPPORT_PROMISE } from '../../src/browser/support'
import type { StartupRecord } from '../../src/browser/startup'
import {
  ENVIRONMENT_RECORD_PATH,
  STARTUP_RECORD_PATH,
  SYSTEM_FACTS_PATH,
} from '../../scripts/check-support-row'
import {
  buildSupportRowEnvironmentRecord,
  validateSupportRowEnvironment,
  type SystemFacts,
} from '../../scripts/support-row-record'
import {
  buildStartupEvidenceRecord,
  validateStartupEvidenceRecord,
} from '../../scripts/startup-record'

/** Project root: the promised-row command always runs from the repo root. */
const PROJECT_ROOT = process.cwd()

/** System facts written by the `check:support-row` gate before launch. */
const SYSTEM_FACTS_FILE = join(PROJECT_ROOT, SYSTEM_FACTS_PATH)

/** The machine-readable evidence file written only after validation passes. */
const ENVIRONMENT_RECORD_FILE = join(PROJECT_ROOT, ENVIRONMENT_RECORD_PATH)

/** The machine-readable Phase 6 startup evidence file written only after validation passes. */
const STARTUP_RECORD_FILE = join(PROJECT_ROOT, STARTUP_RECORD_PATH)

/**
 * The local promised-row command launches the system Chromium at the
 * promised viewport and device-pixel ratio, measures the actual
 * environment, validates it against the shared support record, and writes
 * the machine-readable evidence only when every promised value matches
 * (REQ-012, REQ-013).
 */
test('the promised-row acceptance records an environment that matches the shared support record', async ({
  browser,
  page,
}) => {
  const system = JSON.parse(readFileSync(SYSTEM_FACTS_FILE, 'utf8')) as SystemFacts

  await page.goto('/')

  // The promised browser boots the built product: one application name and
  // exactly one semantic support table with one body row (ARCH-024,
  // REQ-012, REQ-015).
  await expect(page.locator('#app')).toContainText('Bold and Brave')
  const table = page.getByRole('table')
  await expect(table).toHaveCount(1)
  await expect(table.locator('tbody tr')).toHaveCount(1)

  // Actual browser measurements on the promised row (REQ-013): the real
  // rendered viewport (`window.innerWidth`/`innerHeight`) and device-pixel
  // ratio, so a browser that ignores the configured viewport is rejected
  // instead of echoing the configuration.
  const measurements = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  }))
  const record = buildSupportRowEnvironmentRecord(system, {
    browserVersion: browser.version(),
    viewportWidth: measurements.viewportWidth,
    viewportHeight: measurements.viewportHeight,
    devicePixelRatio: measurements.devicePixelRatio,
  })

  // A mismatched browser version, platform, architecture, GPU, driver,
  // viewport, or device-pixel ratio fails here, before the evidence file
  // is written (REQ-012, REQ-013).
  const rejections = validateSupportRowEnvironment(record, SUPPORT_PROMISE)
  expect(rejections).toEqual([])

  // Machine-readable evidence, written only after validation passes, with
  // no Linux distribution field (PVS-SCP-007).
  mkdirSync(dirname(ENVIRONMENT_RECORD_FILE), { recursive: true })
  writeFileSync(ENVIRONMENT_RECORD_FILE, `${JSON.stringify(record, null, 2)}\n`)

  // The support table shows the one promised row on the promised machine;
  // the values come from the shared record (REQ-012, REQ-015).
  const promised = SUPPORT_PROMISE.rows[0]
  await expect(table.locator('tbody tr td')).toHaveText([
    promised.browser,
    promised.browserVersion,
    promised.platform,
    promised.gpu,
    promised.driver,
    `${promised.viewport.width} × ${promised.viewport.height} ${promised.viewport.unit}`,
    promised.maxDevicePixelRatio.toFixed(1),
    promised.inputMode,
  ])
})

/**
 * The real Phase 6 startup of the built product on the promised row
 * (ARCH-023, ARCH-024, REQ-011, REQ-014, REQ-134, REQ-135).
 *
 * The headed system Chromium boots the built product; the product's
 * ordered startup gates run against the real physical WebGPU adapter of
 * the promised machine. The spec waits for `Loading Scene` — the delivery
 * state the product enters only after every ordered gate passes — and then
 * reads the machine-readable startup record the product reports, validates
 * it against the shared support row and the gate-verified exactly-one host
 * GPU and driver row, and writes
 * `test-results/support-row/startup.json` only after validation passes. A
 * headless launch, an unsafe WebGPU-enabling or blocklist-bypass flag, a
 * software adapter, a failed gate, or a mismatched record fails here
 * before the evidence file exists.
 */
test('the promised row runs the real Phase 6 startup to Loading Scene and writes the startup record after every ordered gate success', async ({
  page,
}) => {
  // Scene assets are the downloads, decodes, and uploads the Scene loader
  // would request; no asset may be requested before all gates pass
  // (REQ-134, PVS-WEB-001).
  const sceneAssetRequests: string[] = []
  page.on('request', (request) => {
    if (/\.(glb|gltf|bin|png|jpg|jpeg|webp)(\?|$)/i.test(request.url())) {
      sceneAssetRequests.push(request.url())
    }
  })

  await page.goto('/')

  // The real headed startup reaches `Loading Scene` only after every
  // ordered gate passes (REQ-134, PVS-WEB-001).
  const state = page.locator('#delivery-state')
  await expect(state).toHaveText('Loading Scene', { timeout: 120_000 })

  // The product reports the machine-readable startup record only after
  // every gate passed: a failed startup publishes nothing.
  const reported = await page.evaluate(() => {
    const record = (window as unknown as { __boldAndBraveStartupRecord?: StartupRecord })
      .__boldAndBraveStartupRecord
    return record ?? null
  })
  expect(reported).not.toBeNull()

  const system = JSON.parse(readFileSync(SYSTEM_FACTS_FILE, 'utf8')) as SystemFacts
  const evidence = buildStartupEvidenceRecord(reported as StartupRecord, system)

  // A mismatched secure context, gate order, power preference, adapter
  // vendor or nonfallback signal, missing information or limits, non-empty
  // core device request, non-WebGPU backend, WebGL fallback, delivery
  // state, host GPU, driver, or GPU-row count fails here, before the
  // evidence file is written (REQ-011, REQ-012, REQ-014, REQ-134,
  // REQ-135).
  const rejections = validateStartupEvidenceRecord(evidence, SUPPORT_PROMISE)
  expect(rejections).toEqual([])

  // No Scene asset request occurred before the gates passed (REQ-134,
  // PVS-WEB-001).
  expect(sceneAssetRequests).toEqual([])

  // Machine-readable Phase 6 startup evidence, written only after
  // validation passes.
  mkdirSync(dirname(STARTUP_RECORD_FILE), { recursive: true })
  writeFileSync(STARTUP_RECORD_FILE, `${JSON.stringify(evidence, null, 2)}\n`)
})
