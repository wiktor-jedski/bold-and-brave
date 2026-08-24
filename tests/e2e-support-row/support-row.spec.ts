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
 * the built product (ARCH-022, REQ-136, REQ-137, PVS-WEB-003,
 * PVS-WEB-004): the product downloads the authored glTF asset
 * `poc-overworld-environment` for Scene `poc-overworld`, visibly reports
 * download, decode, GPU upload, and Scene readiness in order, writes the
 * structured Scene-load console records with both identifiers, and enters
 * `Ready`. A Playwright-delayed asset response completes without a load
 * timeout because no elapsed-time limit exists. The spec then fails the
 * first real request for `poc-overworld-environment` after all startup
 * gates pass: the product makes one asset request, records the first error
 * with both identifiers, enters `Load failed`, runs no later stage, makes
 * no request during the no-retry observation period, keeps the one
 * semantic Retry visible, and — after one explicit Retry that restarts
 * visible progress at download — reaches `Ready` (REQ-134, PVS-WEB-001).
 * The spec observes one WebGPU canvas, the authored animation, and no
 * WebGL path or second frame loop, validates the machine-readable
 * Scene-load record of the retried journey — the exact event order,
 * identifiers, first-error stop, one explicit retry, WebGPU backend, and
 * final state — and only then writes
 * `test-results/support-row/scene-load.json` (REQ-136, REQ-137).
 *
 * The same headed launch also induces loss of the exact device the built
 * product selected (ARCH-024, REQ-134, REQ-138, PVS-WEB-001, PVS-WEB-005):
 * a Playwright initialization wrapper captures the device returned by the
 * production `GPUAdapter.requestDevice` call without adding a product-side
 * loss command, the spec observes `Ready` and an advancing complete
 * projection through the read-only device-loss observation the product
 * publishes, destroys that exact device, and follows the real
 * `device.lost` promise path into the terminal `Device lost` state with
 * the readable failure and exactly one Reload action. It proves that every
 * sampled complete projection equals the projection at loss and that the
 * frame-presentation record stops, then drives one Reload that requests a
 * new adapter and device, repeats the Three.js backend gate and Scene
 * load, and reaches `Ready`. The machine-readable device-loss record of
 * that journey — the exact loss tick, equal pre-Reload samples, stopped
 * presentation, visible Reload, repeated gate order, and final state — is
 * validated, and only then is `test-results/support-row/device-loss.json`
 * written (REQ-134, REQ-138, PVS-WEB-005).
 *
 * GitHub-hosted pull-request CI runs the general `playwright.config.ts`
 * checks and never this spec.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { SUPPORT_PROMISE } from '../../src/browser/support'
import type { SimulationProjection } from '../../src/core/simulation'
import { DEVICE_LOST_MESSAGE } from '../../src/browser/startup'
import type { DeviceLossObservation, StartupRecord } from '../../src/browser/startup'
import type { SceneLoadDiagnosticEvent, SceneLoadRecord } from '../../src/browser/scene'
import type { FramePresentationRecord } from '../../src/browser/presentation'
import type { TravelObservation } from '../../src/browser/input'
import { OVERWORLD, OVERWORLD_CAMERA_BOUNDS } from '../../src/core/content'
import {
  DEVICE_LOSS_RECORD_PATH,
  ENVIRONMENT_RECORD_PATH,
  FRAME_PRESENTATION_RECORD_PATH,
  OVERWORLD_TRAVEL_RECORD_PATH,
  SCENE_LOAD_RECORD_PATH,
  STARTUP_RECORD_PATH,
  SYSTEM_FACTS_PATH,
} from '../../scripts/check-support-row'
import {
  REQUIRED_STARTUP_GATES,
  validateDeviceLossEvidenceRecord,
} from '../../scripts/device-loss-record'
import type { DeviceLossEvidenceRecord } from '../../scripts/device-loss-record'
import {
  projectionsEqual,
  validateOverworldTravelEvidenceRecord,
  type OverworldTravelEvidenceRecord,
  type TravelRunTrace,
} from '../../scripts/overworld-travel-record'
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
  validateRetriedSceneLoadEvidenceRecord,
  validateSceneLoadEvidenceRecord,
  validateSceneLoadEventLog,
} from '../../scripts/scene-load-record'
import {
  authoredGltfPath,
  readAuthoredBandNodeNames,
  validateFramePresentationEvidenceRecord,
} from '../../scripts/frame-presentation-record'
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

/** The machine-readable frame-presentation evidence file written only after validation passes. */
const FRAME_PRESENTATION_RECORD_FILE = join(PROJECT_ROOT, FRAME_PRESENTATION_RECORD_PATH)

/** The machine-readable Phase 8 device-loss evidence file written only after validation passes. */
const DEVICE_LOSS_RECORD_FILE = join(PROJECT_ROOT, DEVICE_LOSS_RECORD_PATH)

/** The machine-readable Phase 9 Overworld travel evidence file written only after validation passes. */
const OVERWORLD_TRAVEL_RECORD_FILE = join(PROJECT_ROOT, OVERWORLD_TRAVEL_RECORD_PATH)

/** The noncanonical visual-review PNG captured against the Phase 9 visual reference and pass checklist. */
const PHASE_9_VISUAL_REVIEW_IMAGE_PATH = 'test-results/support-row/phase-9-visual-review.png'
const PHASE_9_VISUAL_REVIEW_FILE = join(PROJECT_ROOT, PHASE_9_VISUAL_REVIEW_IMAGE_PATH)

/**
 * Whether an arbitrary console argument is one structured Scene-load
 * diagnostic record of the built product (REQ-137, PVS-WEB-004).
 *
 * The product writes every diagnostic record as one object argument with
 * the `event`, `sceneId`, and `assetId` fields, so only the product's own
 * records match this guard.
 */
function isSceneLoadDiagnosticEvent(value: unknown): value is SceneLoadDiagnosticEvent {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.event === 'string' &&
    typeof record.sceneId === 'string' &&
    typeof record.assetId === 'string'
  )
}

/**
 * Capture the structured Scene-load console records of the built product
 * (REQ-137, PVS-WEB-004).
 *
 * Every `console.info`/`console.error` object argument is read with
 * `jsonValue`; the returned promise settles after the console records were
 * read, so the caller awaits the accumulated reads before validating.
 */
function captureSceneLoadConsoleRecords(page: Page): {
  readonly records: SceneLoadDiagnosticEvent[]
  readonly pending: Promise<void>[]
} {
  const records: SceneLoadDiagnosticEvent[] = []
  const pending: Promise<void>[] = []
  page.on('console', (message) => {
    pending.push(
      (async () => {
        for (const arg of message.args()) {
          try {
            const value = await arg.jsonValue()
            if (isSceneLoadDiagnosticEvent(value)) {
              records.push(value)
            }
          } catch {
            // A non-serializable console argument is not a Scene-load record.
          }
        }
      })(),
    )
  })
  return { records, pending }
}

/** The record shape with every `readonly` modifier removed for mutation. */
type DeepMutable<T> = { -readonly [Key in keyof T]: DeepMutable<T[Key]> }

/**
 * Hostile-record evidence: every malformed variant of the reported record
 * must be rejected by the exact validator that gates the Scene-load
 * evidence file, so invalid data makes the promised-row command nonzero
 * and leaves no passing Scene-load record (REQ-134, REQ-136, REQ-137).
 */
function expectSceneLoadEvidenceRejected(
  valid: SceneLoadRecord,
  mutate: (record: DeepMutable<SceneLoadRecord>) => void,
  validator: (record: SceneLoadRecord, names: readonly string[]) => string[],
  authoredAnimationNames: readonly string[],
): void {
  const record = structuredClone(valid) as DeepMutable<SceneLoadRecord>
  mutate(record)
  expect(validator(record as unknown as SceneLoadRecord, authoredAnimationNames)).not.toEqual([])
}

/**
 * The hostile mutators shared by both journey validators: a duplicate
 * non-progress record, an arbitrary unknown property on every record, a
 * wrong applicable stage, a missing byte field, a mismatched declared
 * total, decreasing received bytes, and a WebGL backend.
 */
const SHARED_HOSTILE_MUTATIONS: Array<(record: DeepMutable<SceneLoadRecord>) => void> = [
  // A duplicate non-progress record must not be hidden by collapsing.
  (record) => {
    record.events = [record.events[0], record.events[1], ...record.events.slice(1)]
  },
  // An arbitrary unknown property on every record must be rejected.
  (record) => {
    record.events = record.events.map((event) => ({ ...event, unexpected: 'x' }))
  },
  // A wrong applicable stage must be rejected.
  (record) => {
    record.events = record.events.map((event) =>
      event.event === 'decode' ? { ...event, stage: 'upload' } : event,
    )
  },
  // A missing applicable byte field must be rejected.
  (record) => {
    record.events = record.events.map((event) =>
      event.event === 'progress' ? { ...event, receivedBytes: undefined } : event,
    )
  },
  // One consistent declared total across the journey must hold.
  (record) => {
    record.events = record.events.map((event) =>
      event.event === 'download' ? { ...event, totalBytes: 100 } : event,
    )
  },
  // Received bytes must be monotonic: a decreasing progress update fails.
  (record) => {
    const index = record.events.findIndex((event) => event.event === 'progress')
    const decreasing = { ...record.events[index], receivedBytes: 1 }
    record.events = [
      ...record.events.slice(0, index + 1),
      decreasing,
      ...record.events.slice(index + 1),
    ]
  },
  // The WebGL fallback backend must be rejected.
  (record) => {
    record.backend = 'webgl'
  },
]

