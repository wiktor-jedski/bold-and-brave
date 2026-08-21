// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createSimulation } from '../../core/simulation'
import { createBrowserApplication, runApplicationStartup } from '../compositionRoot'
import type { PresentationRenderer, WebGPURendererFactory } from '../presentation'
import { renderSupportPromise } from '../support/surface'
import type { StartupCapabilityEnvironment } from './index'
import { createSceneLoadingHandoff, renderDeliveryState } from './surface'
import type { DeliveryStateSurface, SceneLoadingHandoff } from './surface'
import { DEVICE_LOST_MESSAGE } from './deviceLoss'
import type { SceneLoadDependencies } from '../scene'
import type { SceneLoadRecorder } from '../scene'
import { productionSceneLoadDependencies } from '../scene'

/**
 * The focused startup surface test (ARCH-010, ARCH-023, REQ-134,
 * REQ-136, PVS-WEB-001, PVS-WEB-003).
 *
 * This test renders the real product surface — the application name, the
 * single support-promise table, and the delivery-state surface — into a
 * DOM environment and drives the real composed startup with injected
 * capability and renderer collaborators. It proves that the successful
 * state is `Loading Scene`, that the state stays at `Startup` while the
 * checks run, that one failed check shows one specific semantic
 * `Unsupported` alert with its exact readable message, that the production
 * Scene-loading handoff reports the ordered download, decode, GPU-upload,
 * and Scene-readiness stages and enters `Ready` with one canvas, and that
 * the application still has one name and one support table.
 */

/** The one reported adapter-info fixture of the success case. */
const ADAPTER_INFO = {
  vendor: 'AMD',
  architecture: 'rdna3',
  device: 'Navi 31',
  description: 'AMD Radeon RX 7800 XT',
  subgroupMinSize: 32,
  subgroupMaxSize: 64,
  isFallbackAdapter: false,
}

/** The one reported limits fixture of the success case. */
const ADAPTER_LIMITS = {
  maxTextureDimension2D: 16384,
  maxBufferSize: 1073741824,
  maxBindGroups: 4,
}

/** The committed authored glTF bytes the production loader downloads. */
const AUTHORED_GLTF_BYTES = readFileSync(
  join('public', 'scenes', 'poc-overworld', 'poc-overworld-environment.gltf'),
)

/** Build a fetch response that streams the committed asset in one chunk. */
function committedAssetResponse(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(AUTHORED_GLTF_BYTES))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { 'content-length': String(AUTHORED_GLTF_BYTES.length) },
  })
}

/** A `GPUDevice.lost` promise that never resolves, for fixtures that must not lose. */
const NEVER_LOST = new Promise<GPUDeviceLostInfo>(() => {})

/** Build a fake device whose `GPUDevice.lost` promise is never lost. */
function createStableDevice(): GPUDevice {
  return { lost: NEVER_LOST } as unknown as GPUDevice
}

/** Build the capability environment that passes every capability check. */
function createPassingEnvironment(
  devicePromise: Promise<GPUDevice>,
): StartupCapabilityEnvironment {
  const adapter = {
    get info(): GPUAdapterInfo {
      return ADAPTER_INFO as unknown as GPUAdapterInfo
    },
    get limits(): GPUSupportedLimits {
      return ADAPTER_LIMITS as unknown as GPUSupportedLimits
    },
    requestDevice() {
      return devicePromise
    },
  } as unknown as GPUAdapter
  const gpu = {
    requestAdapter() {
      return Promise.resolve(adapter)
    },
  } as unknown as GPU
  return {
    get isSecureContext(): boolean {
      return true
    },
    get gpu(): GPU | null {
      return gpu
    },
  }
}

/** Build the renderer factory that accepts a WebGPU backend. */
function createPassingFactory(): WebGPURendererFactory {
  const renderer: PresentationRenderer = {
    get backend() {
      return { isWebGPUBackend: true }
    },
    init() {
      return Promise.resolve()
    },
    dispose() {},
    render() {},
    compileAsync() {
      return Promise.resolve()
    },
    setSize() {},
    get domElement() {
      return document.createElement('canvas')
    },
  }
  return {
    create(): PresentationRenderer {
      return renderer
    },
  }
}

/** Compose the product surface exactly as the startup entry composes it. */
function composeProductSurface(): {
  host: HTMLElement
  surface: DeliveryStateSurface
} {
  const host = document.createElement('div')
  host.id = 'app'
  document.body.append(host)
  // The application name (ARCH-024).
  host.textContent = 'Bold and Brave'
  // The single support-promise table (REQ-012, REQ-013).
  renderSupportPromise(host)
  // The delivery-state surface (ARCH-010).
  const surface = renderDeliveryState(host)
  return { host, surface }
}

