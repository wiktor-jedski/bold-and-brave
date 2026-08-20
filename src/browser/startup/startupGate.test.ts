import { describe, expect, it } from 'vitest'
import { runStartupGate } from './index'
import type {
  StartupCapabilityEnvironment,
  StartupResult,
  StartupUnsupported,
} from './index'

/**
 * One recorded capability operation of the gate, in the order it ran.
 * The test proves the exact secure-context, WebGPU-presence, adapter,
 * and device order (REQ-134, PVS-WEB-001) by comparing this log with the
 * expected sequence, and proves that a failed check performs no later
 * operation.
 */
type Operation =
  | 'secure-context'
  | 'navigator.gpu'
  | 'requestAdapter'
  | 'adapter.info'
  | 'adapter.limits'
  | 'requestDevice'

/** Calls the recording fakes capture for exact-argument assertions. */
interface CapturedCalls {
  /** The options object passed to `requestAdapter`, if the call happened. */
  adapterOptions?: GPURequestAdapterOptions
  /** Every descriptor passed to `requestDevice`, in call order. */
  deviceDescriptors: GPUDeviceDescriptor[]
}

/** Build a fake `GPU` whose every call is recorded. */
function createFakeGpu(
  operations: Operation[],
  adapter: GPUAdapter | null,
  captured: CapturedCalls,
): GPU {
  return {
    requestAdapter(options: GPURequestAdapterOptions | undefined) {
      operations.push('requestAdapter')
      captured.adapterOptions = options
      return Promise.resolve(adapter)
    },
  } as unknown as GPU
}

/** Build a fake adapter whose every info, limits, and device read is recorded. */
function createFakeAdapter(
  operations: Operation[],
  info: Record<string, string | number | boolean>,
  limits: Record<string, number>,
  deviceResult: Promise<GPUDevice>,
  captured: CapturedCalls,
): GPUAdapter {
  return {
    get info(): GPUAdapterInfo {
      operations.push('adapter.info')
      return info as unknown as GPUAdapterInfo
    },
    get limits(): GPUSupportedLimits {
      operations.push('adapter.limits')
      return limits as unknown as GPUSupportedLimits
    },
    requestDevice(descriptor: GPUDeviceDescriptor | undefined) {
      operations.push('requestDevice')
      captured.deviceDescriptors.push(descriptor ?? {})
      return deviceResult
    },
  } as unknown as GPUAdapter
}

/** Build the capability environment whose reads are recorded. */
function createEnvironment(
  operations: Operation[],
  isSecureContext: boolean,
  gpu: GPU | null,
): StartupCapabilityEnvironment {
  return {
    get isSecureContext(): boolean {
      operations.push('secure-context')
      return isSecureContext
    },
    get gpu(): GPU | null {
      operations.push('navigator.gpu')
      return gpu
    },
  }
}

/**
 * Build the one reported adapter-info fixture of the success and device
 * cases. `isFallbackAdapter` is omitted when undefined so the test can
 * model an adapter whose fallback information is absent.
 */
function createAdapterInfo(isFallbackAdapter?: boolean): Record<string, string | number | boolean> {
  const info: Record<string, string | number | boolean> = {
    vendor: 'AMD',
    architecture: 'rdna3',
    device: 'Navi 31',
    description: 'AMD Radeon RX 7800 XT',
    subgroupMinSize: 32,
    subgroupMaxSize: 64,
  }
  if (isFallbackAdapter !== undefined) {
    info.isFallbackAdapter = isFallbackAdapter
  }
  return info
}

/** The one reported adapter-info fixture of the success and device cases. */
const ADAPTER_INFO = createAdapterInfo(false)

/** The one reported limits fixture of the success and device cases. */
const ADAPTER_LIMITS = {
  maxTextureDimension2D: 16384,
  maxBufferSize: 1073741824,
  maxBindGroups: 4,
}

/** Assert the result is the typed, readable `Unsupported` failure (REQ-134). */
function expectUnsupported(result: StartupResult): StartupUnsupported {
  expect(result.ok).toBe(false)
  if (result.ok) {
    throw new Error('expected an Unsupported startup result')
  }
  return result
}

