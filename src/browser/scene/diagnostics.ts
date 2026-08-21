/**
 * Structured Scene-load console diagnostics (ARCH-022, ARCH-010,
 * ARCH-023, REQ-137, PVS-WEB-004).
 *
 * The production Scene load writes a structured browser-console record for
 * the Scene load itself, each asset download and decode, the GPU upload,
 * every download-progress update, the completion, and the failure of the
 * load. Every record carries both the authored Scene ID
 * (`poc-overworld`) and the authored asset ID
 * (`poc-overworld-environment`), so the browser console proves which Scene
 * and which asset each event belongs to (REQ-137, PVS-WEB-004).
 *
 * The diagnostics collector doubles as the machine-readable event log of
 * the load journey: it appends every record to an ordered log while
 * publishing each record to the browser console, and the Scene-load
 * handoff builds the machine-readable Scene-load record from the same
 * log. The log accumulates across explicit Retries, so the record carries
 * the exact event order of the whole journey — the first error, the
 * first-error stop, the one explicit retry, and the final success
 * (REQ-134, PVS-WEB-001).
 *
 * The console seam is injectable so the integration tests prove the exact
 * console records without a browser; production binds the real browser
 * console.
 */
import type { SceneLoadStage } from './interface'

/** The kind of one structured Scene-load console record (REQ-137, PVS-WEB-004). */
export type SceneLoadDiagnosticEventType =
  /** The Scene load began. */
  | 'scene-load'
  /** The asset download stage began. */
  | 'download'
  /** One asset-download progress update. */
  | 'progress'
  /** The asset decode stage began. */
  | 'decode'
  /** The GPU-upload stage began. */
  | 'upload'
  /** The Scene-readiness stage began. */
  | 'ready'
  /** The Scene load completed successfully. */
  | 'complete'
  /** The first failed stage stopped the load. */
  | 'failure'

/**
 * One structured Scene-load console record (REQ-137, PVS-WEB-004).
 *
 * Every record carries both the authored Scene and asset identifiers, and
 * the stage-bound fields describe the producing stage. The record is plain
 * data — no Three.js object, runtime object, or DOM node enters it — so it
 * serializes directly to JSON for the machine-readable Scene-load record
 * and for the promised-row acceptance.
 */
export interface SceneLoadDiagnosticEvent {
  /** The kind of this record. */
  readonly event: SceneLoadDiagnosticEventType
  /** The Scene ID from the authored startup manifest. */
  readonly sceneId: string
  /** The asset ID from the authored startup manifest. */
  readonly assetId: string
  /** The Scene-load stage that produced the record, when applicable. */
  readonly stage?: SceneLoadStage
  /** Bytes received from the asset response so far, when applicable. */
  readonly receivedBytes?: number
  /** The declared total asset size, or `null` when none, when applicable. */
  readonly totalBytes?: number | null
  /** The readable failure message (failure records only). */
  readonly message?: string
}

/**
 * The browser-console seam of the Scene-load diagnostics (REQ-137).
 *
 * Production writes every record to the real browser console (`info` for
 * progress and success records, `error` for the failure record); tests
 * inject a recording console to prove the exact published records.
 */
export interface SceneLoadConsole {
  /** Write one progress or success record to the browser console. */
  info(record: SceneLoadDiagnosticEvent): void
  /** Write the failure record to the browser console. */
  error(record: SceneLoadDiagnosticEvent): void
}

/**
 * The production console writer of the Scene-load diagnostics (REQ-137,
 * PVS-WEB-004).
 *
 * Each structured record is passed as one object argument, so the browser
 * console shows the expandable structured record with the Scene and asset
 * identifiers. The promised-row acceptance observes these records from the
 * built product.
 */
export const productionSceneLoadConsole: SceneLoadConsole = {
  info(record: SceneLoadDiagnosticEvent): void {
    console.info(record)
  },
  error(record: SceneLoadDiagnosticEvent): void {
    console.error(record)
  },
}

/**
 * The Scene-load diagnostics collector (REQ-137, PVS-WEB-004).
 *
 * The collector appends every record to the ordered event log of the load
 * journey and publishes each record to the browser console. The Scene-load
 * handoff reads the log to build the machine-readable Scene-load record,
 * so the console records and the record are the same grounded facts.
 */
export interface SceneLoadDiagnostics {
  /** Record one event and write its structured console record. */
  record(event: SceneLoadDiagnosticEvent): void
  /** The ordered event log of the load journey. */
  readonly events: readonly SceneLoadDiagnosticEvent[]
}

/**
 * Create the Scene-load diagnostics collector (REQ-137, PVS-WEB-004).
 *
 * Production binds the real browser console; tests inject a recording
 * console to prove the exact console records. The event log is deeply
 * frozen plain data so the machine-readable record serializes directly to
 * JSON.
 */
export function createSceneLoadDiagnostics(
  consoleSeam: SceneLoadConsole = productionSceneLoadConsole,
): SceneLoadDiagnostics {
  const events: SceneLoadDiagnosticEvent[] = []
  return {
    events,
    record(event: SceneLoadDiagnosticEvent): void {
      const frozen = Object.freeze({ ...event })
      events.push(frozen)
      if (frozen.event === 'failure') {
        consoleSeam.error(frozen)
      } else {
        consoleSeam.info(frozen)
      }
    },
  }
}

/**
 * The readable text of a Scene-load error (REQ-134, PVS-WEB-001).
 *
 * The delivery-state surface shows this text in the semantic `Load failed`
 * alert next to the one Retry action, and the failure diagnostic record
 * carries the same readable message.
 */
export function readableSceneLoadError(error: unknown): string {
  if (error instanceof Error) {
    return error.message === '' ? error.name : error.message
  }
  return String(error)
}