/** A promise whose settlement the test controls. */
interface Deferred<T> {
  /** Settle the deferred promise as fulfilled. */
  resolve(value: T): void
  /** The pending promise. */
  promise: Promise<T>
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { resolve, promise }
}

/** The real Scene-load dependencies with the committed asset download. */
function dependenciesWithCommittedAsset(): SceneLoadDependencies {
  return {
    ...productionSceneLoadDependencies,
    fetchInput: () => Promise.resolve(committedAssetResponse()),
  }
}

describe('startup delivery-state surface (ARCH-010, ARCH-023, REQ-134, REQ-136, PVS-WEB-001, PVS-WEB-003)', () => {
  it('keeps the delivery state at Startup while the checks run and enters Loading Scene only after every check passes, with one name and one support table', async () => {
    const device = createDeferred<GPUDevice>()
    const environment = createPassingEnvironment(device.promise)
    const factory = createPassingFactory()
    const { host, surface } = composeProductSurface()
    const application = createBrowserApplication(createSimulation)
    // The handoff is a startup collaborator: this test proves the surface
    // transitions, so it injects a handoff that enters `Loading Scene`
    // without starting a real asset download (the production handoff and
    // its real load are covered by the Ready test below).
    const handoff: SceneLoadingHandoff = () => {
      surface.showLoadingScene()
    }

    const pending = runApplicationStartup(application, surface, {
      environment,
      factory,
      handoff,
    })

    // Let the capability gate reach the still-pending device request: the
    // delivery state must stay at `Startup` while the checks run
    // (REQ-134, PVS-WEB-001).
    for (let turn = 0; turn < 5; turn += 1) {
      await Promise.resolve()
    }
    const state = host.querySelector('#delivery-state')
    expect(state?.textContent).toBe('Startup')

    device.resolve(createStableDevice())
    await pending

    // The successful state is `Loading Scene` (REQ-134, PVS-WEB-001).
    expect(state?.textContent).toBe('Loading Scene')
    expect(state?.getAttribute('role')).toBe('status')
    // No `Unsupported` alert appears on success.
    expect(host.querySelectorAll('[role="alert"]')).toHaveLength(0)

    // The application still has one name and one support table (ARCH-024,
    // REQ-012, REQ-013): exactly one occurrence of the name text and
    // exactly one semantic table with one body row.
    expect(host.textContent?.match(/Bold and Brave/g)).toHaveLength(1)
    const tables = host.querySelectorAll('table')
    expect(tables).toHaveLength(1)
    expect(tables[0].querySelectorAll('tbody tr')).toHaveLength(1)
  })

  it('shows one specific semantic Unsupported alert with the exact readable message for the first failed check', async () => {
    const environment: StartupCapabilityEnvironment = {
      get isSecureContext(): boolean {
        return false
      },
      get gpu(): GPU | null {
        return null
      },
    }
    const factory = createPassingFactory()
    const { host, surface } = composeProductSurface()
    const application = createBrowserApplication(createSimulation)

    await runApplicationStartup(application, surface, { environment, factory })

    // The failed check shows the `Unsupported` state and one semantic
    // alert with the exact readable message of that check (REQ-134,
    // PVS-WEB-001).
    const state = host.querySelector('#delivery-state')
    expect(state?.textContent).toBe('Unsupported')
    const alerts = host.querySelectorAll('[role="alert"]')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].textContent).toBe('Startup requires a secure context.')
  })

  it('enters the terminal Device lost state with one alert, one Reload action, no Retry or gameplay action, and one reload call even after repeated loss signals', () => {
    const { host, surface } = composeProductSurface()
    const retry = vi.fn()
    const reload = vi.fn()

    // A prior failed load showed the Retry action; the terminal `Device
    // lost` state must expose no Retry action (REQ-134, PVS-WEB-001).
    surface.showLoadFailed('the first stage failed', retry)
    surface.showDeviceLost(DEVICE_LOST_MESSAGE, reload)
    // A repeated loss signal keeps exactly one Reload action.
    surface.showDeviceLost(DEVICE_LOST_MESSAGE, reload)

    // The semantic surface reports the terminal `Device lost` status and
    // one readable semantic failure alert (REQ-134, PVS-WEB-001).
    const state = host.querySelector('#delivery-state')
    expect(state?.textContent).toBe('Device lost')
    expect(state?.getAttribute('role')).toBe('status')
    const alerts = host.querySelectorAll('[role="alert"]')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].textContent).toBe(DEVICE_LOST_MESSAGE)

    // One Reload action and no other action: the Retry action of the
    // earlier failed load was removed and no gameplay action exists
    // (REQ-134, PVS-WEB-001).
    const buttons = host.querySelectorAll('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].textContent).toBe('Reload')
    expect(host.textContent?.includes('Retry')).toBe(false)

    // The surface itself never invoked the reload or retry operations.
    expect(reload).not.toHaveBeenCalled()
    expect(retry).not.toHaveBeenCalled()

    // One reload call even after repeated loss signals: the first click
    // performs the browser reload operation; later clicks cannot repeat
    // it (REQ-134, PVS-WEB-001).
    buttons[0].click()
    buttons[0].click()
    buttons[0].click()
    expect(reload).toHaveBeenCalledTimes(1)
    // The terminal state never retries the failed Scene load.
    expect(retry).not.toHaveBeenCalled()
  })

  it('runs the real production handoff through the composed startup: reports the ordered stages, mounts one canvas, publishes the record, and enters Ready', async () => {
    const environment = createPassingEnvironment(Promise.resolve(createStableDevice()))
    const factory = createPassingFactory()
    const { host, surface } = composeProductSurface()
    const application = createBrowserApplication(createSimulation)

    // The production Scene-loading handoff with the real Scene-load
    // dependencies and the committed authored asset (REQ-136): the handoff
    // runs the startup Scene load with the initialized renderer.
    const recorded: unknown[] = []
    const recorder: SceneLoadRecorder = {
      record(record: unknown) {
        recorded.push(record)
      },
    }
    const handoff = createSceneLoadingHandoff(
      surface,
      application.runtime.presenterSlot,
      dependenciesWithCommittedAsset(),
      recorder,
    )

    await runApplicationStartup(application, surface, { environment, factory, handoff })

    // The delivery state entered `Ready` only after the real load passed
    // (REQ-136, PVS-WEB-001); the load is promise-driven with no timer, so
    // the test waits for the state transition.
    const state = host.querySelector('#delivery-state')
    await vi.waitFor(() => {
      expect(state?.textContent).toBe('Ready')
    })

    // The product visibly reported the ordered download, decode,
    // GPU-upload, and Scene-readiness stages (PVS-WEB-003).
    const items = host.querySelectorAll('#scene-progress li')
    expect(items).toHaveLength(4)
    expect(items[0]?.textContent).toContain('Download')
    expect(items[1]?.textContent).toBe('Decode')
    expect(items[2]?.textContent).toBe('GPU upload')
    expect(items[3]?.textContent).toBe('Scene readiness')

    // The renderer canvas was added to the existing product surface: one
    // WebGPU canvas and no second canvas (ARCH-024).
    expect(host.querySelectorAll('canvas')).toHaveLength(1)

    // The machine-readable Scene-load record was published only after the
    // real load passed, with the exact identifiers, stage order, backend,
    // authored clip, diagnostic event log, zero retries, no failure, and
    // Ready state (REQ-136, REQ-137).
    const totalBytes = AUTHORED_GLTF_BYTES.length
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toEqual({
      sceneId: 'poc-overworld',
      assetId: 'poc-overworld-environment',
      stages: ['download', 'decode', 'upload', 'ready'],
      backend: 'webgpu',
      animationClips: ['poc-band-idle'],
      deliveryState: 'Ready',
      events: [
        { event: 'scene-load', sceneId: 'poc-overworld', assetId: 'poc-overworld-environment' },
        {
          event: 'download',
          sceneId: 'poc-overworld',
          assetId: 'poc-overworld-environment',
          stage: 'download',
          receivedBytes: 0,
          totalBytes,
        },
        {
          event: 'progress',
          sceneId: 'poc-overworld',
          assetId: 'poc-overworld-environment',
          stage: 'download',
          receivedBytes: totalBytes,
          totalBytes,
        },
        {
          event: 'decode',
          sceneId: 'poc-overworld',
          assetId: 'poc-overworld-environment',
          stage: 'decode',
          receivedBytes: totalBytes,
          totalBytes,
        },
        {
          event: 'upload',
          sceneId: 'poc-overworld',
          assetId: 'poc-overworld-environment',
          stage: 'upload',
          receivedBytes: totalBytes,
          totalBytes,
        },
        {
          event: 'ready',
          sceneId: 'poc-overworld',
          assetId: 'poc-overworld-environment',
          stage: 'ready',
          receivedBytes: totalBytes,
          totalBytes,
        },
        { event: 'complete', sceneId: 'poc-overworld', assetId: 'poc-overworld-environment' },
      ],
      retries: 0,
      failure: null,
    })

    // The application still has one name and one support table (ARCH-024,
    // REQ-012, REQ-013).
    expect(host.textContent?.match(/Bold and Brave/g)).toHaveLength(1)
    expect(host.querySelectorAll('table')).toHaveLength(1)
  })
})