describe('Browser Delivery State capability gate (ARCH-023, REQ-014, REQ-134, REQ-135)', () => {
  it('accepts a qualifying nonfallback adapter and proves the exact secure-context, WebGPU-presence, adapter, and device order', async () => {
    const operations: Operation[] = []
    const captured: CapturedCalls = { deviceDescriptors: [] }
    const fakeDevice = {} as unknown as GPUDevice
    const fakeAdapter = createFakeAdapter(
      operations,
      ADAPTER_INFO,
      ADAPTER_LIMITS,
      Promise.resolve(fakeDevice),
      captured,
    )
    const gpu = createFakeGpu(operations, fakeAdapter, captured)
    const environment = createEnvironment(operations, true, gpu)

    const result = await runStartupGate(environment)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected a successful startup result')
    }
    expect(result.adapter).toBe(fakeAdapter)
    expect(result.device).toBe(fakeDevice)

    // The adapter is accepted even though its vendor is not NVIDIA and its
    // description carries no high-performance marker: the power preference
    // is a hint only and no product-side vendor allowlist is consulted
    // (REQ-014, PVS-WEB-002).
    expect(result.inspection.info).toEqual(ADAPTER_INFO)
    expect(result.inspection.limits).toEqual(ADAPTER_LIMITS)
    expect(Object.isFrozen(result.inspection)).toBe(true)
    expect(Object.isFrozen(result.inspection.info)).toBe(true)
    expect(Object.isFrozen(result.inspection.limits)).toBe(true)

    // `requestAdapter` receives only the `high-performance` power-preference
    // hint — no fallback flag, compatibility mode, or other option
    // (REQ-014).
    expect(captured.adapterOptions).toEqual({ powerPreference: 'high-performance' })

    // The device request passes an empty descriptor, so no optional feature
    // or raised limit is required (REQ-135, PVS-WEB-002).
    expect(captured.deviceDescriptors).toEqual([{}])

    // Every capability operation ran in the governed order, and the
    // adapter information and every reported limit were read before the
    // device request (PVS-WEB-001, PVS-WEB-002).
    expect(operations).toEqual([
      'secure-context',
      'navigator.gpu',
      'requestAdapter',
      'adapter.info',
      'adapter.limits',
      'requestDevice',
    ])
  })

  it('returns the secure-context Unsupported result and performs no later operation for an insecure context', async () => {
    const operations: Operation[] = []
    const captured: CapturedCalls = { deviceDescriptors: [] }
    const fakeAdapter = createFakeAdapter(
      operations,
      ADAPTER_INFO,
      ADAPTER_LIMITS,
      Promise.resolve({} as unknown as GPUDevice),
      captured,
    )
    const gpu = createFakeGpu(operations, fakeAdapter, captured)
    const environment = createEnvironment(operations, false, gpu)

    const failure = expectUnsupported(await runStartupGate(environment))

    expect(failure.code).toBe('secure-context')
    expect(failure.message).toBe('Startup requires a secure context.')
    expect(operations).toEqual(['secure-context'])
    expect(captured.adapterOptions).toBeUndefined()
    expect(captured.deviceDescriptors).toEqual([])
  })

  it('returns the WebGPU-unavailable Unsupported result and performs no later operation when navigator.gpu is absent', async () => {
    const operations: Operation[] = []
    const captured: CapturedCalls = { deviceDescriptors: [] }
    const environment = createEnvironment(operations, true, null)

    const failure = expectUnsupported(await runStartupGate(environment))

    expect(failure.code).toBe('webgpu-unavailable')
    expect(failure.message).toBe('WebGPU is not available in this browser.')
    expect(operations).toEqual(['secure-context', 'navigator.gpu'])
    expect(captured.adapterOptions).toBeUndefined()
    expect(captured.deviceDescriptors).toEqual([])
  })

  it('returns the physical-adapter Unsupported result and performs no later operation when requestAdapter resolves null', async () => {
    const operations: Operation[] = []
    const captured: CapturedCalls = { deviceDescriptors: [] }
    const gpu = createFakeGpu(operations, null, captured)
    const environment = createEnvironment(operations, true, gpu)

    const failure = expectUnsupported(await runStartupGate(environment))

    expect(failure.code).toBe('physical-adapter')
    expect(failure.message).toBe('No WebGPU adapter was returned.')
    expect(operations).toEqual(['secure-context', 'navigator.gpu', 'requestAdapter'])
    expect(captured.deviceDescriptors).toEqual([])
  })

  it('rejects a software adapter whose isFallbackAdapter value is exactly true', async () => {
    const operations: Operation[] = []
    const captured: CapturedCalls = { deviceDescriptors: [] }
    const fakeAdapter = createFakeAdapter(
      operations,
      createAdapterInfo(true),
      ADAPTER_LIMITS,
      Promise.resolve({} as unknown as GPUDevice),
      captured,
    )
    const gpu = createFakeGpu(operations, fakeAdapter, captured)
    const environment = createEnvironment(operations, true, gpu)

    const failure = expectUnsupported(await runStartupGate(environment))

    expect(failure.code).toBe('physical-adapter')
    expect(failure.message).toBe(
      'The WebGPU adapter is a software fallback; a physical adapter is required.',
    )
    // The gate stops at the fallback signal: no limits are read and no
    // device is requested (PVS-WEB-001).
    expect(operations).toEqual([
      'secure-context',
      'navigator.gpu',
      'requestAdapter',
      'adapter.info',
    ])
    expect(captured.deviceDescriptors).toEqual([])
  })

  it('rejects an adapter whose fallback information is absent', async () => {
    const operations: Operation[] = []
    const captured: CapturedCalls = { deviceDescriptors: [] }
    const fakeAdapter = createFakeAdapter(
      operations,
      createAdapterInfo(),
      ADAPTER_LIMITS,
      Promise.resolve({} as unknown as GPUDevice),
      captured,
    )
    const gpu = createFakeGpu(operations, fakeAdapter, captured)
    const environment = createEnvironment(operations, true, gpu)

    const failure = expectUnsupported(await runStartupGate(environment))

    expect(failure.code).toBe('physical-adapter')
    expect(failure.message).toBe(
      'The WebGPU adapter is a software fallback; a physical adapter is required.',
    )
    expect(operations).toEqual([
      'secure-context',
      'navigator.gpu',
      'requestAdapter',
      'adapter.info',
    ])
    expect(captured.deviceDescriptors).toEqual([])
  })

  it('returns the device-initialization Unsupported result and performs no later operation when the device request fails', async () => {
    const operations: Operation[] = []
    const captured: CapturedCalls = { deviceDescriptors: [] }
    const fakeAdapter = createFakeAdapter(
      operations,
      ADAPTER_INFO,
      ADAPTER_LIMITS,
      Promise.reject(new Error('device request failed')),
      captured,
    )
    const gpu = createFakeGpu(operations, fakeAdapter, captured)
    const environment = createEnvironment(operations, true, gpu)

    const failure = expectUnsupported(await runStartupGate(environment))

    expect(failure.code).toBe('device-initialization')
    expect(failure.message).toBe('The WebGPU device could not be initialized.')
    expect(operations).toEqual([
      'secure-context',
      'navigator.gpu',
      'requestAdapter',
      'adapter.info',
      'adapter.limits',
      'requestDevice',
    ])
    expect(captured.deviceDescriptors).toEqual([{}])
  })
})
