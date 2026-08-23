import type {
  AgentContent,
  BandMemberContent,
  NavigationAnchorContent,
  OverworldCameraBoundsContent,
  OverworldContent,
  OverworldDestinationContent,
  OverworldPresentationNodesContent,
  OverworldTravelContent,
  SceneContent,
  TraversableGround,
} from './interface'

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

/**
 * The authored normal travel tuning values for Overworld travel (ARCH-016,
 * REQ-017, REQ-018, REQ-082, PVS-FLW-004, PVS-PRP-006).
 *
 * Normal travel speed is 3.0 world units per Overworld day. At 1× speed,
 * one Overworld hour takes 5.0 real-time seconds (120 seconds per Overworld
 * day). Moving travel consumes 0.2 Provisions per Band member per Overworld
 * day.
 */
export const OVERWORLD_TRAVEL: OverworldTravelContent = Object.freeze({
  speedWorldUnitsPerDay: 3.0,
  realSecondsPerOverworldHour: 5.0,
  hoursPerOverworldDay: 24,
  provisionsPerMemberPerDay: 0.2,
})

/**
 * The authored traversable ground bounds on the Overworld (ARCH-015, ARCH-016).
 *
 * Defines the rectangular area of navigable moorland encompassing the start
 * position, the route, and the settlement destination.
 */
export const OVERWORLD_TRAVERSABLE_GROUND: TraversableGround = Object.freeze({
  minX: -4.0,
  maxX: 4.0,
  minZ: -2.0,
  maxZ: 4.0,
})

/**
 * The authored navigation anchors on the Overworld (ARCH-014, ARCH-015, ARCH-016, REQ-117).
 *
 * Authored waypoints for deterministic local steering behind the Navigation
 * Port. All anchors belong to traversable ground.
 */
export const OVERWORLD_NAVIGATION_ANCHORS: readonly NavigationAnchorContent[] = Object.freeze([
  Object.freeze({
    id: 'poc-anchor-start',
    position: Object.freeze({ x: 0, y: 0, z: 1.5 }),
  }),
  Object.freeze({
    id: 'poc-anchor-mid',
    position: Object.freeze({ x: 0, y: 0, z: 0.75 }),
  }),
  Object.freeze({
    id: 'poc-anchor-settlement-entry',
    position: Object.freeze({ x: 0, y: 0, z: 0 }),
  }),
])

/**
 * The authored Overworld destinations collection (ARCH-016, REQ-035, PVS-FLW-022).
 *
 * Stored as a collection so adding a second location needs new data, not a
 * new travel rule.
 */
export const OVERWORLD_DESTINATIONS: readonly OverworldDestinationContent[] = Object.freeze([
  Object.freeze({
    id: 'poc-settlement',
    name: 'Frontier Settlement',
    targetSceneId: 'poc-settlement',
    position: Object.freeze({ x: 0, y: 0, z: 0 }),
    entryBoundary: Object.freeze({
      position: Object.freeze({ x: 0, y: 0, z: 0 }),
      radius: 0.25,
    }),
  }),
])

/**
 * Authored top-down strategic camera bounds and defaults (ARCH-016, PVS-FLW-002).
 */
export const OVERWORLD_CAMERA_BOUNDS: OverworldCameraBoundsContent = Object.freeze({
  minDistance: 3.0,
  maxDistance: 8.0,
  defaultDistance: 5.0,
  minPitch: 0.785398,
  maxPitch: 1.308997,
  defaultPitch: 1.047198,
  fov: 45,
})

/**
 * Authored presentation node and animation clip IDs in the Overworld glTF asset (ARCH-016, REQ-170).
 */
export const OVERWORLD_PRESENTATION_NODES: OverworldPresentationNodesContent = Object.freeze({
  bandPawnNodeId: 'poc-band-pawn',
  idleAnimationClip: 'poc-band-idle',
  travelAnimationClip: 'poc-band-travel',
  terrainNodeId: 'poc-overworld-terrain',
  settlementLandmarkNodeId: 'poc-settlement-landmark',
})

/**
 * The one authored Overworld content record (ARCH-003, ARCH-014, ARCH-015,
 * ARCH-016, REQ-017, REQ-035, REQ-117, PVS-FLW-001, PVS-FLW-022).
 *
 * Defines the shared 1:1 production scale, stable location and destination
 * IDs, the settlement entry boundary, the exact new-campaign position,
 * traversable ground, authored navigation anchors, normal travel values,
 * camera bounds, and presentation node IDs.
 *
 * The start position (0, 0, 1.5) is exactly 1.5 world units and 0.5
 * Overworld day (at 3.0 world units per day) from the settlement entry
 * boundary (0, 0, 0).
 */
export const OVERWORLD: OverworldContent = Object.freeze({
  id: 'poc-overworld',
  name: 'Overworld',
  productionScale: 1.0,
  startPosition: Object.freeze({ x: 0, y: 0, z: 1.5 }),
  travel: OVERWORLD_TRAVEL,
  traversableGround: OVERWORLD_TRAVERSABLE_GROUND,
  navigationAnchors: OVERWORLD_NAVIGATION_ANCHORS,
  destinations: OVERWORLD_DESTINATIONS,
  cameraBounds: OVERWORLD_CAMERA_BOUNDS,
  presentationNodes: OVERWORLD_PRESENTATION_NODES,
})
