/**
 * The platform-neutral core project.
 *
 * The core owns no browser, DOM, Three.js, Web Audio, or IndexedDB type.
 * It is the seam that later phases extend with the authoritative
 * Simulation module.
 */
export const APPLICATION_NAME = 'Bold and Brave'

/**
 * The read-only Simulation output type, re-exported from the neutral core
 * root (ARCH-002, REQ-121).
 *
 * The Three.js Presentation Adapter (ARCH-009) consumes the immutable
 * projection value that the Browser Runtime reads after each fixed-tick
 * batch (ARCH-008); the adapter must have no import edge to the Simulation
 * module — not even the public entry — so it can never reach the factory
 * or the single `advanceTick` write operation (REQ-118, PVS-ARC-008). This
 * type-only re-export gives the adapter the public, deeply readonly
 * projection contract through the neutral core facade instead.
 */
export type { SimulationProjection } from './simulation'
