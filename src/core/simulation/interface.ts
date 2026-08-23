/**
 * Public contract of the core-owned Simulation module (ARCH-001, ARCH-002).
 *
 * The interface contains no browser, DOM, Three.js, Web Audio, or IndexedDB
 * type, so platform-neutral callers can depend on it (REQ-121).
 */
import type {
  AgentFate,
  AgentRole,
  Disposition,
  Grievance,
  OverworldContent,
  WorldPosition,
} from '../content'
import type { NavigationPort } from '../navigation'

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

/**
 * The movement state of the Band pawn on the Overworld (ARCH-003, REQ-018, REQ-170).
 *
 * 'idle' when stationary, arrived, or paused; 'travel' when actively moving along a route.
 */
export type MovementState = 'idle' | 'travel'

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
  /**
   * The stable build-internal ID of the current Scene (ARCH-003, REQ-017, REQ-136).
   *
   * A new campaign starts on the Overworld ('poc-overworld').
   */
  readonly scene: string
  /**
   * Authoritative 3D position of the Band pawn on the Overworld (ARCH-003, REQ-017, REQ-018).
   *
   * Starts at the authored Overworld start position (0, 0, 1.5).
   */
  readonly bandPawnPosition: WorldPosition
  /**
   * Current target destination of Overworld travel, or null if stationary (ARCH-003, REQ-018).
   */
  readonly destination: WorldPosition | null
  /**
   * The current movement state of the Band pawn (ARCH-003, REQ-018, REQ-170).
   */
  readonly movementState: MovementState
  /**
   * Whether Overworld movement and time are currently paused (ARCH-003, REQ-019).
   */
  readonly paused: boolean
  /**
   * Elapsed campaign time measured in Overworld days (ARCH-003, REQ-018).
   *
   * Starts at 0 on a new campaign. Advances only while the Band pawn moves.
   * At 1× normal travel speed (3.0 world units per day), 1.5 world units of
   * travel advances elapsed campaign time by exactly 0.5 Overworld day.
   */
  readonly elapsedCampaignTime: number
  /**
   * Accumulated Provisions consumption remainder in Band-member-days (ARCH-003, REQ-083).
   *
   * Moving travel accumulates Band-member-days (member count × elapsed Overworld days moved).
   * For each accumulated 0.5 Band-member-day, 0.1 Provisions is deducted and 0.5 is
   * subtracted from this remainder.
   */
  readonly consumptionRemainder: number
}

/**
 * Command to set an Overworld travel destination (ARCH-002, REQ-018, REQ-112).
 */
export interface SetDestinationCommand {
  readonly kind: 'set-destination'
  readonly targetTick: number
  readonly destination: WorldPosition
}

/**
 * Command to toggle the Overworld pause state (ARCH-002, REQ-019, REQ-112).
 */
export interface TogglePauseCommand {
  readonly kind: 'toggle-pause'
  readonly targetTick: number
}

/**
 * Command to explicitly set the Overworld pause state (ARCH-002, REQ-019, REQ-112).
 */
export interface SetPausedCommand {
  readonly kind: 'set-paused'
  readonly targetTick: number
  readonly paused: boolean
}

/**
 * Command to pause Overworld movement and time (ARCH-002, REQ-019, REQ-112).
 */
export interface PauseCommand {
  readonly kind: 'pause'
  readonly targetTick: number
}

/**
 * Command to resume Overworld movement and time (ARCH-002, REQ-019, REQ-112).
 */
export interface ResumeCommand {
  readonly kind: 'resume'
  readonly targetTick: number
}

/**
 * Typed commands accepted by the Simulation (ARCH-002, REQ-112, REQ-119).
 */
export type SimulationCommand =
  | SetDestinationCommand
  | TogglePauseCommand
  | SetPausedCommand
  | PauseCommand
  | ResumeCommand

/**
 * Typed feedback event for an invalid action or rejected command (ARCH-002, REQ-039).
 */
export interface InvalidActionFeedbackEvent {
  readonly kind: 'invalid-action'
  readonly tick: number
  readonly action: string
  readonly reason: string
  readonly message: string
}

/**
 * Typed feedback events emitted by the Simulation (ARCH-002, REQ-112).
 */
export type SimulationFeedbackEvent = InvalidActionFeedbackEvent

/**
 * Optional dependencies and configuration for creating a Simulation (ARCH-001, ARCH-014).
 */
export interface SimulationOptions {
  /** Injected Navigation Port (ARCH-014, REQ-117). Defaults to AuthoredNavigationAdapter. */
  readonly navigationPort?: NavigationPort
  /** Injected Overworld content (ARCH-016). Defaults to OVERWORLD from catalog. */
  readonly overworld?: OverworldContent
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

  /**
   * Submit one target-tick typed gameplay command (ARCH-002, REQ-112, REQ-119).
   */
  submitCommand(command: SimulationCommand): void

  /**
   * Drain and clear the ordered list of typed feedback events (ARCH-002, REQ-112).
   */
  drainFeedbackEvents(): readonly SimulationFeedbackEvent[]
}