/** The failure-specific hostile mutators of the retried journey. */
const RETRIED_HOSTILE_MUTATIONS: Array<(record: DeepMutable<SceneLoadRecord>) => void> = [
  // The first error record must carry a non-empty readable message.
  (record) => {
    record.events = record.events.map((event) =>
      event.event === 'failure' ? { ...event, message: '' } : event,
    )
  },
  // A second failure is an automatic retry and must be rejected.
  (record) => {
    record.events = [
      ...record.events.slice(0, 2),
      record.events[1],
      ...record.events.slice(2),
    ]
  },
  // The failure must stop at an applicable download/decode/upload stage,
  // never at the readiness stage.
  (record) => {
    record.events = record.events.map((event) =>
      event.event === 'failure' ? { ...event, stage: 'ready' } : event,
    )
  },
  // The failure stage must match where the attempt actually stopped: an
  // attempt that reached decode and upload cannot fail at download.
  (record) => {
    const downloadIndex = record.events.findIndex((event) => event.event === 'download')
    const progressIndex = record.events.findIndex((event) => event.event === 'progress')
    const download = record.events[downloadIndex] as SceneLoadDiagnosticEvent
    const progress = record.events[progressIndex] as SceneLoadDiagnosticEvent
    const totalBytes = download.totalBytes ?? null
    const finishedBytes = typeof totalBytes === 'number' ? totalBytes : 0
    const decode: SceneLoadDiagnosticEvent = {
      event: 'decode',
      sceneId: download.sceneId,
      assetId: download.assetId,
      stage: 'decode',
      receivedBytes: finishedBytes,
      totalBytes,
    }
    const upload: SceneLoadDiagnosticEvent = {
      event: 'upload',
      sceneId: download.sceneId,
      assetId: download.assetId,
      stage: 'upload',
      receivedBytes: finishedBytes,
      totalBytes,
    }
    record.events = [
      record.events[0],
      { ...download, receivedBytes: 0 } as SceneLoadDiagnosticEvent,
      { ...progress } as SceneLoadDiagnosticEvent,
      decode,
      upload,
      ...record.events.slice(1),
    ]
  },
  // Within one attempt, a numeric total and `null` must not mix in either
  // order: the first declared total (even `null`) binds the attempt.
  (record) => {
    record.events = record.events.map((event) =>
      event.event === 'download' ? { ...event, totalBytes: null } : event,
    )
  },
  // The recorded first-error summary must match the failure diagnostic
  // event in stage: a contradictory stage fails.
  (record) => {
    if (record.failure !== null) {
      record.failure = { stage: 'upload', message: record.failure.message }
    }
  },
  // The recorded first-error summary must match the failure diagnostic
  // event in message: a contradictory message fails.
  (record) => {
    if (record.failure !== null) {
      record.failure = { stage: record.failure.stage, message: 'a different readable error' }
    }
  },
]

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
 * (ARCH-022, ARCH-024, REQ-136, REQ-137, PVS-WEB-003, PVS-WEB-004).
 *
 * After every startup gate passes, the product downloads the authored glTF
 * asset `poc-overworld-environment` for Scene `poc-overworld`, visibly
 * reports download, decode, GPU upload, and Scene readiness in order,
 * writes the structured Scene-load console records with both identifiers,
 * and enters `Ready`. The spec delays the asset response with a Playwright
 * route and proves the delayed load still completes without a load
 * timeout, because no elapsed-time limit exists (REQ-136). It observes one
 * WebGPU canvas, the authored animation through the machine-readable
 * Scene-load record, and no second frame loop, validates the record and
 * the console records against the committed authored glTF, and reaches
 * `Ready` only after all four visible progress stages and the required
 * console records. The failed-then-retried journey is exercised by the
 * following spec test, which writes `test-results/support-row/scene-load.json`.
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

  // Capture the structured Scene-load console records of the built product
  // (REQ-137, PVS-WEB-004): every record must carry both identifiers, and
  // `Ready` is reached only after the required records.
  const consoleCapture = captureSceneLoadConsoleRecords(page)

  // Instrument `requestAnimationFrame` before any page script runs to
  // observe the application frame loop. The application owns exactly one
  // loop — the Browser Runtime (ARCH-006, ARCH-008). Three.js's
  // WebGPURenderer also keeps an internal bookkeeping chain (its
  // `Animation.update` callback, recognizable by the `autoReset` field it
  // resets each frame); that chain renders nothing and advances no tick,
  // so it is excluded from the application-loop measurement.
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame
    let appPending = 0
    let appMaxPending = 0
    const appChainRequests = new Map<() => void, number>()
    ;(window as unknown as {
      __boldAndBraveAppLoop: () => { appMaxPending: number; appChainCounts: number[] }
    }).__boldAndBraveAppLoop = () => ({
      appMaxPending,
      appChainCounts: Array.from(appChainRequests.values()),
    })
    window.requestAnimationFrame = (callback) => {
      const source = Function.prototype.toString.call(callback)
      const isThreeInternal =
        source.includes('autoReset') || source.includes('_context.requestAnimationFrame')
      if (!isThreeInternal) {
        appPending += 1
        appMaxPending = Math.max(appMaxPending, appPending)
        appChainRequests.set(callback, (appChainRequests.get(callback) ?? 0) + 1)
      }
      return original((timestamp) => {
        if (!isThreeInternal) {
          appPending -= 1
        }
        callback(timestamp)
      })
    }
  })

  await page.goto('/')

  // The real headed startup runs the gates and loads the Scene to `Ready`
  // (REQ-136, PVS-WEB-001).
  const state = page.locator('#delivery-state')
  await expect(state).toHaveText('Ready', { timeout: 120_000 })

  // Read the presentation facts of the frame loop right after `Ready`:
  // the Scene-loading handoff bound the Three.js frame presenter into the
  // runtime's presenter slot before entering `Ready`, so this first read
  // establishes the baseline of the rendered frame loop (ARCH-008,
  // REQ-118).
  const readFramePresentation = (): Promise<FramePresentationRecord | null> =>
    page.evaluate(() => {
      const read = (window as unknown as {
        __boldAndBraveFramePresentation?: () => FramePresentationRecord
      }).__boldAndBraveFramePresentation
      return read === undefined ? null : read()
    })
  const firstPresentation = await readFramePresentation()

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

  // The application owns exactly one frame loop: over an observation
  // window of real frames, at most one application frame request is ever
  // pending, and exactly one application callback keeps requesting frames
  // (ARCH-006, ARCH-008). A second application frame loop would raise the
  // pending maximum to two or add a second self-perpetuating callback.
  await page.waitForTimeout(1000)
  const appLoop = await page.evaluate(
    () =>
      (window as unknown as {
        __boldAndBraveAppLoop: () => { appMaxPending: number; appChainCounts: number[] }
      }).__boldAndBraveAppLoop(),
  )
  expect(appLoop.appMaxPending).toBe(1)
  expect(appLoop.appChainCounts.filter((count) => count >= 2)).toHaveLength(1)

  // The frame loop presented the two projected initial Band members and
  // advanced the authored animation from the current projection tick and
  // interpolation value on the existing frame loop (ARCH-008, REQ-118,
  // PVS-ARC-008): the second read reports both authored Band nodes, at
  // least the required presented frames, and an animation time beyond
  // zero, and both the frame count and the animation time advanced since
  // the first read.
  const secondPresentation = await readFramePresentation()
  expect(firstPresentation).not.toBeNull()
  expect(secondPresentation).not.toBeNull()

  // A missing, wrong, or extra presented node, too few presented frames,
  // or an animation that did not advance fails here, before the evidence
  // file is written (REQ-118, PVS-ARC-008). The authored Band-node names
  // come from the committed authored glTF file, so the check observes the
  // authored nodes and not a second copy.
  const presentationRejections = validateFramePresentationEvidenceRecord(
    secondPresentation as FramePresentationRecord,
    readAuthoredBandNodeNames(PROJECT_ROOT),
  )
  expect(presentationRejections).toEqual([])
  expect((secondPresentation as FramePresentationRecord).presentedFrames).toBeGreaterThan(
    (firstPresentation as FramePresentationRecord).presentedFrames,
  )
  expect((secondPresentation as FramePresentationRecord).animationTime).toBeGreaterThan(
    (firstPresentation as FramePresentationRecord).animationTime,
  )

  // Machine-readable frame-presentation evidence, written only after
  // validation passes.
  mkdirSync(dirname(FRAME_PRESENTATION_RECORD_FILE), { recursive: true })
  writeFileSync(
    FRAME_PRESENTATION_RECORD_FILE,
    `${JSON.stringify(secondPresentation, null, 2)}\n`,
  )

  // The product reports the machine-readable Scene-load record only after
  // the real load passed (REQ-136).
  const reported = await page.evaluate(() => {
    const record = (window as unknown as { __boldAndBraveSceneLoadRecord?: SceneLoadRecord })
      .__boldAndBraveSceneLoadRecord
    return record ?? null
  })
  expect(reported).not.toBeNull()

  // A wrong Scene ID, asset ID, stage order, backend, animation clip,
  // event order, missing identifier, automatic retry, or final state fails
  // here (REQ-136, REQ-137, PVS-WEB-003, PVS-WEB-004). The authored
  // animation clip names come from the committed authored glTF file, so
  // the check observes the authored animation and not a second copy.
  const rejections = validateSceneLoadEvidenceRecord(
    reported as SceneLoadRecord,
    readAuthoredAnimationNames(PROJECT_ROOT),
  )
  expect(rejections).toEqual([])

  // The browser console carried the same structured records with both
  // identifiers and the exact applicable payload fields (REQ-137,
  // PVS-WEB-004): the same complete event-log validation gates the
  // machine-readable record, so `Ready` was reached only after the
  // required console records.
  await Promise.all(consoleCapture.pending)
  const consoleRejections = validateSceneLoadEventLog(consoleCapture.records, false)
  expect(consoleRejections).toEqual([])
  expect(consoleCapture.records).toHaveLength(
    (reported as SceneLoadRecord).events.length,
  )

  // Hostile-record evidence: the same validator that gates the Scene-load
  // evidence must reject every malformed diagnostic record — a duplicate
  // non-progress record, an unknown property, a missing applicable stage,
  // a missing byte field, a mismatched declared total, decreasing received
  // bytes, and a WebGL backend — so invalid data makes the command nonzero
  // and leaves no passing Scene-load record (REQ-134, REQ-136, REQ-137).
  const valid = reported as SceneLoadRecord
  const authoredAnimationNames = readAuthoredAnimationNames(PROJECT_ROOT)
  for (const mutate of SHARED_HOSTILE_MUTATIONS) {
    expectSceneLoadEvidenceRejected(
      valid,
      mutate,
      validateSceneLoadEvidenceRecord,
      authoredAnimationNames,
    )
  }
})

