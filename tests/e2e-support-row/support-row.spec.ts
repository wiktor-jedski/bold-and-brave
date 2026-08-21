/**
 * Promised-row acceptance spec (ARCH-024, ARCH-028, REQ-012, REQ-013,
 * REQ-015, REQ-134, REQ-136).
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
 * the product to pass every ordered gate — secure context, WebGPU
 * presence, physical adapter, core-only device, and Three.js WebGPU
 * backend — reads the machine-readable startup record the product reports,
 * validates it against the shared support row and the gate-verified host
 * GPU and driver row, and only then writes
 * `test-results/support-row/startup.json`. A headless launch, a software
 * adapter, a failed gate, or a mismatched record fails the test before
 * the startup evidence file exists.
 *
 * The same headed launch also drives the real startup Scene load through
 * the built product (ARCH-022, REQ-136, PVS-WEB-003): the product
 * downloads the authored glTF asset `poc-overworld-environment` for Scene
 * `poc-overworld`, visibly reports download, decode, GPU upload, and Scene
 * readiness in order, and enters `Ready`. A Playwright-delayed asset
 * response completes without a load timeout because no elapsed-time limit
 * exists. The spec observes one WebGPU canvas, the authored animation, and
 * no WebGL path or second frame loop, validates the machine-readable
 * Scene-load record, and only then writes
 * `test-results/support-row/scene-load.json`. GitHub-hosted pull-request
 * CI runs the general `playwright.config.ts` checks and never this spec.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { SUPPORT_PROMISE } from '../../src/browser/support'
import type { StartupRecord } from '../../src/browser/startup'
import type { SceneLoadRecord } from '../../src/browser/scene'
import {
  ENVIRONMENT_RECORD_PATH,
  SCENE_LOAD_RECORD_PATH,
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
import {
  readAuthoredAnimationNames,
  validateSceneLoadEvidenceRecord,
} from '../../scripts/scene-load-record'

/** Project root: the promised-row command always runs from the repo root. */
const PROJECT_ROOT = process.cwd()

/** System facts written by the `check:support-row` gate before launch. */
const SYSTEM_FACTS_FILE = join(PROJECT_ROOT, SYSTEM_FACTS_PATH)

/** The machine-readable evidence file written only after validation passes. */
const ENVIRONMENT_RECORD_FILE = join(PROJECT_ROOT, ENVIRONMENT_RECORD_PATH)

/** The machine-readable Phase 6 startup evidence file written only after validation passes. */
const STARTUP_RECORD_FILE = join(PROJECT_ROOT, STARTUP_RECORD_PATH)

/** The machine-readable Phase 7 Scene-load evidence file written only after validation passes. */
const SCENE_LOAD_RECORD_FILE = join(PROJECT_ROOT, SCENE_LOAD_RECORD_PATH)

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
 * the promised machine. The spec waits for the product to pass every
 * ordered gate — the delivery state leaves `Startup` for `Loading Scene`
 * and then the Scene load continues to `Ready` — and then reads the
 * machine-readable startup record the product reports, validates it
 * against the shared support row and the gate-verified exactly-one host
 * GPU and driver row, and writes `test-results/support-row/startup.json`
 * only after validation passes. A headless launch, an unsafe
 * WebGPU-enabling or blocklist-bypass flag, a software adapter, a failed
 * gate, or a mismatched record fails here before the evidence file exists.
 */
test('the promised row runs the real Phase 6 startup and writes the startup record after every ordered gate success', async ({
  page,
}) => {
  // Scene assets are the downloads, decodes, and uploads the Scene loader
  // would request. The single asset request of the startup load can occur
  // only after every gate passes, because the Scene-loading handoff runs
  // only on success (REQ-134, PVS-WEB-001).
  const sceneAssetRequests: string[] = []
  page.on('request', (request) => {
    if (/\.(glb|gltf|bin|png|jpg|jpeg|webp)(\?|$)/i.test(request.url())) {
      sceneAssetRequests.push(request.url())
    }
  })

  await page.goto('/')

  // The real headed startup passes every ordered gate (REQ-134,
  // PVS-WEB-001); the state then continues through the Scene load to
  // `Ready` (REQ-136).
  const state = page.locator('#delivery-state')
  await expect(state).toHaveText(/Loading Scene|Ready/, { timeout: 120_000 })

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

  // The startup Scene load made exactly one asset request — the authored
  // glTF — and it can only have occurred after the gates passed, because
  // the Scene-loading handoff runs only on success (REQ-134, PVS-WEB-001,
  // REQ-136).
  expect(sceneAssetRequests).toHaveLength(1)

  // Machine-readable Phase 6 startup evidence, written only after
  // validation passes.
  mkdirSync(dirname(STARTUP_RECORD_FILE), { recursive: true })
  writeFileSync(STARTUP_RECORD_FILE, `${JSON.stringify(evidence, null, 2)}\n`)
})

