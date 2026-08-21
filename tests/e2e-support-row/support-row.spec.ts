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
 * GitHub-hosted pull-request CI runs the general `playwright.config.ts`
 * checks and never this spec.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { SUPPORT_PROMISE } from '../../src/browser/support'
import type { StartupRecord } from '../../src/browser/startup'
import type { SceneLoadDiagnosticEvent, SceneLoadRecord } from '../../src/browser/scene'
import type { FramePresentationRecord } from '../../src/browser/presentation'
import {
  ENVIRONMENT_RECORD_PATH,
  FRAME_PRESENTATION_RECORD_PATH,
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
  validateRetriedSceneLoadEvidenceRecord,
  validateSceneLoadEvidenceRecord,
  validateSceneLoadEventLog,
} from '../../scripts/scene-load-record'
import {
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
