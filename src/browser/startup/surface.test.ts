// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createSimulation } from '../../core/simulation'
import { createBrowserApplication, runApplicationStartup } from '../compositionRoot'
import type { PresentationRenderer, WebGPURendererFactory } from '../presentation'
import { renderSupportPromise } from '../support/surface'
import type { StartupCapabilityEnvironment } from './index'
import { renderDeliveryState } from './surface'
import type { DeliveryStateSurface } from './surface'

/**
 * The focused startup surface test (ARCH-010, ARCH-023, REQ-134,
 * PVS-WEB-001).
 *
 * This test renders the real product surface — the application name, the
 * single support-promise table, and the delivery-state surface — into a
 * DOM environment and drives the real composed startup with injected
 * capability and renderer collaborators. It proves that the successful
 * state is `Loading Scene`, that the state stays at `Startup` while the
 * checks run, that one failed check shows one specific semantic
 * `Unsupported` alert with its exact readable message, and that the
 * application still has one name and one support table.
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

describe('startup delivery-state surface (ARCH-010, ARCH-023, REQ-134, PVS-WEB-001)', () => {
  it('keeps the delivery state at Startup while the checks run and enters Loading Scene only after every check passes, with one name and one support table', async () => {
    const device = createDeferred<GPUDevice>()
    const environment = createPassingEnvironment(device.promise)
    const factory = createPassingFactory()
    const { host, surface } = composeProductSurface()
    const application = createBrowserApplication(createSimulation)

    const pending = runApplicationStartup(application, surface, { environment, factory })

    // Let the capability gate reach the still-pending device request: the
    // delivery state must stay at `Startup` while the checks run
    // (REQ-134, PVS-WEB-001).
    for (let turn = 0; turn < 5; turn += 1) {
      await Promise.resolve()
    }
    const state = host.querySelector('#delivery-state')
    expect(state?.textContent).toBe('Startup')

    device.resolve({} as unknown as GPUDevice)
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
})
