/**
 * Shared device-loss evidence record and validation (ARCH-002, ARCH-006,
 * ARCH-008, ARCH-009, ARCH-010, ARCH-023, ARCH-024, REQ-134, REQ-138,
 * PVS-WEB-001, PVS-WEB-005).
 *
 * The local promised-row acceptance induces loss of the exact device the
 * built product selected: a Playwright initialization wrapper captures the
 * device returned by the production `GPUAdapter.requestDevice` call, the
 * spec destroys that exact device after `Ready` and an observable
 * Simulation-tick advance, and the real `device.lost` promise path enters
 * the terminal `Device lost` state. The spec samples the read-only
 * device-loss observation the product publishes — the complete projection
 * at loss and the current pre-Reload projection — proves that every
 * sampled complete projection equals the projection at loss, that the
 * frame-presentation record stops, and that exactly one Reload action is
 * visible, and then drives one Reload that requests a new adapter and
 * device, repeats the Three.js backend gate and Scene load, and reaches
 * `Ready`.
 *
 * This module owns the machine-readable evidence shape and the validation
 * that gates the `test-results/support-row/device-loss.json` record: the
 * exact loss tick, equal pre-Reload samples, stopped presentation, visible
 * Reload, one adapter and device request per document (no in-process
 * retry), the repeated gate order, and the final `Ready` state. The vitest
 * mismatch tests prove that every wrong value is rejected before it can
 * produce passing evidence; the promised-row spec writes the evidence file
 * only after this validator accepts the real record.
 */
import type { SimulationProjection } from '../src/core/simulation'

/** The visible terminal delivery state of the loss (REQ-134, PVS-WEB-001). */
export const REQUIRED_DEVICE_LOSS_STATE = 'Device lost'

/** The final delivery state after the reload journey (REQ-134, PVS-WEB-001). */
export const REQUIRED_FINAL_STATE = 'Ready'

/**
 * The ordered startup-gate observations the reload journey must repeat
 * (REQ-134, PVS-WEB-001).
 *
 * The acceptance observes the second ordered adapter request and device
 * request through the Playwright initialization wrapper, the repeated
 * Three.js WebGPU-backend success through the startup record the product
 * publishes after every gate passes, the repeated Scene load through the
 * Scene-load record, and the final `Ready` through the delivery surface.
 */
export const REQUIRED_GATE_ORDER: readonly string[] = Object.freeze([
  'adapter-request',
  'device-request',
  'webgpu-backend',
  'scene-load',
  'ready',
])

/**
 * The ordered capability-gate names the reload journey's startup record
 * must report (REQ-134, PVS-WEB-001).
 */
export const REQUIRED_STARTUP_GATES: readonly string[] = Object.freeze([
  'secure-context',
  'webgpu-presence',
  'physical-adapter',
  'core-device',
  'webgpu-backend',
])

/**
 * The machine-readable Phase 8 device-loss evidence record (ARCH-024,
 * REQ-138, PVS-WEB-005).
 *
 * The record is plain, deeply frozen data: the exact loss tick, the
 * complete projection at loss, every sampled complete projection before
 * Reload, the frame-presentation stop facts, the visible terminal state,
 * the one Reload action, the adapter and device request counts per
 * document, the repeated gate order, and the final `Ready` state. It
 * carries no device reference and no state-changing command.
 */
export interface DeviceLossEvidenceRecord {
  /** The exact Simulation tick at the moment of loss (REQ-138). */
  readonly lossTick: number
  /** The complete immutable projection at the moment of loss. */
  readonly lossProjection: SimulationProjection
  /**
   * Every sampled complete projection before Reload.
   *
   * Each sample must equal the projection at loss, so a changed tick or
   * projection after the loss fails acceptance (PVS-WEB-005).
   */
  readonly samples: readonly SimulationProjection[]
  /** The frame-presentation stop facts of the frame loop (ARCH-008). */
  readonly presentation: {
    /** The presented-frame count read at the loss. */
    readonly presentedFramesAtLoss: number
    /** The presented-frame count read after the loss observation period. */
    readonly presentedFramesAfter: number
  }
  /** The visible terminal delivery state (REQ-134, PVS-WEB-001). */
  readonly visibleState: 'Device lost'
  /** The visible Reload actions of the terminal state: exactly one. */
  readonly reloadActions: number
  /**
   * The adapter requests per document.
   *
   * The first journey and the reload journey each request exactly one
   * adapter; an in-process retry would add a second request to one
   * document and fail acceptance.
   */
  readonly adapterRequests: {
    /** Adapter requests in the document before Reload. */
    readonly beforeReload: number
    /** Adapter requests in the reloaded document. */
    readonly afterReload: number
  }
  /**
   * The device requests per document.
   *
   * The first journey and the reload journey each request exactly one
   * device; an in-process retry would add a second request to one
   * document and fail acceptance.
   */
  readonly deviceRequests: {
    /** Device requests in the document before Reload. */
    readonly beforeReload: number
    /** Device requests in the reloaded document. */
    readonly afterReload: number
  }
  /** The ordered startup-gate observations of the reload journey. */
  readonly gateOrder: readonly string[]
  /** The ordered capability-gate names of the reload journey's startup record. */
  readonly startupGates: readonly string[]
  /** The final delivery state after the reload journey (REQ-134). */
  readonly finalState: 'Ready'
}

