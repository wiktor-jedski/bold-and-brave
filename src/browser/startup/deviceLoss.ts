/**
 * The device-loss coordinator of the ordered Browser Delivery State
 * (ARCH-023, ARCH-024, REQ-134, REQ-138, PVS-WEB-001, PVS-WEB-005).
 *
 * The composition root wires the exact `GPUDevice` returned by the startup
 * capability gate into one coordinator BEFORE the Browser Runtime or the
 * Scene-loading handoff starts. The coordinator watches the device's own
 * `lost` promise and observes the delivery state through a guarded surface
 * wrapper: every delivery-state transition after the wiring goes through
 * the wrapper, so the coordinator knows when the product is in the
 * governed `Loading Scene` or `Ready` states.
 *
 * When `device.lost` resolves in `Loading Scene` or `Ready`, the
 * coordinator terminal-stops the Browser Runtime — closing the
 * gameplay-input gate, canceling the pending frame, discarding the frame
 * debt, and clearing the presenter slot so no hidden tick can be
 * dispatched and no frame can be presented while no frame can be shown
 * (REQ-138, PVS-WEB-005) — and then enters the terminal `Device lost`
 * delivery state with one readable semantic failure and one Reload action.
 * From that moment the guarded surface swallows every later load-progress,
 * load-failure, Retry, Ready, and frame callback, so no later delivery
 * operation can run after the loss (REQ-134, PVS-WEB-001).
 *
 * The Reload action calls the browser reload operation — never a retry and
 * never a new device request in process — so after navigation the normal
 * composition root repeats every startup gate on the fresh document
 * (REQ-134, PVS-WEB-001). Production binds `window.location.reload`;
 * tests inject a recording reload operation.
 */
import type { BrowserRuntime } from '../runtime'
import type { SceneLoadProgress } from '../scene'
import type { DeliveryStateSurface } from './surface'

/** The one readable semantic failure of the terminal `Device lost` state (REQ-134). */
export const DEVICE_LOST_MESSAGE =
  'The rendering device was lost. Reload the application to restart startup.'

/**
 * The delivery states the coordinator distinguishes.
 *
 * The coordinator enters the terminal `Device lost` state only when the
 * loss resolves while the product is in `Loading Scene` or `Ready` — the
 * two states the governed delivery table covers for a resolved
 * `GPUDevice.lost` promise (REQ-134, PVS-WEB-001).
 */
type DeliveryStateName =
  | 'Startup'
  | 'Unsupported'
  | 'Loading Scene'
  | 'Load failed'
  | 'Ready'

/** The options of the device-loss coordinator. */
export interface DeviceLossOptions {
  /**
   * The exact device returned by the startup capability gate (REQ-135).
   *
   * The coordinator watches this device's own `lost` promise; no second
   * adapter or device request exists.
   */
  readonly device: GPUDevice
  /**
   * The one Browser Runtime the coordinator terminal-stops on loss
   * (ARCH-006, REQ-138).
   */
  readonly runtime: BrowserRuntime
  /**
   * The delivery-state surface the coordinator observes and drives
   * (ARCH-010, REQ-134).
   */
  readonly surface: DeliveryStateSurface
  /**
   * The browser reload operation of the terminal state (ARCH-023).
   *
   * Production binds `window.location.reload`; tests inject a recording
   * reload to prove one call even after repeated loss signals.
   */
  readonly reload: () => void
}

/**
 * The device-loss coordinator (ARCH-023, REQ-134, REQ-138, PVS-WEB-005).
 */
export interface DeviceLossCoordinator {
  /**
   * Whether the coordinator entered the terminal `Device lost` state.
   *
   * The transition is irreversible: after the loss the guarded surface
   * swallows every later delivery callback and later loss signals are
   * no-ops.
   */
  readonly lost: boolean
  /**
   * The delivery-state surface guarded by the coordinator.
   *
   * The composition root routes every delivery-state transition through
   * this wrapper after the coordinator is wired, so the coordinator
   * observes the governed `Loading Scene` and `Ready` states and silences
   * every later callback after a loss.
   */
  readonly surface: DeliveryStateSurface
}

