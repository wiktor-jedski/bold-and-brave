/**
 * Machine-readable startup record of the ordered Phase 6 startup
 * (ARCH-023, ARCH-024, REQ-011, REQ-014, REQ-134, REQ-135).
 *
 * After every Phase 6 gate passes, the composition root publishes one
 * machine-readable record of the performed startup: the secure-context
 * value read at the first check, the exact gate order, the single
 * `high-performance` power-preference hint, the selected adapter's full
 * reported information and every reported limit inspected before device
 * use, the empty core-only device request, the selected Three.js WebGPU
 * backend, the absence of a WebGL fallback, and the final `Loading Scene`
 * delivery state (PVS-WEB-001, PVS-WEB-002).
 *
 * The production recorder publishes the record on the browser global
 * object so the promised-row acceptance can read it from the built
 * product; the acceptance writes `test-results/support-row/startup.json`
 * only after validating this report. The record is plain, deeply frozen
 * data — no runtime object or DOM node enters it — so it serializes
 * directly to JSON.
 */
import type { PresentationSuccess } from '../presentation'
import type { StartupSuccess } from './interface'

/** The ordered names of the five startup checks (PVS-WEB-001). */
export const STARTUP_GATE_ORDER: readonly string[] = Object.freeze([
  'secure-context',
  'webgpu-presence',
  'physical-adapter',
  'core-device',
  'webgpu-backend',
])

/**
 * The machine-readable startup record the product reports after every
 * Phase 6 gate passes (ARCH-023, REQ-134, REQ-135).
 *
 * `adapter.info` and `adapter.limits` are the full reported information
 * and every reported limit inspected before device use (PVS-WEB-002).
 * `device.descriptor` is the exact empty core-only device request;
 * `device.optionalFeatures` and `device.requiredLimits` derive from that
 * descriptor, so a non-empty request would show here and fail acceptance.
 */
export interface StartupRecord {
  /** The secure-context value read at the first check (REQ-134). */
  readonly secureContext: boolean
  /** The ordered names of the checks the gate performed (PVS-WEB-001). */
  readonly gates: readonly string[]
  /** The one power-preference hint of the adapter request (REQ-014). */
  readonly powerPreference: 'high-performance'
  /** The selected adapter's reported facts (REQ-014, REQ-135). */
  readonly adapter: {
    /** The vendor reported by the browser adapter, e.g. `nvidia`. */
    readonly vendor: string
    /** The browser's own nonfallback signal of the selected adapter. */
    readonly isFallbackAdapter: boolean
    /** The full reported adapter information recorded before device use. */
    readonly info: Readonly<Record<string, string | number | boolean>>
    /** Every reported limit recorded before device use. */
    readonly limits: Readonly<Record<string, number>>
  }
  /** The core-only device request (REQ-135, PVS-WEB-002). */
  readonly device: {
    /**
     * A plain snapshot of the exact device descriptor of the request;
     * the accepted core-only request is the empty descriptor.
     */
    readonly descriptor: Readonly<Record<string, unknown>>
    /** No optional adapter feature is enabled. */
    readonly optionalFeatures: readonly string[]
    /** No limit is raised. */
    readonly requiredLimits: Readonly<Record<string, number>>
  }
  /** The selected Three.js backend and fallback absence (REQ-011). */
  readonly backend: {
    /** The backend the initialized renderer selected. */
    readonly selected: 'webgpu' | 'webgl'
    /** True only when the renderer fell back to a WebGL backend. */
    readonly webglFallback: boolean
  }
  /** The final delivery state entered after every gate passes (REQ-134). */
  readonly deliveryState: 'Loading Scene'
}

/**
 * Build the machine-readable startup record from the two gate successes
 * (ARCH-023, REQ-011, REQ-014, REQ-134, REQ-135).
 *
 * The record is deeply frozen plain data. The adapter vendor and
 * nonfallback signal come from the inspection snapshot taken before
 * device use; the empty core-only device request derives from the exact
 * descriptor the gate passed to `requestDevice`; the backend and its
 * fallback absence come from the initialized renderer the backend gate
 * accepted.
 */
export function buildStartupRecord(
  capability: StartupSuccess,
  backend: PresentationSuccess,
): StartupRecord {
  const isWebGPU = backend.renderer.backend.isWebGPUBackend === true
  const descriptor = capability.deviceDescriptor

  // Snapshot the exact device descriptor into a plain record and derive
  // the optional-feature and raised-limit fields from it, so a non-empty
  // core request would surface here and fail acceptance (REQ-135,
  // PVS-WEB-002).
  const descriptorSnapshot: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(descriptor)) {
    descriptorSnapshot[key] = value
  }

  // Snapshot the raised limits into a fresh plain record: the descriptor's
  // `requiredLimits` index signature can carry `undefined` at the type
  // level, while the machine-readable record promises concrete numbers.
  const requiredLimits: Record<string, number> = {}
  for (const [key, value] of Object.entries(descriptor.requiredLimits ?? {})) {
    if (value !== undefined) {
      requiredLimits[key] = value
    }
  }

  return Object.freeze({
    secureContext: capability.secureContext,
    gates: STARTUP_GATE_ORDER,
    powerPreference: capability.powerPreference,
    adapter: Object.freeze({
      vendor: String(capability.inspection.info.vendor ?? ''),
      isFallbackAdapter: capability.inspection.info.isFallbackAdapter === false ? false : true,
      info: capability.inspection.info,
      limits: capability.inspection.limits,
    }),
    device: Object.freeze({
      // The accepted core-only request always passes the exact empty
      // descriptor (REQ-135); the snapshot and the derived fields below
      // carry the grounded proof that no optional feature or raised limit
      // was requested.
      descriptor: Object.freeze(descriptorSnapshot),
      optionalFeatures: Object.freeze([...(descriptor.requiredFeatures ?? [])]),
      requiredLimits: Object.freeze(requiredLimits),
    }),
    backend: Object.freeze({
      selected: isWebGPU ? 'webgpu' : 'webgl',
      webglFallback: !isWebGPU,
    }),
    deliveryState: 'Loading Scene',
  })
}

/**
 * The recorder seam of the machine-readable startup record (ARCH-024).
 *
 * Production publishes the record on the browser global object for the
 * promised-row acceptance; tests inject a recording recorder to prove the
 * exact published content and that a failed startup publishes nothing.
 */
export interface StartupRecorder {
  /** Publish one machine-readable startup record. */
  record(record: StartupRecord): void
}

declare global {
  interface Window {
    /**
     * The machine-readable startup record published by the product after
     * every Phase 6 gate passes (ARCH-023, REQ-134).
     *
     * The promised-row acceptance reads this report from the built
     * product and writes `test-results/support-row/startup.json` only
     * after validating it.
     */
    __boldAndBraveStartupRecord?: StartupRecord
  }
}

/**
 * The production recorder publishing the startup record on the browser
 * global object (ARCH-024).
 *
 * Outside a browser document (unit tests run in Node) there is no product
 * surface to report into, so the recorder publishes nothing; the
 * promised-row acceptance always reads the built product in a real
 * browser, where the global object exists.
 */
export const productionStartupRecorder: StartupRecorder = {
  record(record: StartupRecord): void {
    if (typeof window === 'undefined') {
      return
    }
    window.__boldAndBraveStartupRecord = record
  },
}