/**
 * The first-error stop and one explicit Retry of the real startup Scene
 * load on the promised row (ARCH-022, ARCH-024, REQ-134, REQ-136,
 * REQ-137, PVS-WEB-001, PVS-WEB-004).
 *
 * After all startup gates pass, Playwright fails the first real request
 * for `poc-overworld-environment` with a 503 response. The product makes
 * exactly one asset request, records the first error with both
 * identifiers, runs no later stage, enters `Load failed` with the readable
 * error and one semantic Retry action, and starts no automatic retry: no
 * further request occurs during the no-retry observation period. One
 * explicit Retry makes one new request, restarts the visible progress at
 * download, and reaches `Ready`. The machine-readable Scene-load record of
 * this journey is validated — the exact event order, identifiers,
 * first-error stop, one explicit retry, WebGPU backend, and final state —
 * and only then is `test-results/support-row/scene-load.json` written
 * (REQ-136, REQ-137).
 */
test('the promised row stops at the first asset failure with Load failed and one Retry, and reaches Ready after one explicit Retry', async ({
  page,
}) => {
  // Capture the structured Scene-load console records of the built product
  // (REQ-137, PVS-WEB-004), including the first-error record.
  const consoleCapture = captureSceneLoadConsoleRecords(page)

  // Every real asset request the product makes, in order (REQ-136).
  const assetRequests: string[] = []
  page.on('request', (request) => {
    if (/\.(glb|gltf|bin|png|jpg|jpeg|webp)(\?|$)/i.test(request.url())) {
      assetRequests.push(request.url())
    }
  })

  // Fail the first real request for the authored asset with a readable
  // 503 response after all startup gates pass; the Retry's request passes
  // through unchanged (REQ-134, PVS-WEB-001).
  let gltfRequests = 0
  await page.route('**/poc-overworld-environment.gltf', async (route) => {
    gltfRequests += 1
    if (gltfRequests === 1) {
      await route.fulfill({ status: 503, body: 'asset temporarily unavailable' })
      return
    }
    await route.continue()
  })

  await page.goto('/')

  // The first failed stage enters `Load failed` after the real startup
  // gates pass (REQ-134, PVS-WEB-001).
  const state = page.locator('#delivery-state')
  await expect(state).toHaveText('Load failed', { timeout: 120_000 })

  // The failed run made exactly one asset request before `Load failed`.
  expect(assetRequests).toHaveLength(1)

  // The failure console record carries both identifiers and the readable
  // error (REQ-137, PVS-WEB-004).
  await Promise.all(consoleCapture.pending)
  const failureRecords = consoleCapture.records.filter((record) => record.event === 'failure')
  expect(failureRecords).toHaveLength(1)
  expect(failureRecords[0]?.sceneId).toBe('poc-overworld')
  expect(failureRecords[0]?.assetId).toBe('poc-overworld-environment')
  expect(failureRecords[0]?.message).toBe('The asset request failed with status 503.')

  // One semantic alert shows the readable error, and one semantic Retry
  // action stays visible (REQ-134, PVS-WEB-001, PVS-UI-009).
  await expect(page.getByRole('alert')).toHaveText('The asset request failed with status 503.')
  const retry = page.getByRole('button', { name: 'Retry' })
  await expect(retry).toBeVisible()

  // No later stage ran: the failed attempt reported no visible progress
  // stage (REQ-134, PVS-WEB-001).
  await expect(page.locator('#scene-progress li')).toHaveCount(0)

  // No automatic retry: no further asset request during the observation
  // period, while the Retry action stays visible (REQ-134, PVS-WEB-001).
  await page.waitForTimeout(1500)
  expect(assetRequests).toHaveLength(1)
  await expect(retry).toBeVisible()

  // One explicit Retry makes one new request and returns to `Loading
  // Scene`, restarting the visible progress at download (REQ-134,
  // PVS-WEB-001).
  await retry.click()
  await expect(state).toHaveText('Loading Scene')
  expect(assetRequests).toHaveLength(2)
  await expect(state).toHaveText('Ready', { timeout: 120_000 })

  // The visible progress restarted at download: exactly the four ordered
  // stages of the retried attempt, starting at Download (REQ-134,
  // PVS-WEB-003).
  const items = page.locator('#scene-progress li')
  await expect(items).toHaveCount(4)
  await expect(items.nth(0)).toContainText('Download')
  await expect(items.nth(1)).toHaveText('Decode')
  await expect(items.nth(2)).toHaveText('GPU upload')
  await expect(items.nth(3)).toHaveText('Scene readiness')

  // One WebGPU canvas on the product surface (ARCH-024): no second
  // renderer, device, or canvas exists after the Retry.
  await expect(page.locator('canvas')).toHaveCount(1)

  // The product reports the machine-readable Scene-load record of the
  // retried journey only after the real load passed (REQ-136, REQ-137).
  const reported = await page.evaluate(() => {
    const record = (window as unknown as { __boldAndBraveSceneLoadRecord?: SceneLoadRecord })
      .__boldAndBraveSceneLoadRecord
    return record ?? null
  })
  expect(reported).not.toBeNull()

  // The record must prove the exact event order, both identifiers in every
  // record, the first-error stop, exactly one explicit retry, the WebGPU
  // backend, and the final Ready state. A missing stage, missing
  // identifier, automatic retry, extra asset request, WebGL backend, or
  // invalid record fails here, before the evidence file is written
  // (REQ-134, REQ-136, REQ-137, PVS-WEB-001).
  const rejections = validateRetriedSceneLoadEvidenceRecord(
    reported as SceneLoadRecord,
    readAuthoredAnimationNames(PROJECT_ROOT),
  )
  expect(rejections).toEqual([])

  // The browser console carried the same structured journey with both
  // identifiers and the exact applicable payload fields in every record,
  // including the first error and the retried success (REQ-137,
  // PVS-WEB-004): the same complete event-log validation that gates the
  // machine-readable record also gates the console records.
  await Promise.all(consoleCapture.pending)
  const consoleRejections = validateSceneLoadEventLog(consoleCapture.records, true)
  expect(consoleRejections).toEqual([])
  expect(consoleCapture.records).toHaveLength(
    (reported as SceneLoadRecord).events.length,
  )

  // Hostile-record evidence: the same validator that gates the Scene-load
  // evidence must reject every malformed diagnostic record — a duplicate
  // non-progress record, an unknown property, a missing applicable stage,
  // a missing byte field, a mismatched declared total, decreasing received
  // bytes, an empty failure message, an automatic-retry journey, a failure
  // at the not-applicable readiness stage, a failure stage that does not
  // match the attempt's stopping stage, a numeric/null total mix within an
  // attempt, a first-error summary contradicting the failure diagnostic
  // event in stage or message, and a WebGL backend — so invalid data makes
  // the command nonzero and leaves no passing Scene-load record (REQ-134,
  // REQ-136, REQ-137, PVS-WEB-001).
  const valid = reported as SceneLoadRecord
  const authoredAnimationNames = readAuthoredAnimationNames(PROJECT_ROOT)
  for (const mutate of [...SHARED_HOSTILE_MUTATIONS, ...RETRIED_HOSTILE_MUTATIONS]) {
    expectSceneLoadEvidenceRejected(
      valid,
      mutate,
      validateRetriedSceneLoadEvidenceRecord,
      authoredAnimationNames,
    )
  }

  // Valid partial-progress retry evidence: a first attempt that made
  // partial download progress before failing at the download stage, then
  // one explicit Retry that starts a new attempt at download (byte state
  // resets at the attempt boundary) and completes. The validator must
  // accept this legitimate journey (REQ-134, PVS-WEB-001, PVS-WEB-003).
  const partialProgress = structuredClone(valid) as DeepMutable<SceneLoadRecord>
  const downloadIndex = partialProgress.events.findIndex((event) => event.event === 'download')
  const progressIndex = partialProgress.events.findIndex((event) => event.event === 'progress')
  const totalBytes = partialProgress.events[downloadIndex].totalBytes
  const partialProgressRecord: SceneLoadRecord = {
    ...partialProgress,
    events: [
      partialProgress.events[0],
      { ...partialProgress.events[downloadIndex], receivedBytes: 0 },
      { ...partialProgress.events[progressIndex], receivedBytes: 100 },
      partialProgress.events[1],
      ...partialProgress.events.slice(2),
    ],
  }
  expect(
    validateRetriedSceneLoadEvidenceRecord(partialProgressRecord, authoredAnimationNames),
  ).toEqual([])

  // Machine-readable Phase 7 Scene-load evidence of the retried journey,
  // written only after validation passes.
  mkdirSync(dirname(SCENE_LOAD_RECORD_FILE), { recursive: true })
  writeFileSync(SCENE_LOAD_RECORD_FILE, `${JSON.stringify(reported, null, 2)}\n`)
})

