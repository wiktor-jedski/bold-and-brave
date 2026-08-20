/**
 * The startup delivery-state surface (ARCH-010, ARCH-023, ARCH-024,
 * REQ-134, PVS-WEB-001).
 *
 * This module presents the governed Browser Delivery State through semantic
 * DOM: the state element stays at `Startup` while the ordered startup
 * checks run, shows one specific semantic `Unsupported` alert for the first
 * failed check, and enters `Loading Scene` only after every check passes.
 * The state text and the alert text are the only product statements about
 * the delivery state; the startup orchestration drives them through the
 * `DeliveryStateSurface` seam, so tests can inject a recording surface and
 * the built product observes the same transitions.
 *
 * The module also owns the production Scene-loading handoff seam
 * (REQ-134, PVS-WEB-001): the composition root invokes the handoff with the
 * initialized WebGPU renderer only after every startup gate passes. Phase 6
 * stops at the `Loading Scene` handoff — the handoff enters that delivery
 * state with the renderer; Phase 7 attaches Scene asset loading to this
 * seam. A failed gate invokes no handoff, so no asset loading can follow a
 * failure (REQ-134, PVS-WEB-001).
 */
import type { PresentationRenderer } from '../presentation'

/**
 * The delivery-state presentation driven by startup (REQ-134, PVS-WEB-001).
 *
 * The surface is the only DOM seam of the ordered Browser Delivery State:
 * it shows `Startup` while checks run, shows one specific semantic
 * `Unsupported` alert for the first failed check, and shows `Loading Scene`
 * only after every check passes. Production binds these transitions to real
 * semantic DOM; tests inject a recording surface to prove the exact ordered
 * state trace.
 */
export interface DeliveryStateSurface {
  /** Keep the delivery state at `Startup` while the checks run (REQ-134). */
  showStartup(): void
  /**
   * Show one specific semantic `Unsupported` alert for the first failed
   * check, with the exact readable message of that check (REQ-134,
   * PVS-WEB-001).
   */
  showUnsupported(message: string): void
  /** Enter `Loading Scene` only after every check passes (REQ-134, PVS-WEB-001). */
  showLoadingScene(): void
}

/**
 * The Scene-loading handoff of the next delivery state (REQ-134,
 * PVS-WEB-001).
 *
 * Startup invokes the handoff with the initialized Three.js WebGPU renderer
 * only after every gate passes and never after a failure, so a failed gate
 * cannot run a later delivery operation. Phase 6 stops at the `Loading
 * Scene` handoff: the production handoff enters that state; Phase 7
 * attaches download, decode, GPU upload, and readiness progress to the same
 * seam.
 */
export interface SceneLoadingHandoff {
  /** Begin the Scene load with the initialized renderer. */
  (renderer: PresentationRenderer): void
}

/**
 * Build the production Scene-loading handoff (REQ-134, PVS-WEB-001).
 *
 * The production handoff enters the `Loading Scene` delivery state with
 * the initialized renderer — the observable Phase 6 success result. Phase 7
 * extends this seam with Scene asset loading; until then the handoff owns
 * the state transition and no asset request can occur (PVS-WEB-001).
 */
export function createSceneLoadingHandoff(surface: DeliveryStateSurface): SceneLoadingHandoff {
  return (_renderer: PresentationRenderer): void => {
    surface.showLoadingScene()
  }
}

/**
 * Render the delivery-state surface into `host` as semantic DOM (ARCH-010,
 * REQ-134, PVS-WEB-001).
 *
 * The surface adds one live status region that carries the exact delivery
 * state text (`Startup`, `Unsupported`, or `Loading Scene`) and, on a
 * failed check, one semantic `alert` region containing the exact readable
 * message of that check. The application name and the single support
 * table are owned by the startup entry; this presentation adds no second
 * Simulation, timing loop, or gameplay state (REQ-113).
 */
export function renderDeliveryState(host: HTMLElement): DeliveryStateSurface {
  const state = document.createElement('div')
  state.id = 'delivery-state'
  state.setAttribute('role', 'status')
  state.textContent = 'Startup'
  host.append(state)

  let alert: HTMLElement | null = null

  return {
    showStartup(): void {
      state.textContent = 'Startup'
      if (alert !== null) {
        alert.remove()
        alert = null
      }
    },
    showUnsupported(message: string): void {
      state.textContent = 'Unsupported'
      if (alert === null) {
        alert = document.createElement('div')
        alert.setAttribute('role', 'alert')
        host.append(alert)
      }
      alert.textContent = message
    },
    showLoadingScene(): void {
      state.textContent = 'Loading Scene'
      if (alert !== null) {
        alert.remove()
        alert = null
      }
    },
  }
}
