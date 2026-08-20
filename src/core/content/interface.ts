/**
 * Read-only typed content of the Typed Content Catalog (ARCH-016).
 *
 * The catalog defines immutable authored gameplay and presentation content:
 * Agents, Troops, weapons, Feats, settlement and battlefield data, Local
 * Contract data, canonical text, asset identifiers, navigation anchors, and
 * authored tuning values. IDs are stable inside a build. The catalog
 * contains no mutable campaign state and no runtime-generated content.
 *
 * These types are platform-neutral (REQ-121): the catalog exposes no
 * browser, DOM, Three.js, Web Audio, or IndexedDB type.
 */

/** Fixed authored Agent role values (PVS-REL-001). */
export type AgentRole = 'Contract-giver Agent' | 'Enemy Agent'

/**
 * Agent fate: the persistent post-battle condition of a named Agent
 * (`Active`, `Captive`, or `Executed`). Only an Active Agent has a current
 * Disposition (CONTEXT.md).
 */
export type AgentFate = 'Active' | 'Captive' | 'Executed'

/**
 * Disposition: an Agent's broad current stance toward the player character
 * or Band — `Friendly`, `Neutral`, or `Hostile` — expressed through behavior
 * and interaction rather than a raw relationship score (CONTEXT.md).
 */
export type Disposition = 'Friendly' | 'Neutral' | 'Hostile'

/**
 * Grievance: a persistent remembered wrong or debt involving an Agent,
 * represented by a fixed cause, that can explain and influence that Agent's
 * Disposition and reactions (CONTEXT.md).
 */
export interface Grievance {
  /** The fixed cause of the remembered wrong or debt. */
  readonly cause: string
}

/**
 * The authored identity and initial relationship content of one named Agent
 * (ARCH-016, PVS-REL-001).
 *
 * The Agent relationship — the combination of an Agent's Disposition toward
 * the player character or Band and that Agent's active Grievances — belongs
 * to the named Agent rather than to a shared faction or settlement score
 * (CONTEXT.md). A non-Active Agent has no current Disposition.
 */
export interface AgentContent {
  /** The stable build-internal Agent ID. */
  readonly id: string
  /** The player-facing name of the Agent. */
  readonly name: string
  /** The fixed authored Agent role. */
  readonly role: AgentRole
  /** The initial Agent fate. */
  readonly fate: AgentFate
  /** The initial Disposition; absent for a non-Active Agent. */
  readonly disposition: Disposition | null
  /** The initial fixed-set of Grievances. */
  readonly grievances: readonly Grievance[]
}

/**
 * The authored identity and fixed join cost of one initial Band member
 * (ARCH-016, PVS-PRP-001, REQ-077).
 *
 * The Band is the player-led group comprising the player character, any
 * companions, and ordinary troops travelling and fighting together
 * (CONTEXT.md). A new campaign starts with the player character and Miro
 * (`poc-companion`) as the one fixed Companion. Miro's fixed join cost is
 * 0 Coin, so no Coin deduction occurs when Miro joins the new campaign.
 */
export interface BandMemberContent {
  /** The stable build-internal member ID. */
  readonly id: string
  /** The player-facing name of the member. */
  readonly name: string
  /** The fixed Coin cost to add this member to a new campaign. */
  readonly costCoin: number
}
