import { INITIAL_AGENTS } from '../content'
import type { AgentContent } from '../content'
import type { AgentRecord, Simulation, SimulationProjection } from './interface'

/** The Simulation starts at tick 0. */
const INITIAL_TICK = 0

/**
 * Copy one authored Agent content record into a fresh Agent record.
 *
 * Every new Simulation copies the catalog content into its own private
 * state so no record or Grievance list reference is shared with the catalog
 * or with any other Simulation (ARCH-003, ARCH-016). Only the private state
 * is mutable; callers receive only deep-immutable projection data
 * (ARCH-002, REQ-167).
 */
function copyAgentContent(agent: AgentContent): AgentRecord {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    fate: agent.fate,
    disposition: agent.disposition,
    grievances: [...agent.grievances],
  }
}

/**
 * Create the authoritative Simulation (ARCH-001).
 *
 * The Simulation tick and the Agent relationship state are privately owned
 * by the closure created here. A new campaign starts with exactly the two
 * named Agents from the Typed Content Catalog — Village Elder
 * (`poc-contract-giver`) and Varek (`poc-enemy-agent`) — copied into private
 * state (REQ-167, PVS-REL-001); no relationship record exists for Miro, a
 * generic settlement resident, or any other character.
 *
 * `advanceTick` is the only external way to advance the private Simulation
 * tick (ARCH-002, REQ-113): each call moves the private tick forward by
 * exactly one fixed 60 Hz tick (ARCH-005). Callers receive only a deeply
 * frozen readonly projection, never mutable state (ARCH-003). This factory
 * is exposed to callers only through the public module entry `./index` so
 * that the external seam stays deep.
 */
export function createSimulation(): Simulation {
  let tick = INITIAL_TICK
  // Private authoritative state (ARCH-003): each new Simulation owns a copy
  // of the authored Agent content, never a reference into the catalog.
  const agents: AgentRecord[] = INITIAL_AGENTS.map(copyAgentContent)

  return {
    readProjection(): SimulationProjection {
      return Object.freeze({
        tick,
        agents: Object.freeze(
          agents.map((agent) =>
            Object.freeze({
              ...agent,
              grievances: Object.freeze([...agent.grievances]),
            }),
          ),
        ),
      })
    },
    advanceTick(): void {
      tick += 1
    },
  }
}