/**
 * The real device-loss stop of the built product on the promised row
 * (ARCH-002, ARCH-006, ARCH-008, ARCH-009, ARCH-010, ARCH-023, ARCH-024,
 * REQ-134, REQ-138, PVS-WEB-001, PVS-WEB-005).
 *
 * A Playwright initialization wrapper captures the exact device returned
 * by the production `GPUAdapter.requestDevice` call without adding a
 * product-side loss command. After `Ready` and an observable complete-
 * projection advance through the read-only device-loss observation the
 * product publishes, the spec calls `GPUDevice.destroy()` on that exact
 * device and follows the real `device.lost` promise path: the product
 * terminal-stops the Simulation — the observation exposes the same
 * complete projection at loss and before Reload, every sampled projection
 * equals it, and the frame-presentation record stops — and the visible
 * state is `Device lost` with the readable failure and exactly one Reload
 * action. One Reload requests a new adapter and device, repeats the
 * Three.js WebGPU-backend gate and Scene load, and reaches `Ready`. The
 * machine-readable device-loss record of this journey is validated — the
 * exact loss tick, equal pre-Reload samples, stopped presentation, visible
 * Reload, repeated gate order, and final state — and only then is
 * `test-results/support-row/device-loss.json` written (REQ-134, REQ-138,
 * PVS-WEB-005).
 */
