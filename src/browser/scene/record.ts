/**
 * Machine-readable Scene-load record of the startup Scene load (ARCH-022,
 * ARCH-023, REQ-136, REQ-137, PVS-WEB-003, PVS-WEB-004).
 *
 * After the real load passes, the production handoff publishes one
 * machine-readable record of the performed load: the exact Scene ID and
 * asset ID from the authored manifest, the exact ordered stage names, the
 * initialized WebGPU backend, the authored animation clip names, the exact
 * ordered diagnostic event log of the whole load journey — including the
 * first-error stop and any explicit Retry — and the final `Ready` delivery
 * state. The promised-row acceptance reads this report from the built
 * product and writes its evidence file only after validating it, so a
 * missing stage, a wrong identifier, an automatic retry, an extra asset
 * request, a WebGL backend, or an unloaded animation never produces
 * passing evidence.
 *
 * The record is plain, deeply frozen data — no Three.js object, runtime
 * object, or DOM node enters it — so it serializes directly to JSON.
 */
import type { PresentationRenderer } from '../presentation'
import type { SceneLoadDiagnosticEvent, SceneLoadDiagnostics } from './diagnostics'
import type { SceneLoadStage, SceneLoadSuccess } from './interface'

/** The final delivery state entered only after the real load passes. */
export const SCENE_LOAD_READY_STATE = 'Ready'

/**
 * The machine-readable Scene-load record the product reports after the
 * successful startup Scene load (ARCH-022, REQ-136, REQ-137).
 */
export interface SceneLoadRecord {
  /** The Scene ID from the authored startup manifest. */
  readonly sceneId: string
  /** The asset ID from the authored startup manifest. */
  readonly assetId: string
  /** The exact ordered stage names of the performed load. */
  readonly stages: readonly SceneLoadStage[]
  /** The initialized backend of the renderer that rendered the frame. */
  readonly backend: 'webgpu' | 'webgl'
  /** The authored animation clip names of the loaded asset. */
  readonly animationClips: readonly string[]
  /**
   * The exact ordered diagnostic event log of the load journey (REQ-137,
   * PVS-WEB-004).
   *
   * Every event carries both the Scene and the asset identifiers; a
   * failed attempt appears as a `failure` event followed by the explicit
   * Retry's restart, and no later stage runs after the first error
   * (REQ-134, PVS-WEB-001).
   */
  readonly events: readonly SceneLoadDiagnosticEvent[]
  /**
   * The number of explicit user Retries of the load.
   *
   * The count increments only through the one semantic Retry action; an
   * automatic retry would report zero but extra load events and fail
   * acceptance (REQ-134, PVS-WEB-001).
   */
  readonly retries: number
  /**
   * The first failed stage and readable error, or `null` when the first
   * attempt passed (REQ-134, PVS-WEB-001).
   */
  readonly failure: {
    /** The first failed stage, or `null` when the load failed before any stage. */
    readonly stage: SceneLoadStage | null
    /** The readable error message shown by the `Load failed` surface. */
    readonly message: string
  } | null
  /** The final delivery state after the load passes. */
  readonly deliveryState: 'Ready'
}

/**
 * Build the machine-readable Scene-load record from the loader result and
 * the diagnostic event log (REQ-136, REQ-137).
 *
 * The record is deeply frozen plain data; the backend comes from the same
 * initialized renderer that rendered the frame, and the event log and the
 * first-error and retry facts come from the same diagnostics the load
 * wrote to the browser console.
 */
export function buildSceneLoadRecord(
  renderer: PresentationRenderer,
  result: SceneLoadSuccess,
  diagnostics: SceneLoadDiagnostics,
  retries: number,
): SceneLoadRecord {
  const failureEvent = diagnostics.events.find((event) => event.event === 'failure')
  return Object.freeze({
    sceneId: result.sceneId,
    assetId: result.assetId,
    stages: Object.freeze([...result.stages]),
    backend: renderer.backend.isWebGPUBackend === true ? 'webgpu' : 'webgl',
    animationClips: Object.freeze([...result.animationClips]),
    events: Object.freeze([...diagnostics.events]),
    retries,
    failure:
      failureEvent === undefined
        ? null
        : Object.freeze({
            stage: failureEvent.stage ?? null,
            message: failureEvent.message ?? '',
          }),
    deliveryState: SCENE_LOAD_READY_STATE,
  })
}

/**
 * The recorder seam of the machine-readable Scene-load record (ARCH-024).
 *
 * Production publishes the record on the browser global object for the
 * promised-row acceptance; tests inject a recording recorder to prove the
 * exact published content.
 */
export interface SceneLoadRecorder {
  /** Publish one machine-readable Scene-load record. */
  record(record: SceneLoadRecord): void
}

declare global {
  interface Window {
    /**
     * The machine-readable Scene-load record published by the product
     * after the real startup Scene load passes (ARCH-022, REQ-136).
     *
     * The promised-row acceptance reads this report from the built
     * product and writes its evidence file only after validating it.
     */
    __boldAndBraveSceneLoadRecord?: SceneLoadRecord
  }
}

/**
 * The production recorder publishing the Scene-load record on the browser
 * global object (ARCH-024).
 *
 * Outside a browser document (unit tests run in Node) there is no product
 * surface to report into, so the recorder publishes nothing; the
 * promised-row acceptance always reads the built product in a real
 * browser, where the global object exists.
 */
export const productionSceneLoadRecorder: SceneLoadRecorder = {
  record(record: SceneLoadRecord): void {
    if (typeof window === 'undefined') {
      return
    }
    window.__boldAndBraveSceneLoadRecord = record
  },
}