/**
 * Whether two complete projections are equal, value by value.
 *
 * The projections are plain, deeply frozen data (ARCH-003), so a structural
 * comparison of their enumerable entries is exact.
 */
export function projectionsEqual(left: SimulationProjection, right: SimulationProjection): boolean {
  return deepEqual(left, right)
}

/** Structural equality of plain JSON-style values. */
function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }
  if (
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    left === null ||
    right === null
  ) {
    return false
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  if (leftKeys.length !== rightKeys.length) {
    return false
  }
  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      deepEqual(leftRecord[key], rightRecord[key]),
  )
}

/**
 * Validate one device-loss evidence record (REQ-138, PVS-WEB-005).
 *
 * Returns the list of rejection reasons; an empty list means the record
 * proves the exact loss tick, the equal pre-Reload samples, the stopped
 * frame presentation, the visible `Device lost` state with exactly one
 * Reload action, one adapter and device request per document (no in-process
 * retry), the repeated ordered gate journey, and the final `Ready` state.
 * A changed tick or projection, a post-loss frame, an in-process retry, a
 * missing or reordered startup gate, or a missing final `Ready` is
 * rejected here, so the promised-row command leaves no passing
 * `device-loss.json` for such a journey.
 */
export function validateDeviceLossEvidenceRecord(
  record: DeviceLossEvidenceRecord,
): string[] {
  const rejections: string[] = []

  // The exact loss tick: the recorded tick must be the tick of the complete
  // projection at loss (REQ-138, PVS-WEB-005).
  if (record.lossTick !== record.lossProjection.tick) {
    rejections.push(
      `Loss tick ${record.lossTick} does not match the tick ${record.lossProjection.tick} of the projection at loss.`,
    )
  }

  // Equal pre-Reload samples: every sampled complete projection must equal
  // the projection at loss — a changed tick or projection after the loss
  // means a hidden tick ran while no frame could be shown (PVS-WEB-005).
  if (record.samples.length === 0) {
    rejections.push('No pre-Reload projection sample was recorded.')
  }
  record.samples.forEach((sample, index) => {
    if (!projectionsEqual(sample, record.lossProjection)) {
      rejections.push(
        `Pre-Reload sample ${index} differs from the projection at loss: a changed tick or projection followed the loss.`,
      )
    }
  })

  // Stopped presentation: no frame may be presented after the loss
  // (ARCH-008, REQ-138, PVS-WEB-005).
  if (record.presentation.presentedFramesAfter !== record.presentation.presentedFramesAtLoss) {
    rejections.push(
      `A post-loss frame was presented: ${record.presentation.presentedFramesAtLoss} frames at loss, ${record.presentation.presentedFramesAfter} after.`,
    )
  }

  // The visible terminal state and the one Reload action (REQ-134,
  // PVS-WEB-001).
  if (record.visibleState !== REQUIRED_DEVICE_LOSS_STATE) {
    rejections.push(`Visible state ${record.visibleState} is not ${REQUIRED_DEVICE_LOSS_STATE}.`)
  }
  if (record.reloadActions !== 1) {
    rejections.push(
      `The terminal state exposed ${record.reloadActions} Reload action(s); exactly one is required.`,
    )
  }

  // One adapter and device request per document: an in-process retry would
  // request a second adapter or device in one document (REQ-134,
  // PVS-WEB-001).
  if (record.adapterRequests.beforeReload !== 1 || record.adapterRequests.afterReload !== 1) {
    rejections.push(
      `Adapter requests ${record.adapterRequests.beforeReload} before and ${record.adapterRequests.afterReload} after Reload; exactly one per document is required.`,
    )
  }
  if (record.deviceRequests.beforeReload !== 1 || record.deviceRequests.afterReload !== 1) {
    rejections.push(
      `Device requests ${record.deviceRequests.beforeReload} before and ${record.deviceRequests.afterReload} after Reload; exactly one per document is required.`,
    )
  }

  // The repeated gate order: the reload journey must repeat the ordered
  // adapter request, device request, Three.js WebGPU-backend success,
  // Scene load, and final `Ready` (REQ-134, PVS-WEB-001).
  if (
    record.gateOrder.length !== REQUIRED_GATE_ORDER.length ||
    record.gateOrder.some((name, index) => name !== REQUIRED_GATE_ORDER[index])
  ) {
    rejections.push(
      `Gate order ${record.gateOrder.join(', ')} does not repeat ${REQUIRED_GATE_ORDER.join(', ')}.`,
    )
  }
  if (
    record.startupGates.length !== REQUIRED_STARTUP_GATES.length ||
    record.startupGates.some((name, index) => name !== REQUIRED_STARTUP_GATES[index])
  ) {
    rejections.push(
      `Startup gates ${record.startupGates.join(', ')} do not repeat ${REQUIRED_STARTUP_GATES.join(', ')}.`,
    )
  }

  // The final `Ready` state of the reload journey (REQ-134, PVS-WEB-001).
  if (record.finalState !== REQUIRED_FINAL_STATE) {
    rejections.push(`Final state ${record.finalState} is not ${REQUIRED_FINAL_STATE}.`)
  }

  return rejections
}
