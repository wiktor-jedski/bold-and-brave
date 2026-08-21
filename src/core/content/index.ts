/**
 * The core-owned Typed Content Catalog module (ARCH-016).
 *
 * This entry is the public surface of the module: the deeply frozen authored
 * Agent and initial-Band content, the initial resource values, and the types
 * of that content. The catalog contains no mutable campaign state and no
 * runtime-generated content.
 */
export {
  INITIAL_AGENTS,
  PLAYER_CHARACTER,
  MIRO,
  INITIAL_BAND,
  INITIAL_COIN,
  INITIAL_PROVISIONS,
  STARTUP_SCENE,
  SCENES,
} from './catalog'
export type {
  AgentRole,
  AgentFate,
  Disposition,
  Grievance,
  AgentContent,
  BandMemberContent,
  SceneAssetContent,
  SceneContent,
} from './interface'
