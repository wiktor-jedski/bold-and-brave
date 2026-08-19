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
 * Browser bootstrap dependencies point toward the ports the core owns; the
 * composition root imports no private Simulation implementation file.
 */
import { APPLICATION_NAME } from '../core'
import { createSimulation } from '../core/simulation'
import type { Simulation, SimulationProjection } from '../core/simulation'

/** The composed browser application surface. */
export interface BrowserApplication {
  /** The application name presented by the browser surface. */
  readonly name: string
  /** The authoritative Simulation created at startup (ARCH-001). */
  readonly simulation: Simulation
  /** The immutable initial projection read at startup (ARCH-003). */
  readonly initialProjection: SimulationProjection
}

/**
 * Compose the browser application.
 *
 * `create` is injectable so the integration test can observe the real
 * core-owned factory call; production always uses the default factory, so
 * this function remains the only production creation site for `Simulation`.
 */
export function createBrowserApplication(
  create: () => Simulation = createSimulation,
): BrowserApplication {
  const simulation = create()

  return {
    name: APPLICATION_NAME,
    simulation,
    initialProjection: simulation.readProjection(),
  }
}