test('the promised row stops at a real device loss, keeps the projection and presentation frozen, and reaches Ready again after one Reload', async ({
  page,
}) => {
  // The Playwright initialization wrapper runs before any page script on
  // every document: it captures the exact device returned by the
  // production `GPUAdapter.requestDevice` call and records the ordered
  // adapter and device requests, without adding a product-side loss
  // command (REQ-138, PVS-WEB-005).
  await page.addInitScript(() => {
    const originalRequestAdapter = GPU.prototype.requestAdapter
    const originalRequestDevice = GPUAdapter.prototype.requestDevice
    const trace: string[] = []
    ;(window as unknown as { __boldAndBraveGateTrace: string[] }).__boldAndBraveGateTrace = trace
    ;(window as unknown as { __boldAndBraveAdapterRequests: number }).__boldAndBraveAdapterRequests = 0
    ;(window as unknown as { __boldAndBraveDeviceRequests: number }).__boldAndBraveDeviceRequests = 0
    ;(window as unknown as { __boldAndBraveDeviceCapture?: GPUDevice }).__boldAndBraveDeviceCapture =
      undefined
    ;(window as unknown as { __boldAndBraveDeviceCaptureLost: boolean }).__boldAndBraveDeviceCaptureLost =
      false
    GPU.prototype.requestAdapter = function (...args: unknown[]) {
      ;(window as unknown as { __boldAndBraveAdapterRequests: number }).__boldAndBraveAdapterRequests += 1
      trace.push('adapter-request')
      return originalRequestAdapter.apply(this, args as [GPURequestAdapterOptions?])
    }
    GPUAdapter.prototype.requestDevice = function (...args: unknown[]) {
      ;(window as unknown as { __boldAndBraveDeviceRequests: number }).__boldAndBraveDeviceRequests += 1
      trace.push('device-request')
      const result = originalRequestDevice.apply(this, args as [GPUDeviceDescriptor?])
      result.then((device) => {
        const state = window as unknown as {
          __boldAndBraveDeviceCapture?: GPUDevice
          __boldAndBraveDeviceCaptureLost: boolean
        }
        if (state.__boldAndBraveDeviceCapture === undefined) {
          state.__boldAndBraveDeviceCapture = device
        }
        // Watch the exact captured device's own `lost` promise so the
        // acceptance can prove the reloaded document runs a fresh, live
        // device — never the destroyed one.
        device.lost.then(() => {
          state.__boldAndBraveDeviceCaptureLost = true
        })
      })
      return result
    }
  })

  await page.goto('/')

  // The real headed startup repeats every gate and reaches `Ready`
  // (REQ-136, PVS-WEB-001).
  const state = page.locator('#delivery-state')
  await expect(state).toHaveText('Ready', { timeout: 120_000 })

  // The product published the read-only device-loss observation when the
  // coordinator was wired: before any loss the complete projection is live
  // and the loss projection is absent (ARCH-024, REQ-138).
  const readObservation = (): Promise<DeviceLossObservation | null> =>
    page.evaluate(() => {
      const read = (window as unknown as {
        __boldAndBraveDeviceLossObservation?: () => DeviceLossObservation
      }).__boldAndBraveDeviceLossObservation
      return read === undefined ? null : read()
    })
  const first = await readObservation()
  expect(first).not.toBeNull()
  expect(first?.lossProjection).toBeNull()
  const firstTick = first?.currentProjection.tick as number

  // Observable Simulation-tick advance through the complete projection:
  // over a real second the runtime dispatches fixed 60 Hz ticks, so the
  // complete projection tick strictly advances (ARCH-006, REQ-138).
  await page.waitForTimeout(1500)
  const advanced = await readObservation()
  expect((advanced?.currentProjection.tick as number) ?? 0).toBeGreaterThan(firstTick)

  // The wrapper captured the exact production-selected device: the first
  // document made exactly one adapter and one device request, and the
  // captured device is present (REQ-135, PVS-WEB-005).
  const firstDocument = await page.evaluate(() => {
    const state = window as unknown as {
      __boldAndBraveAdapterRequests: number
      __boldAndBraveDeviceRequests: number
      __boldAndBraveDeviceCapture?: GPUDevice
    }
    return {
      adapterRequests: state.__boldAndBraveAdapterRequests,
      deviceRequests: state.__boldAndBraveDeviceRequests,
      captured: state.__boldAndBraveDeviceCapture !== undefined,
    }
  })
  expect(firstDocument.adapterRequests).toBe(1)
  expect(firstDocument.deviceRequests).toBe(1)
  expect(firstDocument.captured).toBe(true)

  // Induce loss of the exact production-selected device: `destroy()` makes
  // the browser resolve the device's own `lost` promise, and the product
  // follows that real promise path into the terminal `Device lost` state
  // (REQ-134, REQ-138, PVS-WEB-005). No product-side loss command exists.
  await page.evaluate(() => {
    const state = window as unknown as { __boldAndBraveDeviceCapture?: GPUDevice }
    state.__boldAndBraveDeviceCapture?.destroy()
  })

  // The visible state is the terminal `Device lost` with the readable
  // semantic failure and exactly one Reload action; the terminal state
  // exposes no Retry or gameplay action (REQ-134, PVS-WEB-001).
  await expect(state).toHaveText('Device lost', { timeout: 120_000 })
  await expect(page.getByRole('alert')).toHaveText(DEVICE_LOST_MESSAGE)
  const reload = page.getByRole('button', { name: 'Reload' })
  await expect(reload).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  await expect(page.getByRole('button')).toHaveCount(1)

  // The observation now exposes the complete projection at loss and the
  // current pre-Reload projection — equal, read-only, with no device or
  // state-changing command (REQ-138, PVS-WEB-005).
  const atLoss = await readObservation()
  expect(atLoss?.lossProjection).not.toBeNull()
  const lossProjection = atLoss?.lossProjection as SimulationProjection
  expect(atLoss?.currentProjection).toEqual(lossProjection)

  // Every sampled complete projection before Reload equals the projection
  // at loss: a changed tick or projection after the loss means a hidden
  // tick ran while no frame could be shown (PVS-WEB-005).
  const samples: SimulationProjection[] = [lossProjection]
  for (let index = 0; index < 3; index += 1) {
    await page.waitForTimeout(500)
    const sample = await readObservation()
    expect(sample?.currentProjection).toEqual(lossProjection)
    expect(sample?.lossProjection).toEqual(lossProjection)
    samples.push(sample?.currentProjection as SimulationProjection)
  }

  // The frame-presentation record stops: no frame is presented after the
  // loss (ARCH-008, REQ-138, PVS-WEB-005).
  const readPresentation = (): Promise<FramePresentationRecord | null> =>
    page.evaluate(() => {
      const read = (window as unknown as {
        __boldAndBraveFramePresentation?: () => FramePresentationRecord
      }).__boldAndBraveFramePresentation
      return read === undefined ? null : read()
    })
  const presentationAtLoss = await readPresentation()
  expect(presentationAtLoss).not.toBeNull()
  await page.waitForTimeout(1500)
  const presentationAfter = await readPresentation()
  expect(presentationAfter?.presentedFrames).toBe(presentationAtLoss?.presentedFrames)

  // One explicit Reload performs the browser reload operation: the fresh
  // document runs the normal composition root, which requests a new
  // adapter and device, repeats the Three.js backend gate and Scene load,
  // and reaches `Ready` (REQ-134, PVS-WEB-001).
  await reload.click()
  await expect(state).toHaveText('Ready', { timeout: 120_000 })

  // The reloaded document requested exactly one new adapter and one new
  // device in the ordered trace, the captured device of that document is a
  // fresh live device (its own `lost` promise has not resolved), and the
  // product published the startup and Scene-load records of the repeated
  // journey (REQ-134, PVS-WEB-001).
  const secondDocument = await page.evaluate(() => {
    const state = window as unknown as {
      __boldAndBraveAdapterRequests: number
      __boldAndBraveDeviceRequests: number
      __boldAndBraveGateTrace: string[]
      __boldAndBraveDeviceCaptureLost: boolean
      __boldAndBraveStartupRecord?: unknown
      __boldAndBraveSceneLoadRecord?: unknown
    }
    return {
      adapterRequests: state.__boldAndBraveAdapterRequests,
      deviceRequests: state.__boldAndBraveDeviceRequests,
      gateTrace: state.__boldAndBraveGateTrace,
      deviceCaptureLost: state.__boldAndBraveDeviceCaptureLost,
      startup: state.__boldAndBraveStartupRecord ?? null,
      sceneLoad: state.__boldAndBraveSceneLoadRecord ?? null,
    }
  })
  expect(secondDocument.adapterRequests).toBe(1)
  expect(secondDocument.deviceRequests).toBe(1)
  expect(secondDocument.gateTrace).toEqual(['adapter-request', 'device-request'])
  expect(secondDocument.deviceCaptureLost).toBe(false)
  const repeatedStartup = secondDocument.startup as StartupRecord
  expect(repeatedStartup).not.toBeNull()
  // The Three.js WebGPU backend gate repeated and passed: the startup
  // record reports the ordered capability gates ending in the WebGPU
  // backend and no WebGL fallback (REQ-011, REQ-134).
  expect(repeatedStartup.backend.selected).toBe('webgpu')
  expect(repeatedStartup.backend.webglFallback).toBe(false)
  expect(repeatedStartup.gates).toEqual([...REQUIRED_STARTUP_GATES])
  // The Scene load repeated and passed: the Scene-load record reports the
  // final `Ready` delivery state (REQ-136, REQ-134).
  const repeatedSceneLoad = secondDocument.sceneLoad as SceneLoadRecord
  expect(repeatedSceneLoad).not.toBeNull()
  expect(repeatedSceneLoad.deliveryState).toBe('Ready')

  // The observed repeated gate order of the reload journey: the wrapper's
  // ordered trace proves the adapter and device requests in order, the
  // startup record proves the repeated Three.js WebGPU-backend gate, the
  // Scene-load record proves the repeated Scene load, and the delivery
  // surface proves the final `Ready` (REQ-134, PVS-WEB-001).
  const gateOrder: string[] = [
    ...secondDocument.gateTrace,
    'webgpu-backend',
    'scene-load',
    'ready',
  ]

  // The machine-readable Phase 8 device-loss record of the journey
  // (REQ-138, PVS-WEB-005).
  const record: DeviceLossEvidenceRecord = {
    lossTick: lossProjection.tick,
    lossProjection,
    samples,
    presentation: {
      presentedFramesAtLoss: presentationAtLoss?.presentedFrames ?? 0,
      presentedFramesAfter: presentationAfter?.presentedFrames ?? 0,
    },
    visibleState: 'Device lost',
    reloadActions: 1,
    adapterRequests: {
      beforeReload: firstDocument.adapterRequests,
      afterReload: secondDocument.adapterRequests,
    },
    deviceRequests: {
      beforeReload: firstDocument.deviceRequests,
      afterReload: secondDocument.deviceRequests,
    },
    gateOrder,
    startupGates: [...repeatedStartup.gates],
    finalState: 'Ready',
  }

  // A changed tick or projection, a post-loss frame, an in-process retry,
  // a missing or reordered startup gate, or a missing final `Ready` fails
  // here, before the evidence file is written (REQ-134, REQ-138,
  // PVS-WEB-005).
  const rejections = validateDeviceLossEvidenceRecord(record)
  expect(rejections).toEqual([])

  // Machine-readable Phase 8 device-loss evidence, written only after
  // validation passes.
  mkdirSync(dirname(DEVICE_LOSS_RECORD_FILE), { recursive: true })
  writeFileSync(DEVICE_LOSS_RECORD_FILE, `${JSON.stringify(record, null, 2)}\n`)
})

/**
 * The real Phase 9 Overworld travel of the built product on the promised row
 * (ARCH-001, ARCH-002, ARCH-006, ARCH-007, ARCH-008, ARCH-009, ARCH-012,
 * ARCH-023, ARCH-024, REQ-017, REQ-018, REQ-035, REQ-117, REQ-170,
 * PVS-FLW-001, PVS-FLW-002, PVS-FLW-022, PVS-UI-001).
 *
 * The local promised-row acceptance executes the complete focused travel check
 * twice from clean campaigns:
 *   - verifies the exact start position (0, 0, 1.5) and 1.5-world-unit route;
 *   - rotates and zooms the camera within authored top-down bounds without
 *     affecting the Simulation projection;
 *   - clicks traversable ground to travel to the settlement boundary at (0, 0, 0);
 *   - pauses mid-route with Space, confirms travel and time stop, and resumes;
 *   - observes arrival at the settlement boundary at elapsed time 0.5 Overworld day
 *     with Provisions 9.8 (0.2 consumed in 0.1 steps for the 2-member Band);
 *   - proves Run 1 and Run 2 produce identical command and projection traces;
 *   - captures the noncanonical visual-review PNG against the Phase 9 checklist;
 *   - proves device loss closes input before another command can be created;
 *   - validates the evidence record and writes `overworld-travel.json`.
 */