/**
 * The production browser reload operation of the terminal `Device lost`
 * state (ARCH-023, REQ-134, PVS-WEB-001).
 *
 * Reload performs a browser navigation; it never retries the failed Scene
 * load and never creates a new device in process. After navigation the
 * normal composition root repeats every startup gate on the fresh
 * document.
 */
export function productionDeviceReload(): void {
  window.location.reload()
}

/**
 * Wire the exact device into one device-loss coordinator (REQ-134,
 * REQ-138, PVS-WEB-005).
 *
 * The coordinator attaches a handler to the device's own `lost` promise
 * and returns a guarded surface wrapper. Every delivery-state transition
 * routed through the wrapper updates the coordinator's view of the state;
 * a resolved `device.lost` in the governed `Loading Scene` or `Ready`
 * states terminal-stops the runtime — closing the gameplay-input gate
 * before another tick and detaching presentation — and enters `Device
 * lost` with one readable semantic failure and one Reload action. From
 * then on the wrapper swallows every later load-progress, load-failure,
 * Retry, Ready, and frame callback, and later loss signals are no-ops.
 */
export function createDeviceLossCoordinator(
  options: DeviceLossOptions,
): DeviceLossCoordinator {
  let terminal = false
  let deliveryState: DeliveryStateName = 'Startup'

  // The guarded surface: it forwards every delivery-state transition to
  // the underlying surface while the coordinator is not terminal, and
  // swallows every later callback after the terminal `Device lost` state,
  // so no load-progress, load-failure, Retry, Ready, or startup callback
  // can run after the loss (REQ-134, PVS-WEB-001).
  const surface: DeliveryStateSurface = {
    showStartup(): void {
      if (terminal) {
        return
      }
      deliveryState = 'Startup'
      options.surface.showStartup()
    },
    showUnsupported(message: string): void {
      if (terminal) {
        return
      }
      deliveryState = 'Unsupported'
      options.surface.showUnsupported(message)
    },
    showLoadingScene(): void {
      if (terminal) {
        return
      }
      deliveryState = 'Loading Scene'
      options.surface.showLoadingScene()
    },
    showProgress(progress: SceneLoadProgress): void {
      if (terminal) {
        return
      }
      options.surface.showProgress(progress)
    },
    showLoadFailed(message: string, retry: () => void): void {
      if (terminal) {
        return
      }
      deliveryState = 'Load failed'
      options.surface.showLoadFailed(message, retry)
    },
    showReady(): void {
      if (terminal) {
        return
      }
      deliveryState = 'Ready'
      options.surface.showReady()
    },
    showDeviceLost(message: string, reload: () => void): void {
      // The coordinator drives the terminal state on the underlying
      // surface directly; a call routed through the guarded surface is
      // forwarded while the coordinator is not terminal and ignored
      // after.
      if (terminal) {
        return
      }
      options.surface.showDeviceLost(message, reload)
    },
    mountCanvas(canvas: HTMLCanvasElement): void {
      if (terminal) {
        return
      }
      options.surface.mountCanvas(canvas)
    },
  }

  // Watch the exact device's own `lost` promise. A resolved loss enters
  // the terminal `Device lost` state only while the product is in the
  // governed `Loading Scene` or `Ready` states (REQ-134, PVS-WEB-001).
  void options.device.lost.then(() => {
    if (terminal) {
      return
    }
    if (deliveryState !== 'Loading Scene' && deliveryState !== 'Ready') {
      return
    }

    // Enter the terminal state before any further delivery operation: the
    // guarded surface swallows every later callback from here on.
    terminal = true

    // Terminal-stop the Browser Runtime before another tick (REQ-138,
    // PVS-WEB-005): the stop cancels the pending frame, discards the frame
    // debt, closes the gameplay-input gate, and clears the presenter slot,
    // so no hidden tick can be dispatched and no frame can be presented
    // while no frame can be shown.
    options.runtime.terminalStop()

    // Show one readable semantic failure and one Reload action; the
    // terminal state exposes no other action (REQ-134, PVS-WEB-001).
    options.surface.showDeviceLost(DEVICE_LOST_MESSAGE, options.reload)
  })

  return {
    get lost(): boolean {
      return terminal
    },
    surface,
  }
}
