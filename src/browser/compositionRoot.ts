/**
 * The browser composition root (ARCH-024).
 *
 * This module is the only production creation site for the core-owned
 * `Simulation` (ARCH-001, REQ-111). It builds the Simulation through the
 * public core-owned interface (ARCH-002) and reads the immutable initial
 * projection. The browser receives the public Simulation seam whose only
 * state-changing operation is the single fixed-tick `advanceTick`
 * (REQ-113); no scenario-only state mutator and no direct gameplay state
 * access exist (REQ-121).
 *
 * The composition root also creates the Browser Runtime (ARCH-006) bound to
 * that same single Simulation and to a `requestAnimationFrame`-style frame
 * scheduler. Production uses the `window.requestAnimationFrame` scheduler
 * (ARCH-024); tests inject a controlled scheduler. Startup starts the one
 * runtime frame loop (ARCH-008); no second Simulation, timing loop, or
 * gameplay state exists (REQ-113).
 *
 * The composition root also exposes the Three.js WebGPU backend gate
 * (ARCH-009). The backend gate is the renderer part of the Phase 6 startup
 * sequence: it creates the `WebGPURenderer` with the exact device the
 * capability gate selects, waits for initialization, and accepts the
 * renderer only when its backend identifies itself as WebGPU (REQ-011,
 * REQ-134, REQ-135). Startup wiring invokes the gate after the capability
 * gate; this production reference keeps the Three.js WebGPU renderer in
 * the production bundle, so the built product carries the WebGPU-only
 * rendering dependency and no WebGL fallback path (REQ-011, PVS-SCP-006).
 *
 * Browser bootstrap dependencies point toward the ports the core owns; the
 * composition root imports no private Simulation implementation file.
 */
import { APPLICATION_NAME } from '../core'
import { createSimulation } from '../core/simulation'
import type { Simulation, SimulationProjection } from '../core/simulation'
import { createBrowserRuntime } from './runtime'
import type { BrowserRuntime, FrameScheduler } from './runtime'
import { runWebGPUBackendGate } from './presentation'

/** The production scheduler bound to `window.requestAnimationFrame` (ARCH-024). */
const productionFrameScheduler: FrameScheduler = {
  requestFrame(callback) {
    return window.requestAnimationFrame(callback)
  },
  cancelFrame(handle) {
    window.cancelAnimationFrame(handle)
  },
}

/** The composed browser application surface. */
export interface BrowserApplication {
  /** The application name presented by the browser surface. */
  readonly name: string
  /** The authoritative Simulation created at startup (ARCH-001). */
  readonly simulation: Simulation
  /** The immutable initial projection read at startup (ARCH-003). */
  readonly initialProjection: SimulationProjection
  /**
   * The Browser Runtime timing loop bound to `simulation` (ARCH-006).
   *
   * Startup starts the loop; tests drive it through an injected controlled
   * scheduler. Only the loop lifecycle is exposed — nothing more.
   */
  readonly runtime: BrowserRuntime
  /**
   * The Three.js WebGPU backend gate (ARCH-009, REQ-011, REQ-134).
   *
   * Startup runs this gate with the exact device the capability gate
   * selected; it returns one typed, readable WebGPU-backend `Unsupported`
   * result or the initialized WebGPU renderer. The reference keeps the
   * Three.js WebGPU renderer in the production bundle (REQ-011,
   * PVS-SCP-006).
   */
  readonly runWebGPUBackendGate: typeof runWebGPUBackendGate
}

/**
 * Compose the browser application.
 *
 * `create` is injectable so the integration test can observe the real
 * core-owned factory call; production always uses the default factory, so
 * this function remains the only production creation site for `Simulation`.
 *
 * `scheduler` is injectable so the integration test can drive the one
 * runtime frame loop with controlled timestamps; production always uses the
 * default `window.requestAnimationFrame` scheduler (ARCH-024).
 */
export function createBrowserApplication(
  create: () => Simulation = createSimulation,
  scheduler: FrameScheduler = productionFrameScheduler,
): BrowserApplication {
  const simulation = create()
  const runtime = createBrowserRuntime(simulation, scheduler)

  return {
    name: APPLICATION_NAME,
    simulation,
    initialProjection: simulation.readProjection(),
    runtime,
    runWebGPUBackendGate,
  }
}
