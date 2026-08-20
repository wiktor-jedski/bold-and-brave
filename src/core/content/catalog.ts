import type { AgentContent, BandMemberContent } from './interface'

/**
 * The initial named-Agent relationship content of a new campaign
 * (ARCH-016, PVS-REL-001, REQ-167).
 *
 * The relationship model creates exactly these two persistent named Agents.
 * Miro and generic settlement residents do not enter this model. The
 * catalog is deeply frozen so the authored content stays immutable; each new
 * Simulation copies this content into its own private state instead of
 * sharing a record or list reference (ARCH-003).
 */
export const INITIAL_AGENTS: readonly AgentContent[] = Object.freeze([
  Object.freeze({
    id: 'poc-contract-giver',
    name: 'Village Elder',
    role: 'Contract-giver Agent',
    fate: 'Active',
    disposition: 'Neutral',
    grievances: Object.freeze([]),
  }),
  Object.freeze({
    id: 'poc-enemy-agent',
    name: 'Varek',
    role: 'Enemy Agent',
    fate: 'Active',
    disposition: 'Hostile',
    grievances: Object.freeze([]),
  }),
])

/**
 * The authored identity of the player character (ARCH-016, PVS-PRP-001,
 * REQ-077).
 *
 * The player character leads the Band. A new campaign starts with the
 * player character in the Band at no Coin cost.
 */
export const PLAYER_CHARACTER: BandMemberContent = Object.freeze({
  id: 'poc-player-character',
  name: 'Player Character',
  costCoin: 0,
})

/**
 * The authored identity and fixed join cost of Miro, the one fixed
 * Companion (ARCH-016, PVS-PRP-001, REQ-077).
 *
 * Miro (`poc-companion`) joins the new campaign as the fixed Companion for
 * 0 Coin, so no Coin deduction is applied when Miro joins.
 */
export const MIRO: BandMemberContent = Object.freeze({
  id: 'poc-companion',
  name: 'Miro',
  costCoin: 0,
})

/**
 * The initial Band membership of a new campaign (ARCH-016, PVS-PRP-001,
 * REQ-077).
 *
 * The Band starts with exactly the player character and Miro
 * (`poc-companion`), the one fixed Companion. The catalog is deeply frozen
 * so the authored content stays immutable; each new Simulation copies this
 * content into its own private state instead of sharing a record reference
 * (ARCH-003).
 */
export const INITIAL_BAND: readonly BandMemberContent[] = Object.freeze([
  PLAYER_CHARACTER,
  MIRO,
])

/** The initial Coin of a new campaign: 100 (PVS-PRP-001, REQ-077). */
export const INITIAL_COIN = 100

/** The initial Provisions of a new campaign: 10.0 (PVS-PRP-001, REQ-077). */
export const INITIAL_PROVISIONS = 10.0
