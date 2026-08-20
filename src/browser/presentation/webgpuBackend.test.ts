import { describe, expect, it } from 'vitest'
import { runWebGPUBackendGate } from './index'
import type {
  PresentationRenderer,
  PresentationResult,
  PresentationUnsupported,
  WebGPURendererFactory,
} from './index'

/**
 * One recorded renderer operation of the backend gate, in the order it ran.
 * The test proves that initialization completes before backend inspection
 * and that a rejected gate disposes the renderer without any render or
 * Scene-loading operation (REQ-011, PVS-WEB-001) by comparing this log
 * with the expected sequence.
 */
type Operation =
  | 'factory.create'
  | 'renderer.init'
  | 'renderer.backend'
  | 'renderer.dispose'
  | 'renderer.render'

/** Calls the recording fakes capture for exact-argument assertions. */
interface CapturedCalls {
  /** Every device passed to the renderer factory, in call order. */
  devices: GPUDevice[]
}

/**
 * The fake renderer surface, extended with the `render` operation the gate
 * must never invoke. The render method throws if called, so any accidental
 * render call fails the test immediately instead of silently passing.
 */
interface FakeRenderer extends PresentationRenderer {
  render(): void
}

/** Build a fake renderer whose every operation is recorded. */
function createFakeRenderer(
  operations: Operation[],
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
      operations.push('renderer.render')
      throw new Error('the backend gate must never render a frame')
    },
  }
}

/** Build a fake renderer factory that records every device handoff. */
function createFakeFactory(
  operations: Operation[],
  renderer: PresentationRenderer,
  captured: CapturedCalls,
): WebGPURendererFactory {
  return {
    create(device: GPUDevice): PresentationRenderer {
      operations.push('factory.create')
      captured.devices.push(device)
      return renderer
    },
  }
}

/** Assert the result is the typed, readable `Unsupported` failure (REQ-134). */
function expectUnsupported(result: PresentationResult): PresentationUnsupported {
  expect(result.ok).toBe(false)
  if (result.ok) {
    throw new Error('expected an Unsupported presentation result')
  }
  return result
}

/** The one device fixture the gate receives, as if selected by the capability gate. */
const GATE_DEVICE = {} as unknown as GPUDevice

/**
 * A promise whose settlement the test controls.
 *
 * The fake renderer returns the deferred promise from `init`, so the test
 * can hold initialization open and prove that the gate inspects the backend
 * only after initialization completes: while the promise is still pending,
 * the operations log must contain no `renderer.backend` entry. If the gate
 * omitted `await init()`, the mid-flight assertion fails (REQ-011,
 * PVS-WEB-001).
 */
interface Deferred {
  /** Settle the deferred promise as fulfilled. */
  resolve(): void
  /** The pending promise the fake renderer returns from `init`. */
  promise: Promise<void>
}

function createDeferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { resolve, promise }
}

/** Assert the gate handed the exact capability-gate device to the factory once (REQ-135). */
function expectExactDeviceOnce(captured: CapturedCalls): void {
  expect(captured.devices).toHaveLength(1)
  expect(captured.devices[0]).toBe(GATE_DEVICE)
}

