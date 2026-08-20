import type { Simulation, SimulationProjection } from './interface'

/** The Simulation starts at tick 0. */
const INITIAL_TICK = 0

/**
 * Create the authoritative Simulation (ARCH-001).
 *
 * The Simulation tick is privately owned by the closure created here.
 * `advanceTick` is the only external way to advance it (ARCH-002, REQ-113):
 * each call moves the private tick forward by exactly one fixed 60 Hz tick
 * (ARCH-005). Callers receive only a frozen readonly projection, never
 * mutable state (ARCH-003). This factory is exposed to callers only through
 * the public module entry `./index` so that the external seam stays deep.
 */
export function createSimulation(): Simulation {
  let tick = INITIAL_TICK

  return {
    readProjection(): SimulationProjection {
      return Object.freeze({ tick })
    },
    advanceTick(): void {
      tick += 1
    },
  }
}
