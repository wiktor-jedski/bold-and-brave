import type { Simulation, SimulationProjection } from './interface'

/** The Simulation starts at tick 0; this phase never advances it. */
const INITIAL_TICK = 0

/**
 * Create the authoritative Simulation (ARCH-001).
 *
 * The Simulation tick is privately owned by the closure created here.
 * Callers receive only a frozen readonly projection, never mutable state
 * (ARCH-003). This factory is exposed to callers only through the public
 * module entry `./index` so that the external seam stays deep.
 */
export function createSimulation(): Simulation {
  let tick = INITIAL_TICK

  return {
    readProjection(): SimulationProjection {
      return Object.freeze({ tick })
    },
  }
}
