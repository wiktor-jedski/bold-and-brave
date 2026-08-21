/**
 * Implementation of the ordered Browser Delivery State capability gate
 * (ARCH-023, ARCH-024, REQ-014, REQ-134, REQ-135).
 *
 * The gate checks, in order:
 *   1. the secure context (PVS-WEB-001);
 *   2. the presence of `navigator.gpu` (PVS-WEB-001);
 *   3. a physical WebGPU adapter, requested with `high-performance` as the
 *      only power preference hint and accepted only when the browser's own
 *      `adapter.info.isFallbackAdapter` value is exactly `false`
 *      (REQ-014, PVS-WEB-001);
 *   4. one usable device, requested with an empty descriptor so no
 *      optional feature or raised limit is required (REQ-135, PVS-WEB-002).
 *
 * The `high-performance` power preference is a hint only: it is never
 * read back and never proves a physical adapter. No product-side vendor
 * allowlist is consulted; the browser's own nonfallback signal is the only
 * proof of a physical adapter (REQ-014, PVS-WEB-002).
 *
 * The gate records the selected adapter information and every reported
 * limit before the device request (REQ-135, PVS-WEB-002). A failed check
 * returns one typed, readable `Unsupported` result and performs no later
 * capability operation, so a failure stops before asset loading
 * (REQ-134, PVS-WEB-001).
 */
import type {
  StartupCapabilityEnvironment,
  StartupInspectionRecord,
  StartupResult,
  StartupUnsupported,
  StartupUnsupportedCode,
} from './interface'

/**
 * The production capability environment bound to the browser globals
 * (ARCH-024). The reads are lazy getters so importing the module never
 * touches `window` or `navigator`; tests inject a recording environment
 * instead.
 */
const productionCapabilityEnvironment: StartupCapabilityEnvironment = {
  get isSecureContext(): boolean {
    return window.isSecureContext
  },
  get gpu(): GPU | null {
    // `navigator.gpu` is typed as present, but a browser without WebGPU
    // leaves it undefined (PVS-WEB-001).
    return (navigator.gpu as GPU | undefined) ?? null
  },
}

/** The one power-preference hint of the adapter request (REQ-014). */
const POWER_PREFERENCE = 'high-performance' as const

/**
 * The exact core-only device descriptor of the device request (REQ-135).
 *
 * The gate always requests the device with this empty descriptor, so no
 * optional feature or raised limit is required (PVS-WEB-002). Recording
 * the exact object lets the composed startup record prove the emptiness
 * of the request.
 */
const CORE_DEVICE_DESCRIPTOR: GPUDeviceDescriptor = {}

/** Build one typed, readable `Unsupported` result (REQ-134, PVS-WEB-001). */
function unsupported(code: StartupUnsupportedCode, message: string): StartupUnsupported {
  return Object.freeze({ ok: false, code, message })
}

/**
 * Snapshot the adapter's reported information and every reported limit
 * into one deeply frozen plain record (REQ-135, PVS-WEB-002).
 *
 * `for...in` captures every enumerable reported value — in Chromium the
 * adapter report attributes are enumerable accessors on the prototype, so
 * `Object.keys` alone would miss them — and the plain record keeps the
 * snapshot immutable and machine-readable.
 */
function snapshotInspection(
  info: GPUAdapterInfo,
  limits: GPUSupportedLimits,
): StartupInspectionRecord {
  const recordedInfo: Record<string, string | number | boolean> = {}
  for (const key in info) {
    recordedInfo[key] = info[key as keyof GPUAdapterInfo] as unknown as string | number | boolean
  }
  const recordedLimits: Record<string, number> = {}
  for (const key in limits) {
    recordedLimits[key] = limits[key as keyof GPUSupportedLimits] as unknown as number
  }
  return Object.freeze({
    info: Object.freeze(recordedInfo),
    limits: Object.freeze(recordedLimits),
  })
}

/**
 * Run the ordered startup capability gate (ARCH-023, REQ-014, REQ-134,
 * REQ-135).
 *
 * Returns one typed, readable `Unsupported` result at the first failed
 * check, or the selected adapter, device, and immutable inspection record
 * for the Three.js backend check. Production uses the `window`/`navigator`
 * environment; tests inject a recording environment.
 */
export async function runStartupGate(
  environment: StartupCapabilityEnvironment = productionCapabilityEnvironment,
): Promise<StartupResult> {
  // 1. Secure context (REQ-134, PVS-WEB-001). Read the value once and keep
  //    it for the success result, so reporting the secure context never
  //    repeats a capability operation.
  const isSecureContext = environment.isSecureContext
  if (!isSecureContext) {
    return unsupported('secure-context', 'Startup requires a secure context.')
  }

  // 2. WebGPU presence (REQ-134, PVS-WEB-001). Read the entry point once
  //    and use the same reference for the presence check and the adapter
  //    request, so the capability environment reports exactly one
  //    WebGPU-presence operation.
  const gpu = environment.gpu
  if (gpu === null) {
    return unsupported('webgpu-unavailable', 'WebGPU is not available in this browser.')
  }

  // 3. Physical adapter (REQ-014, REQ-134, PVS-WEB-001). The
  //    `high-performance` power preference is a hint only and never proves
  //    a physical adapter; the browser's own nonfallback signal does
  //    (REQ-014, PVS-WEB-002). No product-side vendor allowlist exists.
  const adapter = await gpu.requestAdapter({ powerPreference: POWER_PREFERENCE })
  if (adapter === null) {
    return unsupported('physical-adapter', 'No WebGPU adapter was returned.')
  }

  const info = adapter.info
  if (info.isFallbackAdapter !== false) {
    return unsupported(
      'physical-adapter',
      'The WebGPU adapter is a software fallback; a physical adapter is required.',
    )
  }

  // Record the selected adapter information and every reported limit
  // before device use (REQ-135, PVS-WEB-002).
  const limits = adapter.limits
  const inspection = snapshotInspection(info, limits)

  // 4. One usable core-only device with an empty descriptor: no optional
  //    feature or raised limit is required (REQ-135, PVS-WEB-002).
  let device: GPUDevice
  try {
    device = await adapter.requestDevice(CORE_DEVICE_DESCRIPTOR)
  } catch {
    return unsupported('device-initialization', 'The WebGPU device could not be initialized.')
  }

  return Object.freeze({
    ok: true,
    adapter,
    device,
    inspection,
    secureContext: isSecureContext,
    powerPreference: POWER_PREFERENCE,
    deviceDescriptor: CORE_DEVICE_DESCRIPTOR,
  })
}
