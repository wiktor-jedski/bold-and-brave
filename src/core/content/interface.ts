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

/**
 * The authored presentation content of one glTF Scene asset (ARCH-016,
 * PVS-WEB-003, REQ-136).
 *
 * The asset is a committed authored glTF file that the built product
 * downloads by `source` and decodes with `GLTFLoader` (ARCH-009). The
 * `source` reference is the production fetch path of the same committed
 * file the content-contract check resolves, so the authored asset and the
 * loaded asset are never two copies (REQ-136).
 */
export interface SceneAssetContent {
  /** The stable build-internal asset ID. */
  readonly id: string
  /** The authored asset kind; the slice authors glTF assets. */
  readonly kind: 'gltf'
  /** The production fetch reference of the committed authored glTF file. */
  readonly source: string
}

/**
 * The authored manifest of one Scene (ARCH-016, PVS-WEB-003, REQ-136).
 *
 * A Scene is a separately loaded 3D space representing a settlement,
 * battlefield, camp, or other notable location entered from the Overworld
 * (CONTEXT.md). The startup manifest authors the one initial Scene
 * `poc-overworld` and its glTF environment asset
 * `poc-overworld-environment`; the Scene loader reads the manifest through
 * the public core catalog and loads its assets by Scene (REQ-136).
 */
export interface SceneContent {
  /** The stable build-internal Scene ID. */
  readonly id: string
  /** The player-facing name of the Scene. */
  readonly name: string
  /** The authored assets of the Scene. */
  readonly assets: readonly SceneAssetContent[]
}

/**
 * A 3D world position in platform-neutral production world units (ARCH-016).
 *
 * One world unit maps directly to one glTF and Three.js scene unit (1:1 scale).
 */
export interface WorldPosition {
  /** The X coordinate in production world units. */
  readonly x: number
  /** The Y coordinate in production world units (height; 0 for ground level). */
  readonly y: number
  /** The Z coordinate in production world units. */
  readonly z: number
}

/**
 * Authored bounding box of traversable ground on the Overworld (ARCH-015, ARCH-016).
 *
 * Navigation anchors and click-to-move candidate targets must belong to
 * traversable ground.
 */
export interface TraversableGround {
  /** Minimum X boundary in production world units. */
  readonly minX: number
  /** Maximum X boundary in production world units. */
  readonly maxX: number
  /** Minimum Z boundary in production world units. */
  readonly minZ: number
  /** Maximum Z boundary in production world units. */
  readonly maxZ: number
}

/**
 * An authored navigation anchor on the Overworld (ARCH-014, ARCH-015, ARCH-016, REQ-117).
 *
 * Authored anchors provide deterministic waypoints for local steering behind
 * the platform-neutral Navigation Port.
 */
export interface NavigationAnchorContent {
  /** The stable build-internal anchor ID. */
  readonly id: string
  /** The anchor position in production world units. */
  readonly position: WorldPosition
}

/**
 * The entry boundary of an Overworld destination (ARCH-003, ARCH-016, REQ-017, REQ-021).
 *
 * Crossing this boundary triggers transition into the destination Scene.
 */
export interface OverworldEntryBoundary {
  /** The center position of the entry boundary in production world units. */
  readonly position: WorldPosition
  /** The entry radius in production world units. */
  readonly radius: number
}

/**
 * The authored definition of one Overworld destination (ARCH-016, REQ-035).
 *
 * Destinations are stored as a collection in the catalog so adding a second
 * location needs new authored data rather than a travel-rule change (PVS-FLW-022).
 */
export interface OverworldDestinationContent {
  /** The stable build-internal destination ID. */
  readonly id: string
  /** The player-facing name of the destination. */
  readonly name: string
  /** The target Scene ID loaded when entering this destination. */
  readonly targetSceneId: string
  /** The destination position in production world units. */
  readonly position: WorldPosition
  /** The entry boundary of the destination. */
  readonly entryBoundary: OverworldEntryBoundary
}

/**
 * Authored normal travel tuning values for the Overworld (ARCH-016, REQ-017, REQ-018, REQ-082).
 */
export interface OverworldTravelContent {
  /** Normal travel speed in world units per Overworld day (3.0). */
  readonly speedWorldUnitsPerDay: number
  /** Real-time seconds per Overworld hour at 1× speed (5.0). */
  readonly realSecondsPerOverworldHour: number
  /** Overworld hours in one Overworld day (24). */
  readonly hoursPerOverworldDay: number
  /** Provisions consumed per Band member per moving Overworld day (0.2). */
  readonly provisionsPerMemberPerDay: number
}

/**
 * Authored top-down strategic camera bounds and defaults (ARCH-016, PVS-FLW-002).
 *
 * Keeps the camera view top-down, oblique, and without a visible horizon while
 * allowing bounded rotation and zoom.
 */
export interface OverworldCameraBoundsContent {
  /** Minimum camera distance (maximum zoom-in) in production world units. */
  readonly minDistance: number
  /** Maximum camera distance (maximum zoom-out) in production world units. */
  readonly maxDistance: number
  /** Default camera distance in production world units. */
  readonly defaultDistance: number
  /** Minimum polar / pitch angle in radians (top-down limit). */
  readonly minPitch: number
  /** Maximum polar / pitch angle in radians (oblique limit). */
  readonly maxPitch: number
  /** Default polar / pitch angle in radians. */
  readonly defaultPitch: number
  /** Camera field of view in degrees. */
  readonly fov: number
}

/**
 * Stable presentation node and animation clip IDs in the Overworld glTF asset (ARCH-016, REQ-170).
 */
export interface OverworldPresentationNodesContent {
  /** The single Band-pawn node name representing the whole Band (PVS-FLW-002). */
  readonly bandPawnNodeId: string
  /** The idle animation clip name. */
  readonly idleAnimationClip: string
  /** The travel animation clip name. */
  readonly travelAnimationClip: string
  /** The terrain node name. */
  readonly terrainNodeId: string
  /** The settlement entry landmark node name. */
  readonly settlementLandmarkNodeId: string
}

/**
 * The authored Overworld content record (ARCH-003, ARCH-014, ARCH-015, ARCH-016).
 *
 * Defines the shared 1:1 production scale, stable location and destination
 * IDs, the settlement entry boundary, the exact new-campaign position,
 * traversable ground, authored navigation anchors, normal travel values,
 * camera bounds, and presentation node IDs.
 */
export interface OverworldContent {
  /** The stable build-internal Overworld Scene / location ID (`poc-overworld`). */
  readonly id: string
  /** The player-facing name of the Overworld. */
  readonly name: string
  /** The shared 1:1 production scale (1.0). */
  readonly productionScale: number
  /** The exact new-campaign starting position. */
  readonly startPosition: WorldPosition
  /** Normal travel tuning values. */
  readonly travel: OverworldTravelContent
  /** Authored traversable ground bounds. */
  readonly traversableGround: TraversableGround
  /** Authored navigation anchors. */
  readonly navigationAnchors: readonly NavigationAnchorContent[]
  /** Authored destination collection. */
  readonly destinations: readonly OverworldDestinationContent[]
  /** Authored camera bounds and defaults. */
  readonly cameraBounds: OverworldCameraBoundsContent
  /** Presentation node and animation IDs. */
  readonly presentationNodes: OverworldPresentationNodesContent
}
