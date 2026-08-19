/**
 * The core-owned Simulation module (ARCH-001, ARCH-002, ARCH-003).
 *
 * This entry is the only public surface of the module: the `createSimulation`
 * factory and the types of the interface it returns. The factory
 * implementation and the state it owns stay private so that the external
 * seam remains deep.
 */
export { createSimulation } from './implementation'
export type { Simulation, SimulationProjection } from './interface'
