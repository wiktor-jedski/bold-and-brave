import { INITIAL_AGENTS, INITIAL_BAND, INITIAL_COIN, INITIAL_PROVISIONS } from '../content'
import type { AgentContent, BandMemberContent } from '../content'
import type { AgentRecord, BandMemberRecord, Simulation, SimulationProjection } from './interface'

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
 * Copy one authored Band-member content record into a fresh Band-member
 * record.
 *
 * Every new Simulation copies the authored identity into its own private
 * state so no record reference is shared with the catalog or with any other
 * Simulation (ARCH-003, ARCH-016). The authored join cost is not projected:
 * only the identity is campaign state that callers read (ARCH-002, REQ-077).
 */
function copyBandMemberContent(member: BandMemberContent): BandMemberRecord {
  return {
    id: member.id,
    name: member.name,
  }
}

/**
 * Create the authoritative Simulation (ARCH-001).
 *
 * The Simulation tick, the Agent relationship state, the Band membership,
 * and the initial resources are privately owned by the closure created here.
 * A new campaign starts with exactly the two named Agents from the Typed
 * Content Catalog — Village Elder (`poc-contract-giver`) and Varek
 * (`poc-enemy-agent`) — copied into private state (REQ-167, PVS-REL-001);
 * no relationship record exists for Miro, a generic settlement resident, or
 * any other character. The Band starts with the player character and Miro
 * (`poc-companion`) as the one fixed Companion (REQ-077, PVS-PRP-001); Coin
 * starts at 100 and Provisions at 10.0. Miro's fixed 0-Coin cost means no
 * Coin deduction is applied when Miro joins the new campaign.
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
  // Private Band membership: each new Simulation owns a copy of the
  // authored identities, never a reference into the catalog.
  const band: BandMemberRecord[] = INITIAL_BAND.map(copyBandMemberContent)
  // Private initial resources (REQ-077): Miro's 0-Coin cost means Coin
  // stays at its initial 100 when the new campaign starts.
  let coin = INITIAL_COIN
  let provisions = INITIAL_PROVISIONS

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
        band: Object.freeze(
          band.map((member) => Object.freeze({ ...member })),
        ),
        coin,
        provisions,
      })
    },
    advanceTick(): void {
      tick += 1
    },
  }
}