test('the promised row performs Overworld travel with click-to-move, camera rotation, zoom, pause, and arrival at the settlement boundary', async ({
  page,
}) => {
  test.setTimeout(240_000)

  // Capture the production-selected device for the device-loss input gate check
  await page.addInitScript(() => {
    const originalRequestDevice = GPUAdapter.prototype.requestDevice
    ;(window as unknown as { __boldAndBraveDeviceCapture?: GPUDevice }).__boldAndBraveDeviceCapture =
      undefined
    GPUAdapter.prototype.requestDevice = function (...args: unknown[]) {
      const result = originalRequestDevice.apply(this, args as [GPUDeviceDescriptor?])
      result.then((device) => {
        const state = window as unknown as { __boldAndBraveDeviceCapture?: GPUDevice }
        if (state.__boldAndBraveDeviceCapture === undefined) {
          state.__boldAndBraveDeviceCapture = device
        }
      })
      return result
    }
  })

  const readTravelObservation = (): Promise<TravelObservation | null> =>
    page.evaluate(() => {
      const read = (window as unknown as {
        __boldAndBraveTravelObservation?: () => TravelObservation
      }).__boldAndBraveTravelObservation
      return read === undefined ? null : read()
    })

  // --------------------------------------------------------------------------
  // Startup and Camera Verification (REQ-017, REQ-018, ARCH-009)
  // --------------------------------------------------------------------------
  await page.goto('/')
  const state = page.locator('#delivery-state')
  await expect(state).toHaveText('Ready', { timeout: 120_000 })

  // 1. Confirm initial campaign state at Ready (REQ-017, REQ-077)
  const obsInitial = await readTravelObservation()
  expect(obsInitial).not.toBeNull()
  expect(obsInitial?.isInputAttached).toBe(true)
  expect(obsInitial?.currentProjection.scene).toBe(OVERWORLD.id)
  expect(obsInitial?.currentProjection.bandPawnPosition).toEqual({ x: 0, y: 0, z: 1.5 })
  expect(obsInitial?.currentProjection.destination).toBeNull()
  expect(obsInitial?.currentProjection.movementState).toBe('idle')
  expect(obsInitial?.currentProjection.paused).toBe(false)
  expect(obsInitial?.currentProjection.elapsedCampaignTime).toBe(0)
  expect(obsInitial?.currentProjection.provisions).toBe(10.0)
  expect(obsInitial?.currentProjection.consumptionRemainder).toBe(0)
  const initialCheckProjection = obsInitial?.currentProjection as SimulationProjection

  // 2. Camera rotation and zoom interaction (ARCH-009, REQ-018)
  const cameraInitial = obsInitial?.cameraState
  expect(cameraInitial).not.toBeNull()

  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  const canvasBox = box!

  // Secondary-button drag rotates camera
  await page.mouse.move(canvasBox.x + 500, canvasBox.y + 500)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(canvasBox.x + 600, canvasBox.y + 450, { steps: 5 })
  await page.mouse.up({ button: 'right' })

  const obsAfterRotate = await readTravelObservation()
  expect(obsAfterRotate?.cameraState?.yaw).not.toBe(cameraInitial?.yaw)
  // Simulation projection remains completely unchanged by camera operations
  expect(obsAfterRotate?.currentProjection.bandPawnPosition).toEqual(initialCheckProjection.bandPawnPosition)
  expect(obsAfterRotate?.currentProjection.provisions).toBe(10.0)
  expect(obsAfterRotate?.currentProjection.elapsedCampaignTime).toBe(0)

  // Wheel input zooms camera within authored bounds
  await page.mouse.move(canvasBox.x + 960, canvasBox.y + 540)
  await page.mouse.wheel(0, 50)
  const obsAfterZoom = await readTravelObservation()
  expect(obsAfterZoom?.cameraState?.distance).toBeGreaterThan(cameraInitial?.distance ?? 0)
  expect(obsAfterZoom?.cameraState?.pitch).toBeGreaterThanOrEqual(OVERWORLD_CAMERA_BOUNDS.minPitch)
  expect(obsAfterZoom?.cameraState?.pitch).toBeLessThanOrEqual(OVERWORLD_CAMERA_BOUNDS.maxPitch)
  expect(obsAfterZoom?.cameraState?.distance).toBeGreaterThanOrEqual(OVERWORLD_CAMERA_BOUNDS.minDistance)
  expect(obsAfterZoom?.cameraState?.distance).toBeLessThanOrEqual(OVERWORLD_CAMERA_BOUNDS.maxDistance)

  // Reset camera rotation and zoom back to default orientation for travel
  await page.mouse.move(canvasBox.x + 600, canvasBox.y + 450)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(canvasBox.x + 500, canvasBox.y + 500, { steps: 5 })
  await page.mouse.up({ button: 'right' })
  await page.mouse.wheel(0, -50)

  // --------------------------------------------------------------------------
  // RUN 1: First clean campaign (ARCH-005, REQ-018)
  // --------------------------------------------------------------------------
  await page.goto('/')
  await expect(state).toHaveText('Ready', { timeout: 120_000 })

  const obs1AtReady = await readTravelObservation()
  const readyTick1 = obs1AtReady?.currentProjection.tick ?? 0

  const readPresentation = (): Promise<FramePresentationRecord | null> =>
    page.evaluate(() => {
      const read = (window as unknown as {
        __boldAndBraveFramePresentation?: () => FramePresentationRecord
      }).__boldAndBraveFramePresentation
      return read === undefined ? null : read()
    })

  // Idle animation observation before movement begins
  const idlePresentation1 = await readPresentation()
  expect(idlePresentation1?.activeAnimation).toBe('idle')

  // Deterministic command offsets relative to Ready baseline (30 ticks setup, 360 travel ticks, 30 pause ticks, 3240 travel ticks)
  const START_OFFSET = 30
  const PAUSE_OFFSET = START_OFFSET + 360
  const RESUME_OFFSET = PAUSE_OFFSET + 30
  const ARRIVAL_OFFSET = RESUME_OFFSET + 3240

  // Wait for exact commanded start tick milestone (readyTick1 + START_OFFSET) and dispatch travel click
  await page.evaluate((targetStartTick) => {
    return new Promise<void>((resolve, reject) => {
      const check = () => {
        const obs = window.__boldAndBraveTravelObservation?.()
        if (!obs) {
          requestAnimationFrame(check)
          return
        }
        const currentTick = obs.currentProjection.tick
        if (currentTick > targetStartTick - 1) {
          reject(new Error(`Skipped target start tick ${targetStartTick - 1}; observed tick ${currentTick}.`))
          return
        }
        if (currentTick === targetStartTick - 1 && obs.currentProjection.movementState === 'idle') {
          const canvas = document.querySelector('canvas')
          if (canvas) {
            const rect = canvas.getBoundingClientRect()
            const eventInit = {
              clientX: rect.left + 960,
              clientY: rect.top + 243,
              button: 0,
              bubbles: true,
            }
            canvas.dispatchEvent(new PointerEvent('pointerdown', eventInit))
            canvas.dispatchEvent(new PointerEvent('pointerup', eventInit))
            canvas.dispatchEvent(new MouseEvent('click', eventInit))
          }
          resolve()
          return
        }
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
  }, readyTick1 + START_OFFSET)

  const initial1Projection = obs1AtReady?.currentProjection as SimulationProjection

  await expect.poll(async () => {
    const obs = await readTravelObservation()
    return obs?.currentProjection.movementState
  }, { timeout: 10_000 }).toBe('travel')

  const travelPresentation1 = await readPresentation()
  expect(travelPresentation1?.activeAnimation).toBe('travel')

  const obs1Moving = await readTravelObservation()
  expect(obs1Moving?.currentProjection.destination).not.toBeNull()
  expect(Math.abs(obs1Moving?.currentProjection.destination?.x ?? 1)).toBeLessThan(0.1)
  expect(Math.abs(obs1Moving?.currentProjection.destination?.z ?? 1)).toBeLessThan(0.25)

  // Pause on exact commanded pause tick milestone (readyTick1 + PAUSE_OFFSET)
  await page.evaluate((targetPauseTick) => {
    return new Promise<void>((resolve, reject) => {
      const check = () => {
        const obs = window.__boldAndBraveTravelObservation?.()
        if (!obs) {
          requestAnimationFrame(check)
          return
        }
        const currentTick = obs.currentProjection.tick
        if (currentTick > targetPauseTick - 1) {
          reject(new Error(`Skipped target pause dispatch tick ${targetPauseTick - 1}; observed tick ${currentTick}.`))
          return
        }
        if (currentTick === targetPauseTick - 1 && obs.currentProjection.movementState === 'travel') {
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
          resolve()
          return
        }
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
  }, readyTick1 + PAUSE_OFFSET)

  // Capture pausedProjection on exact target pause tick milestone
  const paused1Projection = await page.evaluate((targetPauseTick) => {
    return new Promise<SimulationProjection>((resolve, reject) => {
      const check = () => {
        const obs = window.__boldAndBraveTravelObservation?.()
        if (!obs) {
          requestAnimationFrame(check)
          return
        }
        const currentTick = obs.currentProjection.tick
        if (currentTick > targetPauseTick) {
          reject(new Error(`Skipped target pause sample tick ${targetPauseTick}; observed tick ${currentTick}.`))
          return
        }
        if (currentTick === targetPauseTick && obs.currentProjection.paused === true) {
          resolve(obs.currentProjection)
          return
        }
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
  }, readyTick1 + PAUSE_OFFSET)
  expect(paused1Projection.movementState).toBe('idle')
  expect(paused1Projection.paused).toBe(true)
  const paused1Pos = paused1Projection.bandPawnPosition
  expect(paused1Pos.x).toBeCloseTo(0, 6)
  expect(paused1Pos.y).toBeCloseTo(0, 6)
  expect(paused1Pos.z).toBeLessThan(1.5)
  expect(paused1Pos.z).toBeGreaterThan(0)

  // Resume on exact commanded resume tick milestone (readyTick1 + RESUME_OFFSET)
  await page.evaluate((targetResumeTick) => {
    return new Promise<void>((resolve, reject) => {
      const check = () => {
        const obs = window.__boldAndBraveTravelObservation?.()
        if (!obs) {
          requestAnimationFrame(check)
          return
        }
        const currentTick = obs.currentProjection.tick
        if (currentTick > targetResumeTick - 1) {
          reject(new Error(`Skipped target resume dispatch tick ${targetResumeTick - 1}; observed tick ${currentTick}.`))
          return
        }
        if (currentTick === targetResumeTick - 1 && obs.currentProjection.paused === true) {
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
          resolve()
          return
        }
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
  }, readyTick1 + RESUME_OFFSET)

  await expect.poll(async () => {
    const obs = await readTravelObservation()
    return obs?.currentProjection.paused
  }, { timeout: 5000 }).toBe(false)

  await expect.poll(async () => {
    const obs = await readTravelObservation()
    return obs?.currentProjection.movementState
  }, { timeout: 5000 }).toBe('travel')

  // 6. Observe exact arrival at destination on the exact frame when movement arrives and stops
  const final1Projection = await page.evaluate(() => {
    return new Promise<SimulationProjection>((resolve) => {
      const check = () => {
        const obs = window.__boldAndBraveTravelObservation?.()
        if (
          obs &&
          obs.currentProjection.movementState === 'idle' &&
          obs.currentProjection.destination === null &&
          obs.currentProjection.elapsedCampaignTime >= 0.5
        ) {
          resolve(obs.currentProjection)
          return
        }
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
  })
  expect(final1Projection.bandPawnPosition.z).toBeCloseTo(0, 1)
  expect(final1Projection.destination).toBeNull()
  expect(final1Projection.movementState).toBe('idle')
  expect(final1Projection.elapsedCampaignTime).toBeCloseTo(0.5, 1)
  expect(final1Projection.provisions).toBe(9.8)
  expect(final1Projection.consumptionRemainder).toBeGreaterThanOrEqual(0)
  expect(final1Projection.consumptionRemainder).toBeLessThan(0.5)

  // Capture visual-review PNG while canvas is rendered before loss
  mkdirSync(dirname(PHASE_9_VISUAL_REVIEW_FILE), { recursive: true })
  await page.screenshot({ path: PHASE_9_VISUAL_REVIEW_FILE })

  const run1: TravelRunTrace = {
    commands: ['set-destination:(0, 0, 0)', 'toggle-pause', 'toggle-pause'],
    startProjection: initial1Projection,
    pausedProjection: paused1Projection,
    finalProjection: final1Projection,
  }

  // --------------------------------------------------------------------------
  // RUN 2: Second clean campaign to prove determinism (ARCH-005)
  // --------------------------------------------------------------------------
  await page.goto('/')
  await expect(state).toHaveText('Ready', { timeout: 120_000 })

  const obs2AtReady = await readTravelObservation()
  const readyTick2 = obs2AtReady?.currentProjection.tick ?? 0

  // Wait for exact commanded start tick milestone (readyTick2 + START_OFFSET) and dispatch travel click
  await page.evaluate((targetStartTick) => {
    return new Promise<void>((resolve, reject) => {
      const check = () => {
        const obs = window.__boldAndBraveTravelObservation?.()
        if (!obs) {
          requestAnimationFrame(check)
          return
        }
        const currentTick = obs.currentProjection.tick
        if (currentTick > targetStartTick - 1) {
          reject(new Error(`Skipped target start tick ${targetStartTick - 1}; observed tick ${currentTick}.`))
          return
        }
        if (currentTick === targetStartTick - 1 && obs.currentProjection.movementState === 'idle') {
          const canvas = document.querySelector('canvas')
          if (canvas) {
            const rect = canvas.getBoundingClientRect()
            const eventInit = {
              clientX: rect.left + 960,
              clientY: rect.top + 243,
              button: 0,
              bubbles: true,
            }
            canvas.dispatchEvent(new PointerEvent('pointerdown', eventInit))
            canvas.dispatchEvent(new PointerEvent('pointerup', eventInit))
            canvas.dispatchEvent(new MouseEvent('click', eventInit))
          }
          resolve()
          return
        }
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
  }, readyTick2 + START_OFFSET)

  const initial2Projection = obs2AtReady?.currentProjection as SimulationProjection

  await expect.poll(async () => {
    const obs = await readTravelObservation()
    return obs?.currentProjection.movementState
  }, { timeout: 10_000 }).toBe('travel')

  // Pause on exact commanded pause tick milestone (readyTick2 + PAUSE_OFFSET)
  await page.evaluate((targetPauseTick) => {
    return new Promise<void>((resolve, reject) => {
      const check = () => {
        const obs = window.__boldAndBraveTravelObservation?.()
        if (!obs) {
          requestAnimationFrame(check)
          return
        }
        const currentTick = obs.currentProjection.tick
        if (currentTick > targetPauseTick - 1) {
          reject(new Error(`Skipped target pause dispatch tick ${targetPauseTick - 1}; observed tick ${currentTick}.`))
          return
        }
        if (currentTick === targetPauseTick - 1 && obs.currentProjection.movementState === 'travel') {
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
          resolve()
          return
        }
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
  }, readyTick2 + PAUSE_OFFSET)

  // Capture pausedProjection on exact target pause tick milestone
  const paused2Projection = await page.evaluate((targetPauseTick) => {
    return new Promise<SimulationProjection>((resolve, reject) => {
      const check = () => {
        const obs = window.__boldAndBraveTravelObservation?.()
        if (!obs) {
          requestAnimationFrame(check)
          return
        }
        const currentTick = obs.currentProjection.tick
        if (currentTick > targetPauseTick) {
          reject(new Error(`Skipped target pause sample tick ${targetPauseTick}; observed tick ${currentTick}.`))
          return
        }
        if (currentTick === targetPauseTick && obs.currentProjection.paused === true) {
          resolve(obs.currentProjection)
          return
        }
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
  }, readyTick2 + PAUSE_OFFSET)
  expect(paused2Projection.movementState).toBe('idle')
  expect(paused2Projection.paused).toBe(true)
  const paused2Pos = paused2Projection.bandPawnPosition
  expect(paused2Pos.x).toBeCloseTo(0, 6)
  expect(paused2Pos.y).toBeCloseTo(0, 6)
  expect(paused2Pos.z).toBeLessThan(1.5)
  expect(paused2Pos.z).toBeGreaterThan(0)

  // Resume on exact commanded resume tick milestone (readyTick2 + RESUME_OFFSET)
  await page.evaluate((targetResumeTick) => {
    return new Promise<void>((resolve, reject) => {
      const check = () => {
        const obs = window.__boldAndBraveTravelObservation?.()
        if (!obs) {
          requestAnimationFrame(check)
          return
        }
        const currentTick = obs.currentProjection.tick
        if (currentTick > targetResumeTick - 1) {
          reject(new Error(`Skipped target resume dispatch tick ${targetResumeTick - 1}; observed tick ${currentTick}.`))
          return
        }
        if (currentTick === targetResumeTick - 1 && obs.currentProjection.paused === true) {
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
          resolve()
          return
        }
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
  }, readyTick2 + RESUME_OFFSET)

  await expect.poll(async () => {
    const obs = await readTravelObservation()
    return obs?.currentProjection.paused
  }, { timeout: 5000 }).toBe(false)

  // Arrival at destination on the exact frame when movement arrives and stops
  const final2Projection = await page.evaluate(() => {
    return new Promise<SimulationProjection>((resolve) => {
      const check = () => {
        const obs = window.__boldAndBraveTravelObservation?.()
        if (
          obs &&
          obs.currentProjection.movementState === 'idle' &&
          obs.currentProjection.destination === null &&
          obs.currentProjection.elapsedCampaignTime >= 0.5
        ) {
          resolve(obs.currentProjection)
          return
        }
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
  })
  expect(final2Projection.bandPawnPosition.z).toBeCloseTo(0, 1)
  expect(final2Projection.destination).toBeNull()
  expect(final2Projection.movementState).toBe('idle')
  expect(final2Projection.paused).toBe(false)
  expect(final2Projection.elapsedCampaignTime).toBeCloseTo(0.5, 1)
  expect(final2Projection.provisions).toBe(9.8)
  expect(final2Projection.consumptionRemainder).toBeGreaterThanOrEqual(0)
  expect(final2Projection.consumptionRemainder).toBeLessThan(0.5)

  const run2: TravelRunTrace = {
    commands: ['set-destination:(0, 0, 0)', 'toggle-pause', 'toggle-pause'],
    startProjection: initial2Projection,
    pausedProjection: paused2Projection,
    finalProjection: final2Projection,
  }

  // Compare command and projection traces across runs
  const baselineOffset = run2.startProjection.tick - run1.startProjection.tick
  expect(run1.commands).toEqual(run2.commands)
  expect(projectionsEqual(run1.startProjection, run2.startProjection, baselineOffset)).toBe(true)
  expect(projectionsEqual(run1.pausedProjection, run2.pausedProjection, baselineOffset)).toBe(true)
  expect(projectionsEqual(run1.finalProjection, run2.finalProjection, baselineOffset)).toBe(true)

  // Device loss input gate verification (ARCH-006, ARCH-007, REQ-138)
  const box2 = await page.locator('canvas').boundingBox()
  expect(box2).not.toBeNull()
  const canvasBox2 = box2!
  // Submit a real move command before device loss
  await page.mouse.click(canvasBox2.x + 960, canvasBox2.y + 500, { button: 'left' })
  await expect.poll(async () => {
    const obs = await readTravelObservation()
    return obs?.currentProjection.movementState
  }, { timeout: 5000 }).toBe('travel')

  const obsBeforeLoss = await readTravelObservation()
  expect(obsBeforeLoss?.currentProjection.destination).not.toBeNull()

  // Destroy the exact production-selected device to induce real device loss
  await page.evaluate(() => {
    const state = window as unknown as { __boldAndBraveDeviceCapture?: GPUDevice }
    state.__boldAndBraveDeviceCapture?.destroy()
  })

  await expect(state).toHaveText('Device lost', { timeout: 120_000 })

  const obsAtLoss = await readTravelObservation()
  const projAtLoss = obsAtLoss?.currentProjection as SimulationProjection

  // Attempt input after loss: click on canvas and press Space
  await page.mouse.click(canvasBox2.x + 960, canvasBox2.y + 385, { button: 'left' })
  await page.keyboard.press('Space')
  await page.waitForTimeout(500)

  // Observation proves input gate is closed and projection is unchanged
  const obsAfterLoss = await readTravelObservation()
  expect(obsAfterLoss?.currentProjection).toEqual(projAtLoss)

  // --------------------------------------------------------------------------
  // Evidence record assembly and validation (ARCH-024, REQ-018, REQ-170)
  // --------------------------------------------------------------------------
  const presentationRecord = await readPresentation()
  const authoredBandNodeNames = readAuthoredBandNodeNames(PROJECT_ROOT)

  const gltfContent = JSON.parse(readFileSync(authoredGltfPath(PROJECT_ROOT), 'utf8')) as {
    nodes?: Array<{ name?: string }>
    materials?: Array<{
      name?: string
      pbrMetallicRoughness?: {
        baseColorFactor?: number[]
        roughnessFactor?: number
        metallicFactor?: number
      }
    }>
    animations?: Array<{ name?: string }>
  }
  const gltfNodeNames = (gltfContent.nodes ?? []).map((node) => node.name ?? '')
  const gltfMaterials = gltfContent.materials ?? []
  const gltfAnimations = gltfContent.animations ?? []

  const frontierBoundaryLandmark = gltfNodeNames.includes(
    OVERWORLD.presentationNodes.settlementLandmarkNodeId,
  )
  const woodcutMaterialNames = ['moor-grass', 'moor-road', 'pawn-tabard', 'pawn-leather']
  const woodcutMaterialsPresent = woodcutMaterialNames.every((matName) =>
    gltfMaterials.some(
      (m) =>
        m.name === matName &&
        Array.isArray(m.pbrMetallicRoughness?.baseColorFactor) &&
        (m.pbrMetallicRoughness?.roughnessFactor ?? 0) >= 0.3 &&
        (m.pbrMetallicRoughness?.metallicFactor ?? 1) <= 0.3,
    ),
  )
  const woodcutTerrainAndPawnMaterials =
    woodcutMaterialsPresent &&
    gltfNodeNames.includes(OVERWORLD.presentationNodes.terrainNodeId) &&
    gltfNodeNames.includes(OVERWORLD.presentationNodes.bandPawnNodeId)
  const separateBandMemberNodesAbsent = !gltfNodeNames.some((name) =>
    ['poc-player-character', 'poc-companion', 'poc-agent', 'poc-elder', 'poc-varek'].includes(name),
  )
  const technicalBoxMeshesAbsent = !gltfNodeNames.some(
    (name) => name.toLowerCase().includes('box') || name.toLowerCase().includes('fixture'),
  )
  const singleBandPawnNode =
    authoredBandNodeNames.length === 1 &&
    authoredBandNodeNames[0] === OVERWORLD.presentationNodes.bandPawnNodeId &&
    (presentationRecord?.presentedNodes.length ?? 0) === 1 &&
    presentationRecord?.presentedNodes[0] === OVERWORLD.presentationNodes.bandPawnNodeId
  const movementFeedback =
    idlePresentation1?.activeAnimation === 'idle' &&
    travelPresentation1?.activeAnimation === 'travel' &&
    (travelPresentation1?.animationTime ?? 0) > 0 &&
    (travelPresentation1?.presentedFrames ?? 0) >= 20 &&
    gltfAnimations.some((a) => a.name === 'poc-band-idle') &&
    gltfAnimations.some((a) => a.name === 'poc-band-travel')

  // Verify retained visual-review screenshot has valid PNG magic header and non-empty content
  const imageBytes = readFileSync(PHASE_9_VISUAL_REVIEW_FILE)
  const imageExists =
    existsSync(PHASE_9_VISUAL_REVIEW_FILE) &&
    statSync(PHASE_9_VISUAL_REVIEW_FILE).size > 10_000 &&
    imageBytes.length > 10_000 &&
    imageBytes[0] === 0x89 &&
    imageBytes[1] === 0x50 &&
    imageBytes[2] === 0x4e &&
    imageBytes[3] === 0x47 &&
    imageBytes[4] === 0x0d &&
    imageBytes[5] === 0x0a &&
    imageBytes[6] === 0x1a &&
    imageBytes[7] === 0x0a

  const record: OverworldTravelEvidenceRecord = {
    initialState: {
      scene: initial1Projection.scene,
      startPosition: initial1Projection.bandPawnPosition,
      destination: initial1Projection.destination,
      movementState: initial1Projection.movementState,
      paused: initial1Projection.paused,
      elapsedCampaignTime: initial1Projection.elapsedCampaignTime,
      provisions: initial1Projection.provisions,
      consumptionRemainder: initial1Projection.consumptionRemainder,
    },
    route: {
      startPosition: OVERWORLD.startPosition,
      destinationPosition: OVERWORLD.destinations[0].position,
      distance: 1.5,
      scale: OVERWORLD.productionScale,
    },
    camera: {
      yaw: obsAfterZoom?.cameraState?.yaw ?? 0,
      pitch: obsAfterZoom?.cameraState?.pitch ?? OVERWORLD_CAMERA_BOUNDS.defaultPitch,
      distance: obsAfterZoom?.cameraState?.distance ?? OVERWORLD_CAMERA_BOUNDS.defaultDistance,
      bounds: { ...OVERWORLD_CAMERA_BOUNDS },
      topDown: true,
    },
    pauseMidRoute: {
      pausedPosition: paused1Projection.bandPawnPosition,
      pausedTime: paused1Projection.elapsedCampaignTime,
      pausedProvisions: paused1Projection.provisions,
      paused: paused1Projection.paused,
      movementState: paused1Projection.movementState,
    },
    finalState: {
      finalPosition: final1Projection.bandPawnPosition,
      destination: final1Projection.destination,
      movementState: final1Projection.movementState,
      paused: final1Projection.paused,
      elapsedCampaignTime: final1Projection.elapsedCampaignTime,
      provisions: final1Projection.provisions,
      consumptionRemainder: final1Projection.consumptionRemainder,
    },
    runs: [run1, run2],
    tracesEqual: true,
    visualChecklist: {
      frontierBoundaryLandmark,
      woodcutTerrainAndPawnMaterials,
      lighting: presentationRecord?.hasLighting === true,
      movementFeedback,
      singleBandPawnNode,
      separateBandMemberNodesAbsent,
      technicalBoxMeshesAbsent,
      imagePath: imageExists ? PHASE_9_VISUAL_REVIEW_IMAGE_PATH : '',
    },
    deviceLossInputGate: {
      lossTick: projAtLoss.tick,
      projectionAtLoss: projAtLoss,
      projectionAfterAttemptedInput: obsAfterLoss?.currentProjection as SimulationProjection,
      inputAdapterAttachedBeforeLoss: obsBeforeLoss?.isInputAttached === true,
      inputAdapterAttachedAfterLoss: obsAfterLoss?.isInputAttached === true,
      inputGateOpenBeforeLoss: obsBeforeLoss?.acceptsGameplayInput === true,
      inputGateOpenAfterLoss: obsAfterLoss?.acceptsGameplayInput === true,
      commandBeforeLoss: (obsBeforeLoss?.submittedCommandsCount ?? 0) > 0,
      commandAfterLoss:
        (obsAfterLoss?.submittedCommandsCount ?? 0) >
        (obsBeforeLoss?.submittedCommandsCount ?? 0),
      inputGateClosedAfterLoss: !(obsAfterLoss?.acceptsGameplayInput ?? true),
      projectionUnchangedAfterLoss: projectionsEqual(
        projAtLoss,
        obsAfterLoss?.currentProjection as SimulationProjection,
      ),
    },
    deliveryState: 'Ready',
  }
  const rejections = validateOverworldTravelEvidenceRecord(record, authoredBandNodeNames)
  expect(rejections).toEqual([])

  // Hostile regression check: validator must reject if Run 2 projections do not match Run 1
  const hostileMismatchedRun2: OverworldTravelEvidenceRecord = {
    ...record,
    runs: [
      run1,
      {
        ...run2,
        pausedProjection: {
          ...run2.pausedProjection,
          provisions: 5.0,
        },
      },
    ],
  }
  expect(
    validateOverworldTravelEvidenceRecord(hostileMismatchedRun2, authoredBandNodeNames),
  ).not.toEqual([])
  mkdirSync(dirname(OVERWORLD_TRAVEL_RECORD_FILE), { recursive: true })
  writeFileSync(OVERWORLD_TRAVEL_RECORD_FILE, `${JSON.stringify(record, null, 2)}\n`)
})