describe('Three.js WebGPU backend gate (ARCH-009, REQ-011, REQ-134, REQ-135)', () => {
  it('hands the capability gate device to the renderer factory once, waits for initialization to complete before backend inspection, and accepts only a WebGPU backend', async () => {
    const operations: Operation[] = []
    const captured: CapturedCalls = { devices: [] }
    const deferredInit = createDeferred()
    const fakeRenderer = createFakeRenderer(
      operations,
      { isWebGPUBackend: true },
      deferredInit.promise,
    )
    const factory = createFakeFactory(operations, fakeRenderer, captured)

    const pending = runWebGPUBackendGate(GATE_DEVICE, factory)

    // The gate created the renderer with the capability-gate device and is
    // now waiting for initialization. While initialization is still
    // pending, the backend must not be inspected: this assertion fails if
    // the gate reads `renderer.backend` before `await init()` completes
    // (REQ-011, PVS-WEB-001).
    expect(operations).toEqual(['factory.create', 'renderer.init'])

    deferredInit.resolve()
    const result = await pending

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected a successful presentation result')
    }
    expect(result.renderer).toBe(fakeRenderer)
    expect(Object.isFrozen(result)).toBe(true)

    // The renderer factory receives the exact device selected by the
    // capability gate, exactly once (REQ-135, PVS-WEB-002).
    expectExactDeviceOnce(captured)

    // Initialization completed before the backend was inspected, the
    // accepted backend identifies itself as WebGPU, and the gate neither
    // disposes the accepted renderer nor renders or loads a Scene
    // (REQ-011, PVS-WEB-001).
    expect(operations).toEqual([
      'factory.create',
      'renderer.init',
      'renderer.backend',
    ])
  })

  it('returns the WebGPU-backend Unsupported result, disposes the renderer, and performs no later operation when initialization fails', async () => {
    const operations: Operation[] = []
    const captured: CapturedCalls = { devices: [] }
    const fakeRenderer = createFakeRenderer(
      operations,
      { isWebGPUBackend: true },
      Promise.reject(new Error('renderer init failed')),
    )
    const factory = createFakeFactory(operations, fakeRenderer, captured)

    const failure = expectUnsupported(await runWebGPUBackendGate(GATE_DEVICE, factory))

    expect(failure.code).toBe('webgpu-backend')
    expect(failure.message).toBe(
      'The Three.js renderer could not be initialized on the selected WebGPU device.',
    )
    expect(Object.isFrozen(failure)).toBe(true)

    // The failed initialization disposes the rejected renderer exactly
    // once and never inspects a backend that never initialized, never
    // renders, and never loads a Scene (PVS-WEB-001).
    expect(operations).toEqual(['factory.create', 'renderer.init', 'renderer.dispose'])
    expectExactDeviceOnce(captured)
  })

  it('rejects a renderer whose initialized backend is the Three.js WebGL fallback and disposes it', async () => {
    const operations: Operation[] = []
    const captured: CapturedCalls = { devices: [] }
    const deferredInit = createDeferred()
    // Three.js selects its WebGL2 fallback backend when the WebGPU backend
    // cannot initialize; the fallback identifies itself as WebGL, not as
    // WebGPU (REQ-011, PVS-WEB-001).
    const fakeRenderer = createFakeRenderer(
      operations,
      { isWebGLBackend: true },
      deferredInit.promise,
    )
    const factory = createFakeFactory(operations, fakeRenderer, captured)

    const pending = runWebGPUBackendGate(GATE_DEVICE, factory)

    // While initialization is still pending, the backend must not be
    // inspected, even for a fallback rejection (PVS-WEB-001).
    expect(operations).toEqual(['factory.create', 'renderer.init'])

    deferredInit.resolve()
    const failure = expectUnsupported(await pending)

    expect(failure.code).toBe('webgpu-backend')
    expect(failure.message).toBe(
      'The Three.js renderer selected a non-WebGPU backend; WebGL fallback is rejected.',
    )

    // The non-WebGPU backend is inspected only after initialization
    // completes, the rejected renderer is disposed, and no render or
    // Scene-loading operation runs (REQ-011, PVS-WEB-001).
    expect(operations).toEqual([
      'factory.create',
      'renderer.init',
      'renderer.backend',
      'renderer.dispose',
    ])
    expectExactDeviceOnce(captured)
  })

  it('accepts only the exact WebGPU backend identity and rejects a backend reporting isWebGPUBackend false', async () => {
    const operations: Operation[] = []
    const captured: CapturedCalls = { devices: [] }
    const deferredInit = createDeferred()
    const fakeRenderer = createFakeRenderer(
      operations,
      { isWebGPUBackend: false },
      deferredInit.promise,
    )
    const factory = createFakeFactory(operations, fakeRenderer, captured)

    const pending = runWebGPUBackendGate(GATE_DEVICE, factory)

    // While initialization is still pending, the backend must not be
    // inspected (PVS-WEB-001).
    expect(operations).toEqual(['factory.create', 'renderer.init'])

    deferredInit.resolve()
    const failure = expectUnsupported(await pending)

    expect(failure.code).toBe('webgpu-backend')
    expect(failure.message).toBe(
      'The Three.js renderer selected a non-WebGPU backend; WebGL fallback is rejected.',
    )
    expect(operations).toEqual([
      'factory.create',
      'renderer.init',
      'renderer.backend',
      'renderer.dispose',
    ])
    expectExactDeviceOnce(captured)
  })
})
