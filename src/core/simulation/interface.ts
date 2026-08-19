/**
 * Public contract of the core-owned Simulation module (ARCH-001, ARCH-002).
 *
 * The interface contains no browser, DOM, Three.js, Web Audio, or IndexedDB
 * type, so platform-neutral callers can depend on it (REQ-121).
 */

/** Read-only view of the authoritative Simulation state (ARCH-003). */
export interface SimulationProjection {
  /** The Simulation tick of the projected state. */
  readonly tick: number
}

/** The only external gameplay seam for browser and scenario callers (ARCH-002). */
export interface Simulation {
  /** Read the current immutable projection. */
  readProjection(): SimulationProjection

  /**
   * Advance the private Simulation tick by exactly one fixed tick.
   *
   * This is the only external way to advance Simulation time (REQ-113,
   * PVS-ARC-003): the Browser Runtime calls it once per due 60 Hz interval
   * (ARCH-005) and the Scenario Harness calls it once per exact requested
   * tick (ARCH-025). Each call advances exactly one tick; no scenario-only
   * state mutator exists.
   */
  advanceTick(): void
}
