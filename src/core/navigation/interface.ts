/**
 * Public contract of the platform-neutral Navigation Port (ARCH-014, REQ-117, REQ-120).
 *
 * The Navigation Port isolates deterministic path and local-steering decisions
 * from gameplay rules. It receives current navigation state, a target, authored
 * traversability data, and the fixed tick, and returns one deterministic
 * steering intent or a typed invalid result without mutating state.
 *
 * These types are platform-neutral (REQ-121): the interface exposes no
 * browser, DOM, Three.js, Web Audio, or IndexedDB type.
 */
import type {
  NavigationAnchorContent,
  OverworldTravelContent,
  TraversableGround,
  WorldPosition,
} from '../content'

/**
 * Current navigation state of an entity navigating the Overworld (ARCH-014).
 */
export interface NavigationState {
  /** The current position in production world units (ARCH-016). */
  readonly position: WorldPosition
}

/**
 * Authored traversability, anchor, and travel tuning data (ARCH-014, ARCH-015, ARCH-016).
 *
 * Consumed by the Navigation Port to determine valid movement, waypoint paths,
 * and travel speeds.
 */
export interface NavigationTraversabilityData {
  /** Authored bounding box of traversable ground (ARCH-015, ARCH-016). */
  readonly traversableGround: TraversableGround
  /** Authored navigation anchors / waypoints (ARCH-014, ARCH-015, ARCH-016, REQ-117). */
  readonly navigationAnchors?: readonly NavigationAnchorContent[]
  /** Optional alias for navigationAnchors. */
  readonly anchors?: readonly NavigationAnchorContent[]
  /** Authored normal travel tuning values (ARCH-016, REQ-017, REQ-018). */
  readonly travel?: OverworldTravelContent
  /** Optional reachability predicate for complex terrain or obstacle barriers. */
  readonly isReachable?: (from: WorldPosition, to: WorldPosition) => boolean
}

/**
 * Navigation query parameters supplied to the Navigation Port (ARCH-014).
 */
export interface NavigationRequest {
  /** Current navigation state of the moving entity. */
  readonly state: NavigationState
  /** Destination or target position in production world units. */
  readonly target: WorldPosition
  /** Authored traversability and anchor data. */
  readonly traversability: NavigationTraversabilityData
  /** Current fixed Simulation tick (ARCH-005). */
  readonly tick: number
  /** Optional override for travel speed in world units per tick. */
  readonly speedWorldUnitsPerTick?: number
}

/**
 * Deterministic steering intent returned for a valid traversable target (ARCH-014, ARCH-015).
 */
export interface SteeringIntent {
  /** Discriminates valid steering intent from invalid results. */
  readonly kind: 'steering-intent'
  /** Whether the current position has arrived at the target (stop condition). */
  readonly arrived: boolean
  /**
   * Deterministic position displacement vector for this fixed tick.
   *
   * Bounded by the travel speed per tick and capped to not overshoot the target.
   * Equals (0, 0, 0) when `arrived` is true.
   */
  readonly step: WorldPosition
  /**
   * Desired movement direction as a unit vector (or (0, 0, 0) when stopped).
   */
  readonly desiredDirection: WorldPosition
  /** Remaining Euclidean distance to the target in production world units. */
  readonly remainingDistance: number
  /** The target position in production world units. */
  readonly target: WorldPosition
}

/**
 * Typed rejection reasons for invalid navigation requests (ARCH-014, ARCH-015).
 */
export type InvalidNavigationReason =
  | 'out-of-bounds'
  | 'unreachable'
  | 'invalid-target'
  | 'invalid-state'

/**
 * Typed invalid result returned when a target or state cannot be navigated (ARCH-014, ARCH-015).
 */
export interface InvalidNavigationResult {
  /** Discriminates invalid navigation result from valid steering intent. */
  readonly kind: 'invalid'
  /** The typed rejection reason. */
  readonly reason: InvalidNavigationReason
  /** Descriptive explanation of the rejection. */
  readonly message: string
}

/**
 * The result of a navigation query (ARCH-014).
 */
export type NavigationResult = SteeringIntent | InvalidNavigationResult

/**
 * Type guard for {@link SteeringIntent}.
 */
export function isSteeringIntent(result: NavigationResult): result is SteeringIntent {
  return result.kind === 'steering-intent'
}

/**
 * Type guard for {@link InvalidNavigationResult}.
 */
export function isInvalidNavigationResult(result: NavigationResult): result is InvalidNavigationResult {
  return result.kind === 'invalid'
}

/**
 * The platform-neutral Navigation Port interface (ARCH-014, REQ-117, REQ-120).
 *
 * Isolates deterministic path and local-steering decisions from gameplay rules.
 * Does not mutate Simulation state.
 */
export interface NavigationPort {
  /**
   * Calculate deterministic steering towards `target` without mutating state (ARCH-014).
   *
   * @param request Navigation parameters including state, target, traversability data, and tick.
   * @returns One deterministic steering intent or a typed invalid result.
   */
  computeSteering(request: NavigationRequest): NavigationResult
}
