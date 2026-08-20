/**
 * Public contract of the core-owned Simulation module (ARCH-001, ARCH-002).
 *
 * The interface contains no browser, DOM, Three.js, Web Audio, or IndexedDB
 * type, so platform-neutral callers can depend on it (REQ-121).
 */
import type { AgentFate, AgentRole, Disposition, Grievance } from '../content'

/**
 * Deep-immutable projection of one named-Agent relationship record
 * (ARCH-003, REQ-167).
 *
 * The Agent relationship — the combination of an Agent's Disposition toward
 * the player character or Band and that Agent's active Grievances — belongs
 * to the named Agent (CONTEXT.md). A non-Active Agent has no current
 * Disposition.
 */
export interface AgentRecord {
  /** The stable build-internal Agent ID. */
  readonly id: string
  /** The player-facing name of the Agent. */
  readonly name: string
  /** The fixed authored Agent role. */
  readonly role: AgentRole
  /** The Agent fate. */
  readonly fate: AgentFate
  /** The Disposition; absent for a non-Active Agent. */
  readonly disposition: Disposition | null
  /** The active fixed-set of Grievances. */
  readonly grievances: readonly Grievance[]
}

/**
 * Deep-immutable projection of one Band member (ARCH-003, REQ-077).
 *
 * The Band is the player-led group comprising the player character, any
 * companions, and ordinary troops travelling and fighting together
 * (CONTEXT.md). The projected record carries the member identity only; the
 * authored join cost stays private to the Simulation.
 */
export interface BandMemberRecord {
  /** The stable build-internal member ID. */
  readonly id: string
  /** The player-facing name of the member. */
  readonly name: string
}

/** Read-only view of the authoritative Simulation state (ARCH-003). */
export interface SimulationProjection {
  /** The Simulation tick of the projected state. */
  readonly tick: number
  /**
   * The named-Agent relationship records of the campaign (REQ-167).
   *
   * A new campaign projects exactly the two initial named Agents — Village
   * Elder (`poc-contract-giver`) and Varek (`poc-enemy-agent`). No record
   * exists for Miro, a generic settlement resident, or any other character.
   */
  readonly agents: readonly AgentRecord[]
  /**
   * The Band membership of the campaign (REQ-077, PVS-PRP-001).
   *
   * A new campaign starts with exactly the player character and Miro
   * (`poc-companion`), the one fixed Companion, in the Band.
   */
  readonly band: readonly BandMemberRecord[]
  /** The Band's general-purpose money (CONTEXT.md). */
  readonly coin: number
  /** The consumable supplies needed to sustain the Band while travelling (CONTEXT.md). */
  readonly provisions: number
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
