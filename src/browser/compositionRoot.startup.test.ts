import { describe, expect, it } from 'vitest'
import { createSimulation } from '../core/simulation'
import { createBrowserApplication, runApplicationStartup } from './compositionRoot'
import type { DeliveryStateSurface, SceneLoadingHandoff } from './startup/surface'
import type { StartupCapabilityEnvironment } from './startup'
import type { PresentationRenderer, WebGPURendererFactory } from './presentation'
import type { FrameCallback, FrameScheduler } from './runtime'

/**
 * One recorded capability operation of the ordered startup gate, in the
 * order it ran. The integration test proves the full ordered success trace
 * and each first-failing-operation stop by comparing this log with the
 * expected sequence (REQ-134, PVS-WEB-001).
 */
type CapabilityOperation =
  | 'secure-context'
  | 'navigator.gpu'
  | 'requestAdapter'
  | 'adapter.info'
  | 'adapter.limits'
  | 'requestDevice'

/** One recorded renderer operation of the Three.js WebGPU backend gate. */
type BackendOperation = 'factory.create' | 'renderer.init' | 'renderer.backend' | 'renderer.dispose'

/** Calls the recording fakes capture for exact-argument assertions. */
interface CapturedCalls {
  /** Every descriptor passed to `requestDevice`, in call order. */
  readonly deviceDescriptors: GPUDeviceDescriptor[]
  /** Every device passed to the renderer factory, in call order. */
  readonly factoryDevices: GPUDevice[]
}

/** The one reported adapter-info fixture of the success and device cases. */
const ADAPTER_INFO = {
  vendor: 'AMD',
  architecture: 'rdna3',
  device: 'Navi 31',
  description: 'AMD Radeon RX 7800 XT',
  subgroupMinSize: 32,
  subgroupMaxSize: 64,
  isFallbackAdapter: false,
}

/** The one reported limits fixture of the success and device cases. */
const ADAPTER_LIMITS = {
  maxTextureDimension2D: 16384,
  maxBufferSize: 1073741824,
  maxBindGroups: 4,
}

/** The one device fixture of the capability gate and the exact device handoff. */
const GATE_DEVICE = {} as unknown as GPUDevice

/** Build a fake `GPU` whose every call is recorded. */
function createFakeGpu(
  operations: CapabilityOperation[],
  adapter: GPUAdapter | null,
): GPU {
  return {
    requestAdapter() {
      operations.push('requestAdapter')
      return Promise.resolve(adapter)
    },
  } as unknown as GPU
}

