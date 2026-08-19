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
}
