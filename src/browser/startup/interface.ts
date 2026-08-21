/**
 * Public contract of the Browser Delivery State capability gate (ARCH-023,
 * ARCH-024, REQ-014, REQ-134, REQ-135).
 *
 * The gate runs the ordered WebGPU startup checks — secure context,
 * `navigator.gpu` presence, physical adapter, and core-only device request
 * — and returns one typed, readable `Unsupported` result at the first
 * failed check, or the selected adapter, device, and immutable inspection
 * record for the Three.js backend check (PVS-WEB-001, PVS-WEB-002). The
 * interface contains only the browser capability seam the gate reads, so
 * tests can inject a controlled environment that records every operation.
 */

/**
 * The browser capability environment the gate checks (ARCH-023).
 *
 * Production binds these reads to `window.isSecureContext` and
 * `navigator.gpu` (ARCH-024); tests inject a recording environment to
 * prove the exact secure-context, WebGPU-presence, adapter, and device
 * order (PVS-WEB-001).
 */
export interface StartupCapabilityEnvironment {
  /** Whether the document context is secure. */
  readonly isSecureContext: boolean
  /** The WebGPU entry point, or `null` when WebGPU is unavailable. */
  readonly gpu: GPU | null
}

/**
 * The failure code of one failed startup capability check (PVS-WEB-001).
 *
 * Each code corresponds to exactly one governed check: the insecure
 * context and absent-WebGPU checks produce the WebGPU-unavailable
 * surface, a null or software adapter produces the physical-adapter
 * surface, and a failed core device request produces the
 * device-initialization surface.
 */
export type StartupUnsupportedCode =
  | 'secure-context'
  | 'webgpu-unavailable'
  | 'physical-adapter'
  | 'device-initialization'

/**
 * One typed, readable `Unsupported` result at the failed check (REQ-134).
 *
 * A failed gate returns exactly this result and performs no later
 * capability operation, so the surface shows one specific failure and no
 * asset is requested (PVS-WEB-001).
 */
export interface StartupUnsupported {
  /** Discriminates the failure result from the success result. */
  readonly ok: false
  /** The governed failure code of the first failed check (PVS-WEB-001). */
  readonly code: StartupUnsupportedCode
  /** A readable message for the semantic DOM alert (REQ-134). */
  readonly message: string
}

/**
 * The immutable inspection record of the selected adapter (REQ-135,
 * PVS-WEB-002).
 *
 * The record is a plain snapshot of the adapter's reported information and
 * every reported limit, recorded before the device request. It is deeply
 * frozen, so a later backend check or acceptance record cannot observe a
 * mutated adapter report.
 */
export interface StartupInspectionRecord {
  /** The selected adapter information recorded before device use. */
  readonly info: Readonly<Record<string, string | number | boolean>>
  /** Every reported limit recorded before device use. */
  readonly limits: Readonly<Record<string, number>>
}

/**
 * The successful capability-gate result (REQ-135, PVS-WEB-002).
 *
 * The Three.js backend check receives the selected adapter, the one
 * usable device requested with an empty descriptor, and the immutable
 * inspection record recorded before device use. The result also reports
 * the exact facts of the performed checks — the secure-context value read
 * at the first check, the single `high-performance` power-preference hint
 * of the adapter request, and the exact empty core-only device descriptor
 * — so the composed startup record is grounded in what the gate actually
 * did (REQ-014, REQ-135).
 */
export interface StartupSuccess {
  /** Discriminates the success result from the failure result. */
  readonly ok: true
  /** The accepted nonfallback adapter selected by the gate (REQ-014). */
  readonly adapter: GPUAdapter
  /** The one usable core-only device (REQ-135). */
  readonly device: GPUDevice
  /** The immutable inspection record recorded before device use (REQ-135). */
  readonly inspection: StartupInspectionRecord
  /**
   * The secure-context value read at the first check (REQ-134).
   *
   * The value comes from the single `isSecureContext` read the gate
   * performs, so reporting it never repeats a capability operation.
   */
  readonly secureContext: boolean
  /**
   * The exact power-preference hint of the adapter request (REQ-014).
   *
   * `high-performance` is the only power preference the gate ever passes;
   * it is a hint only and never proves a physical adapter.
   */
  readonly powerPreference: 'high-performance'
  /**
   * The exact device descriptor of the core-only request (REQ-135).
   *
   * The gate always passes the empty descriptor, so no optional feature
   * or raised limit is required. The composed startup record derives its
   * emptiness proof from this exact descriptor.
   */
  readonly deviceDescriptor: GPUDeviceDescriptor
}

/** The result of the ordered startup capability gate. */
export type StartupResult = StartupUnsupported | StartupSuccess