/** Build a fake adapter whose every info, limits, and device read is recorded. */
function createFakeAdapter(
  operations: CapabilityOperation[],
  info: Record<string, string | number | boolean>,
  limits: Record<string, number>,
  deviceResult: Promise<GPUDevice>,
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
  operations: CapabilityOperation[],
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

/** The fake renderer surface of the backend gate, recording every operation. */
interface FakeRenderer extends PresentationRenderer {
  render(): void
}

/** Build a fake renderer whose every operation is recorded. */
function createFakeRenderer(
  operations: BackendOperation[],
  backend: PresentationRenderer['backend'],
  initResult: Promise<unknown>,
): FakeRenderer {
  return {
    get backend(): PresentationRenderer['backend'] {
      operations.push('renderer.backend')
      return backend
    },
    init() {
      operations.push('renderer.init')
      return initResult
    },
    dispose() {
      operations.push('renderer.dispose')
    },
    render() {
      throw new Error('startup must never render a frame')
    },
    compileAsync() {
      throw new Error('startup must never prepare GPU resources')
    },
    setSize() {
      throw new Error('startup must never resize the canvas')
    },
    get domElement(): HTMLCanvasElement {
      throw new Error('startup must never touch the canvas')
    },
  }
}

/** Build a fake renderer factory that records every device handoff. */
function createFakeFactory(
  operations: BackendOperation[],
  renderer: PresentationRenderer,
): WebGPURendererFactory {
  return {
    create(device: GPUDevice): PresentationRenderer {
      operations.push('factory.create')
      captured.factoryDevices.push(device)
      return renderer
    },
  }
}

/** The shared capture of the integration test, mirroring the gate fakes. */
const captured: CapturedCalls = { deviceDescriptors: [], factoryDevices: [] }

/** A controlled `requestAnimationFrame`-style scheduler for deterministic frame requests. */
interface ControlledFrameScheduler extends FrameScheduler {
  /** Number of pending, not yet fired frame requests. */
  pendingCount(): number
}

/** Build a scheduler that records every pending frame request. */
function createControlledFrameScheduler(): ControlledFrameScheduler {
  let nextHandle = 1
  let pending: Array<{ handle: number; callback: FrameCallback }> = []

  return {
    requestFrame(callback) {
      const handle = nextHandle
      nextHandle += 1
      pending = [...pending, { handle, callback }]
      return handle
    },
    cancelFrame(handle) {
      pending = pending.filter((entry) => entry.handle !== handle)
    },
    pendingCount() {
      return pending.length
    },
  }
}

/** One recorded delivery-state transition of the injected surface. */
type SurfaceCall =
  | 'startup'
  | 'unsupported'
  | 'loading-scene'
  | 'progress'
  | 'load-failed'
  | 'ready'
  | 'mount-canvas'

/** The recording delivery-state surface, proving the exact ordered state trace. */
interface RecordingSurface extends DeliveryStateSurface {
  /** Every state transition in call order. */
  readonly calls: SurfaceCall[]
  /** Every `Unsupported` or `Load failed` message received, in call order. */
  readonly messages: string[]
}

/** Build a recording delivery-state surface. */
function createRecordingSurface(): RecordingSurface {
  const calls: SurfaceCall[] = []
  const messages: string[] = []
  return {
    calls,
    messages,
    showStartup() {
      calls.push('startup')
    },
    showUnsupported(message: string) {
      calls.push('unsupported')
      messages.push(message)
    },
    showLoadingScene() {
      calls.push('loading-scene')
    },
    showProgress() {
      calls.push('progress')
    },
    showLoadFailed(message: string) {
      calls.push('load-failed')
      messages.push(message)
    },
    showReady() {
      calls.push('ready')
    },
    mountCanvas() {
      calls.push('mount-canvas')
    },
  }
}

/** Build the one recording Scene-loading handoff and its invocation log. */
function createRecordingHandoff(
  invocations: PresentationRenderer[],
): SceneLoadingHandoff {
  return (renderer: PresentationRenderer) => {
    invocations.push(renderer)
  }
}

/** The recording startup-record recorder, proving what the product reports. */
interface RecordingRecorder {
  /** Every startup record published, in call order. */
  readonly records: unknown[]
  /** Capture one published startup record. */
  record(record: unknown): void
}

/** Build a recording startup-record recorder. */
function createRecordingRecorder(): RecordingRecorder {
  const records: unknown[] = []
  return {
    records,
    record(record: unknown) {
      records.push(record)
    },
  }
}

/**
 * Assert the runtime frame loop stayed stopped: no pending frame request
 * exists, so a failed startup started neither the runtime nor any later
 * gate (REQ-134, PVS-WEB-001).
 */
function expectRuntimeStopped(scheduler: ControlledFrameScheduler): void {
  expect(scheduler.pendingCount()).toBe(0)
}

describe('composed Phase 6 startup (ARCH-006, ARCH-009, ARCH-010, ARCH-023, ARCH-024)', () => {
  it('runs the full ordered success trace: capability gate, backend gate, one runtime frame loop, and the Scene-loading handoff with the exact device and renderer', async () => {
    const capabilityOperations: CapabilityOperation[] = []
    const backendOperations: BackendOperation[] = []
    captured.deviceDescriptors.length = 0
    captured.factoryDevices.length = 0

    const fakeRenderer = createFakeRenderer(
      backendOperations,
      { isWebGPUBackend: true },
      Promise.resolve(),
    )
    const factory = createFakeFactory(backendOperations, fakeRenderer)
    const fakeAdapter = createFakeAdapter(
      capabilityOperations,
      ADAPTER_INFO,
      ADAPTER_LIMITS,
      Promise.resolve(GATE_DEVICE),
    )
    const gpu = createFakeGpu(capabilityOperations, fakeAdapter)
    const environment = createEnvironment(capabilityOperations, true, gpu)
    const scheduler = createControlledFrameScheduler()
    const surface = createRecordingSurface()
    const handoffInvocations: PresentationRenderer[] = []
    const handoff = createRecordingHandoff(handoffInvocations)

    const application = createBrowserApplication(createSimulation, scheduler)
    const recorder = createRecordingRecorder()
    await runApplicationStartup(application, surface, {
      environment,
      factory,
      handoff,
      recorder,
    })

    // The delivery state stayed at `Startup` while the checks ran and no
    // `Unsupported` alert appeared (REQ-134).
    expect(surface.calls).toEqual(['startup'])

    // The capability gate ran every check in the governed order and the
    // backend gate created the renderer with the exact capability-gate
    // device, waited for initialization, and inspected only the WebGPU
    // backend (REQ-014, REQ-135, PVS-WEB-001).
    expect(capabilityOperations).toEqual([
      'secure-context',
      'navigator.gpu',
      'requestAdapter',
      'adapter.info',
      'adapter.limits',
      'requestDevice',
    ])
    expect(captured.deviceDescriptors).toEqual([{}])
    // The backend gate created the renderer with the exact device, waited
    // for initialization, and inspected the backend; the record composer
    // re-reads the same stable backend identity for the machine-readable
    // startup record (REQ-011, REQ-134).
    expect(backendOperations).toEqual([
      'factory.create',
      'renderer.init',
      'renderer.backend',
      'renderer.backend',
    ])
    expect(captured.factoryDevices).toEqual([GATE_DEVICE])

    // The product published exactly one machine-readable startup record
    // with the exact reported gate facts: the secure context, the exact
    // gate order, the `high-performance` power-preference hint, the full
    // adapter information and every reported limit, the empty core-only
    // device request, the WebGPU backend, no WebGL fallback, and the
    // `Loading Scene` delivery state (REQ-011, REQ-014, REQ-134,
    // REQ-135).
    expect(recorder.records).toHaveLength(1)
    expect(recorder.records[0]).toEqual({
      secureContext: true,
      gates: [
        'secure-context',
        'webgpu-presence',
        'physical-adapter',
        'core-device',
        'webgpu-backend',
      ],
      powerPreference: 'high-performance',
      adapter: {
        vendor: 'AMD',
        isFallbackAdapter: false,
        info: ADAPTER_INFO,
        limits: ADAPTER_LIMITS,
      },
      device: {
        descriptor: {},
        optionalFeatures: [],
        requiredLimits: {},
      },
      backend: {
        selected: 'webgpu',
        webglFallback: false,
      },
      deliveryState: 'Loading Scene',
    })

    // Success started exactly one runtime frame loop and invoked the
    // Scene-loading handoff exactly once with the initialized renderer
    // (REQ-134, PVS-WEB-001).
    expect(scheduler.pendingCount()).toBe(1)
    expect(handoffInvocations).toEqual([fakeRenderer])

    application.runtime.stop()
    expect(scheduler.pendingCount()).toBe(0)
  })

  it('enters Loading Scene only after every check passes when the production handoff is wired', async () => {
    const capabilityOperations: CapabilityOperation[] = []
    const backendOperations: BackendOperation[] = []
    captured.deviceDescriptors.length = 0
    captured.factoryDevices.length = 0

    const fakeRenderer = createFakeRenderer(
      backendOperations,
      { isWebGPUBackend: true },
      Promise.resolve(),
    )
    const factory = createFakeFactory(backendOperations, fakeRenderer)
    const fakeAdapter = createFakeAdapter(
      capabilityOperations,
      ADAPTER_INFO,
      ADAPTER_LIMITS,
      Promise.resolve(GATE_DEVICE),
    )
    const gpu = createFakeGpu(capabilityOperations, fakeAdapter)
    const environment = createEnvironment(capabilityOperations, true, gpu)
    const scheduler = createControlledFrameScheduler()
    const surface = createRecordingSurface()

    const application = createBrowserApplication(createSimulation, scheduler)
    // The Scene-loading handoff defaults to the production handoff, which
    // enters the `Loading Scene` delivery state (REQ-134, PVS-WEB-001).
    await runApplicationStartup(application, surface, { environment, factory })

    expect(surface.calls).toEqual(['startup', 'loading-scene'])
    expect(surface.messages).toEqual([])
    expect(scheduler.pendingCount()).toBe(1)

    application.runtime.stop()
    expect(scheduler.pendingCount()).toBe(0)
  })

  it('stops at the secure-context check, starts no runtime, invokes no handoff, and shows its exact alert', async () => {
    const capabilityOperations: CapabilityOperation[] = []
    const backendOperations: BackendOperation[] = []
    captured.deviceDescriptors.length = 0
    captured.factoryDevices.length = 0

    const fakeRenderer = createFakeRenderer(
      backendOperations,
      { isWebGPUBackend: true },
      Promise.resolve(),
    )
    const factory = createFakeFactory(backendOperations, fakeRenderer)
    const fakeAdapter = createFakeAdapter(
      capabilityOperations,
      ADAPTER_INFO,
      ADAPTER_LIMITS,
      Promise.resolve(GATE_DEVICE),
    )
    const gpu = createFakeGpu(capabilityOperations, fakeAdapter)
    const environment = createEnvironment(capabilityOperations, false, gpu)
    const scheduler = createControlledFrameScheduler()
    const surface = createRecordingSurface()
    const handoffInvocations: PresentationRenderer[] = []
    const handoff = createRecordingHandoff(handoffInvocations)

    const application = createBrowserApplication(createSimulation, scheduler)
    const recorder = createRecordingRecorder()
    await runApplicationStartup(application, surface, {
      environment,
      factory,
      handoff,
      recorder,
    })

    // The gate performed no later capability operation and the backend gate
    // never ran (a failed check cannot run a later gate).
    expect(capabilityOperations).toEqual(['secure-context'])
    expect(backendOperations).toEqual([])
    expect(captured.deviceDescriptors).toEqual([])
    expect(captured.factoryDevices).toEqual([])
    expectRuntimeStopped(scheduler)
    expect(handoffInvocations).toEqual([])
    // A failed startup publishes no startup record (REQ-134).
    expect(recorder.records).toEqual([])
    // One specific semantic `Unsupported` alert with the exact readable
    // message of the failed check (REQ-134).
    expect(surface.calls).toEqual(['startup', 'unsupported'])
    expect(surface.messages).toEqual(['Startup requires a secure context.'])
  })

  it('stops at the WebGPU-unavailable check, starts no runtime, invokes no handoff, and shows its exact alert', async () => {
    const capabilityOperations: CapabilityOperation[] = []
    const backendOperations: BackendOperation[] = []
    captured.deviceDescriptors.length = 0
    captured.factoryDevices.length = 0

    const fakeRenderer = createFakeRenderer(
      backendOperations,
      { isWebGPUBackend: true },
      Promise.resolve(),
    )
    const factory = createFakeFactory(backendOperations, fakeRenderer)
    const environment = createEnvironment(capabilityOperations, true, null)
    const scheduler = createControlledFrameScheduler()
    const surface = createRecordingSurface()
    const handoffInvocations: PresentationRenderer[] = []
    const handoff = createRecordingHandoff(handoffInvocations)

    const application = createBrowserApplication(createSimulation, scheduler)
    await runApplicationStartup(application, surface, { environment, factory, handoff })

    expect(capabilityOperations).toEqual(['secure-context', 'navigator.gpu'])
    expect(backendOperations).toEqual([])
    expect(captured.deviceDescriptors).toEqual([])
    expect(captured.factoryDevices).toEqual([])
    expectRuntimeStopped(scheduler)
    expect(handoffInvocations).toEqual([])
    expect(surface.calls).toEqual(['startup', 'unsupported'])
    expect(surface.messages).toEqual(['WebGPU is not available in this browser.'])
  })

  it('stops at the physical-adapter check for a null adapter, starts no runtime, invokes no handoff, and shows its exact alert', async () => {
    const capabilityOperations: CapabilityOperation[] = []
    const backendOperations: BackendOperation[] = []
    captured.deviceDescriptors.length = 0
    captured.factoryDevices.length = 0

    const fakeRenderer = createFakeRenderer(
      backendOperations,
      { isWebGPUBackend: true },
      Promise.resolve(),
    )
    const factory = createFakeFactory(backendOperations, fakeRenderer)
    const gpu = createFakeGpu(capabilityOperations, null)
    const environment = createEnvironment(capabilityOperations, true, gpu)
    const scheduler = createControlledFrameScheduler()
    const surface = createRecordingSurface()
    const handoffInvocations: PresentationRenderer[] = []
    const handoff = createRecordingHandoff(handoffInvocations)

    const application = createBrowserApplication(createSimulation, scheduler)
    await runApplicationStartup(application, surface, { environment, factory, handoff })

    expect(capabilityOperations).toEqual([
      'secure-context',
      'navigator.gpu',
      'requestAdapter',
    ])
    expect(backendOperations).toEqual([])
    expect(captured.deviceDescriptors).toEqual([])
    expect(captured.factoryDevices).toEqual([])
    expectRuntimeStopped(scheduler)
    expect(handoffInvocations).toEqual([])
    expect(surface.calls).toEqual(['startup', 'unsupported'])
    expect(surface.messages).toEqual(['No WebGPU adapter was returned.'])
  })

  it('stops at the physical-adapter check for a software fallback, starts no runtime, invokes no handoff, and shows its exact alert', async () => {
    const capabilityOperations: CapabilityOperation[] = []
    const backendOperations: BackendOperation[] = []
    captured.deviceDescriptors.length = 0
    captured.factoryDevices.length = 0

    const fakeRenderer = createFakeRenderer(
      backendOperations,
      { isWebGPUBackend: true },
      Promise.resolve(),
    )
    const factory = createFakeFactory(backendOperations, fakeRenderer)
    const fakeAdapter = createFakeAdapter(
      capabilityOperations,
      { ...ADAPTER_INFO, isFallbackAdapter: true },
      ADAPTER_LIMITS,
      Promise.resolve(GATE_DEVICE),
    )
    const gpu = createFakeGpu(capabilityOperations, fakeAdapter)
    const environment = createEnvironment(capabilityOperations, true, gpu)
    const scheduler = createControlledFrameScheduler()
    const surface = createRecordingSurface()
    const handoffInvocations: PresentationRenderer[] = []
    const handoff = createRecordingHandoff(handoffInvocations)

    const application = createBrowserApplication(createSimulation, scheduler)
    await runApplicationStartup(application, surface, { environment, factory, handoff })

    expect(capabilityOperations).toEqual([
      'secure-context',
      'navigator.gpu',
      'requestAdapter',
      'adapter.info',
    ])
    expect(backendOperations).toEqual([])
    expect(captured.deviceDescriptors).toEqual([])
    expect(captured.factoryDevices).toEqual([])
    expectRuntimeStopped(scheduler)
    expect(handoffInvocations).toEqual([])
    expect(surface.calls).toEqual(['startup', 'unsupported'])
    expect(surface.messages).toEqual([
      'The WebGPU adapter is a software fallback; a physical adapter is required.',
    ])
  })

  it('stops at the device-initialization check, starts no runtime, invokes no handoff, and shows its exact alert', async () => {
    const capabilityOperations: CapabilityOperation[] = []
    const backendOperations: BackendOperation[] = []
    captured.deviceDescriptors.length = 0
    captured.factoryDevices.length = 0

    const fakeRenderer = createFakeRenderer(
      backendOperations,
      { isWebGPUBackend: true },
      Promise.resolve(),
    )
    const factory = createFakeFactory(backendOperations, fakeRenderer)
    const fakeAdapter = createFakeAdapter(
      capabilityOperations,
      ADAPTER_INFO,
      ADAPTER_LIMITS,
      Promise.reject(new Error('device request failed')),
    )
    const gpu = createFakeGpu(capabilityOperations, fakeAdapter)
    const environment = createEnvironment(capabilityOperations, true, gpu)
    const scheduler = createControlledFrameScheduler()
    const surface = createRecordingSurface()
    const handoffInvocations: PresentationRenderer[] = []
    const handoff = createRecordingHandoff(handoffInvocations)

    const application = createBrowserApplication(createSimulation, scheduler)
    await runApplicationStartup(application, surface, { environment, factory, handoff })

    expect(capabilityOperations).toEqual([
      'secure-context',
      'navigator.gpu',
      'requestAdapter',
      'adapter.info',
      'adapter.limits',
      'requestDevice',
    ])
    expect(backendOperations).toEqual([])
    expect(captured.deviceDescriptors).toEqual([{}])
    expect(captured.factoryDevices).toEqual([])
    expectRuntimeStopped(scheduler)
    expect(handoffInvocations).toEqual([])
    expect(surface.calls).toEqual(['startup', 'unsupported'])
    expect(surface.messages).toEqual(['The WebGPU device could not be initialized.'])
  })

  it('stops at the WebGPU-backend check for a renderer initialization failure, disposes the renderer, starts no runtime, invokes no handoff, and shows its exact alert', async () => {
    const capabilityOperations: CapabilityOperation[] = []
    const backendOperations: BackendOperation[] = []
    captured.deviceDescriptors.length = 0
    captured.factoryDevices.length = 0

    const fakeRenderer = createFakeRenderer(
      backendOperations,
      { isWebGPUBackend: true },
      Promise.reject(new Error('renderer init failed')),
    )
    const factory = createFakeFactory(backendOperations, fakeRenderer)
    const fakeAdapter = createFakeAdapter(
      capabilityOperations,
      ADAPTER_INFO,
      ADAPTER_LIMITS,
      Promise.resolve(GATE_DEVICE),
    )
    const gpu = createFakeGpu(capabilityOperations, fakeAdapter)
    const environment = createEnvironment(capabilityOperations, true, gpu)
    const scheduler = createControlledFrameScheduler()
    const surface = createRecordingSurface()
    const handoffInvocations: PresentationRenderer[] = []
    const handoff = createRecordingHandoff(handoffInvocations)

    const application = createBrowserApplication(createSimulation, scheduler)
    await runApplicationStartup(application, surface, { environment, factory, handoff })

    // The capability gate passed fully; the backend gate stopped at the
    // failed renderer initialization, disposed the rejected renderer, and
    // never inspected a backend that never initialized (REQ-011,
    // PVS-WEB-001).
    expect(backendOperations).toEqual(['factory.create', 'renderer.init', 'renderer.dispose'])
    expect(captured.factoryDevices).toEqual([GATE_DEVICE])
    expectRuntimeStopped(scheduler)
    expect(handoffInvocations).toEqual([])
    expect(surface.calls).toEqual(['startup', 'unsupported'])
    expect(surface.messages).toEqual([
      'The Three.js renderer could not be initialized on the selected WebGPU device.',
    ])
  })

  it('stops at the WebGPU-backend check for the Three.js WebGL fallback, disposes the renderer, starts no runtime, invokes no handoff, and shows its exact alert', async () => {
    const capabilityOperations: CapabilityOperation[] = []
    const backendOperations: BackendOperation[] = []
    captured.deviceDescriptors.length = 0
    captured.factoryDevices.length = 0

    const fakeRenderer = createFakeRenderer(
      backendOperations,
      { isWebGLBackend: true },
      Promise.resolve(),
    )
    const factory = createFakeFactory(backendOperations, fakeRenderer)
    const fakeAdapter = createFakeAdapter(
      capabilityOperations,
      ADAPTER_INFO,
      ADAPTER_LIMITS,
      Promise.resolve(GATE_DEVICE),
    )
    const gpu = createFakeGpu(capabilityOperations, fakeAdapter)
    const environment = createEnvironment(capabilityOperations, true, gpu)
    const scheduler = createControlledFrameScheduler()
    const surface = createRecordingSurface()
    const handoffInvocations: PresentationRenderer[] = []
    const handoff = createRecordingHandoff(handoffInvocations)

    const application = createBrowserApplication(createSimulation, scheduler)
    await runApplicationStartup(application, surface, { environment, factory, handoff })

    // The non-WebGPU backend is rejected and disposed before gameplay; no
    // WebGL fallback path exists (REQ-011, PVS-SCP-006).
    expect(backendOperations).toEqual([
      'factory.create',
      'renderer.init',
      'renderer.backend',
      'renderer.dispose',
    ])
    expect(captured.factoryDevices).toEqual([GATE_DEVICE])
    expectRuntimeStopped(scheduler)
    expect(handoffInvocations).toEqual([])
    expect(surface.calls).toEqual(['startup', 'unsupported'])
    expect(surface.messages).toEqual([
      'The Three.js renderer selected a non-WebGPU backend; WebGL fallback is rejected.',
    ])
  })
})