/**
 * The real startup Scene load of the built product on the promised row
 * (ARCH-022, ARCH-024, REQ-136, PVS-WEB-003).
 *
 * After every startup gate passes, the product downloads the authored glTF
 * asset `poc-overworld-environment` for Scene `poc-overworld`, visibly
 * reports download, decode, GPU upload, and Scene readiness in order, and
 * enters `Ready`. The spec delays the asset response with a Playwright
 * route and proves the delayed load still completes without a load
 * timeout, because no elapsed-time limit exists (REQ-136). It observes one
 * WebGPU canvas, the authored animation through the machine-readable
 * Scene-load record, and no second frame loop, validates the record
 * against the committed authored glTF, and writes
 * `test-results/support-row/scene-load.json` only after validation passes.
 */
test('the promised row loads the startup Scene to Ready with visible ordered progress, one canvas, the authored animation, and no second frame loop', async ({
  page,
}) => {
  // Delay the real asset response: the load must complete without a
  // timeout because no elapsed-time limit is configured (REQ-136,
  // PVS-WEB-003).
  await page.route('**/poc-overworld-environment.gltf', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })

  // Instrument `requestAnimationFrame` before any page script runs: the
  // application owns exactly one game frame loop — the Browser Runtime
  // (ARCH-006, ARCH-008). Three.js's `WebGPURenderer` additionally keeps
  // its own internal `requestAnimationFrame` bookkeeping chain after
  // initialization (it renders nothing and advances no tick), so exactly
  // two chains are ever concurrently pending: the runtime loop and the
  // renderer's internal loop. A second application frame loop would add a
  // third concurrent request, and a stopped runtime would leave only the
  // renderer chain.
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame
    let pending = 0
    let maxPending = 0
    ;(window as unknown as { __boldAndBraveMaxPendingFrames: () => number }).__boldAndBraveMaxPendingFrames =
      () => maxPending
    window.requestAnimationFrame = (callback) => {
      pending += 1
      maxPending = Math.max(maxPending, pending)
      return original((timestamp) => {
        pending -= 1
        callback(timestamp)
      })
    }
  })

  await page.goto('/')

  // The real headed startup runs the gates and loads the Scene to `Ready`
  // (REQ-136, PVS-WEB-001).
  const state = page.locator('#delivery-state')
  await expect(state).toHaveText('Ready', { timeout: 120_000 })

  // The product visibly reported the ordered download, decode, GPU-upload,
  // and Scene-readiness stages (PVS-WEB-003): the accumulated progress
  // list shows all four labels in order.
  const items = page.locator('#scene-progress li')
  await expect(items).toHaveCount(4)
  await expect(items.nth(0)).toContainText('Download')
  await expect(items.nth(1)).toHaveText('Decode')
  await expect(items.nth(2)).toHaveText('GPU upload')
  await expect(items.nth(3)).toHaveText('Scene readiness')

  // One WebGPU canvas on the product surface (ARCH-024): no second
  // renderer, device, or canvas exists.
  await expect(page.locator('canvas')).toHaveCount(1)

  // The one application frame loop stays the only game loop: over an
  // observation window of real frames, the maximum of concurrently pending
  // frame requests is exactly two — the Browser Runtime loop and the
  // WebGPURenderer's internal bookkeeping chain (ARCH-006, ARCH-008). A
  // second application frame loop would raise the maximum to three.
  await page.waitForTimeout(1000)
  const maxPendingFrames = await page.evaluate(
    () =>
      (window as unknown as { __boldAndBraveMaxPendingFrames: () => number })
        .__boldAndBraveMaxPendingFrames(),
  )
  expect(maxPendingFrames).toBe(2)

  // The product reports the machine-readable Scene-load record only after
  // the real load passed (REQ-136).
  const reported = await page.evaluate(() => {
    const record = (window as unknown as { __boldAndBraveSceneLoadRecord?: SceneLoadRecord })
      .__boldAndBraveSceneLoadRecord
    return record ?? null
  })
  expect(reported).not.toBeNull()

  // A wrong Scene ID, asset ID, stage order, backend, animation clip, or
  // final state fails here, before the evidence file is written (REQ-136,
  // PVS-WEB-003). The authored animation clip names come from the
  // committed authored glTF file, so the check observes the authored
  // animation and not a second copy.
  const rejections = validateSceneLoadEvidenceRecord(
    reported as SceneLoadRecord,
    readAuthoredAnimationNames(PROJECT_ROOT),
  )
  expect(rejections).toEqual([])

  // Machine-readable Phase 7 Scene-load evidence, written only after
  // validation passes.
  mkdirSync(dirname(SCENE_LOAD_RECORD_FILE), { recursive: true })
  writeFileSync(SCENE_LOAD_RECORD_FILE, `${JSON.stringify(reported, null, 2)}\n`)
})
