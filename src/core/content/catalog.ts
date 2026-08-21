import type { AgentContent, BandMemberContent, SceneContent } from './interface'

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

/**
 * The one startup Scene manifest (ARCH-016, PVS-WEB-003, REQ-136).
 *
 * The startup Scene is `poc-overworld` — the simplified strategic map
 * through which the Band travels (CONTEXT.md) — and its one glTF asset
 * `poc-overworld-environment`, a small committed authored asset containing
 * nodes for the initial Band (the player character and Miro) and one
 * animation clip. The Scene loader receives this exact manifest after
 * every startup gate passes and loads its asset by Scene (REQ-136). The
 * manifest is deeply frozen so the authored content stays immutable; the
 * asset reference is the same path the content-contract check resolves to
 * the committed authored glTF file.
 */
export const STARTUP_SCENE: SceneContent = Object.freeze({
  id: 'poc-overworld',
  name: 'Overworld',
  assets: Object.freeze([
    Object.freeze({
      id: 'poc-overworld-environment',
      kind: 'gltf',
      source: 'scenes/poc-overworld/poc-overworld-environment.gltf',
    }),
  ]),
})

/**
 * The authored Scene catalog (ARCH-016).
 *
 * The catalog currently authors the one startup Scene. The content-contract
 * check validates the whole list so Scene and asset IDs stay unique as
 * later phases add settlement and battlefield Scenes.
 */
export const SCENES: readonly SceneContent[] = Object.freeze([STARTUP_SCENE])
