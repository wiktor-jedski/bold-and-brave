/**
 * Authored Navigation Adapter (ARCH-015, REQ-035, REQ-117).
 *
 * Implements the platform-neutral Navigation Port using authored anchors,
 * traversability data, and deterministic local steering.
 *
 * The adapter contains no destination-specific or settlement-specific branch:
 * all destinations and waypoints are evaluated generically through the authored
 * traversability data and positions (REQ-035, PVS-FLW-022).
 */
import type {
  OverworldTravelContent,
  TraversableGround,
  WorldPosition,
} from '../content'
import type {
  InvalidNavigationResult,
  NavigationPort,
  NavigationRequest,
  NavigationResult,
  SteeringIntent,
} from './interface'

/**
 * Whether a 3D position falls within authored traversable ground bounds (ARCH-015, ARCH-016).
 */
export function isPositionInTraversableGround(
  position: WorldPosition,
  bounds: TraversableGround,
): boolean {
  return (
    position.x >= bounds.minX &&
    position.x <= bounds.maxX &&
    position.z >= bounds.minZ &&
    position.z <= bounds.maxZ
  )
}

/**
 * Calculate Euclidean distance between two 3D world positions (ARCH-016).
 */
export function distanceBetween(a: WorldPosition, b: WorldPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/**
 * Calculate travel speed in world units per fixed tick from travel content (ARCH-016, REQ-018).
 *
 * Normal travel is 3.0 world units per Overworld day. At 1× speed, one Overworld
 * hour takes 5.0 real-time seconds, so one Overworld day takes 120.0 real seconds.
 * At 60 Hz fixed tick rate, one Overworld day equals 7200 ticks:
 * 3.0 world units / 7200 ticks = 1 / 2400 world units per tick.
 */
export function calculateSpeedPerTick(travel?: OverworldTravelContent): number {
  if (travel === undefined) {
    return 3.0 / 7200
  }
  const totalTicksPerDay = travel.realSecondsPerOverworldHour * travel.hoursPerOverworldDay * 60
  if (totalTicksPerDay <= 0) {
    return 0
  }
  return travel.speedWorldUnitsPerDay / totalTicksPerDay
}

/**
 * The production Authored Navigation Adapter (ARCH-015).
 *
 * Satisfies the Navigation Port with authored anchors, traversability data,
 * and deterministic local steering without mutating state.
 */
export class AuthoredNavigationAdapter implements NavigationPort {
  computeSteering(request: NavigationRequest): NavigationResult {
    const { state, target, traversability, speedWorldUnitsPerTick } = request

    // 1. Validate target coordinates
    if (
      !Number.isFinite(target.x) ||
      !Number.isFinite(target.y) ||
      !Number.isFinite(target.z)
    ) {
      const invalid: InvalidNavigationResult = Object.freeze({
        kind: 'invalid',
        reason: 'invalid-target',
        message: 'Target position contains non-finite coordinates.',
      })
      return invalid
    }

    // 2. Validate current position coordinates
    if (
      !Number.isFinite(state.position.x) ||
      !Number.isFinite(state.position.y) ||
      !Number.isFinite(state.position.z)
    ) {
      const invalid: InvalidNavigationResult = Object.freeze({
        kind: 'invalid',
        reason: 'invalid-state',
        message: 'Current position contains non-finite coordinates.',
      })
      return invalid
    }

    // 3. Validate target is within traversable ground
    if (!isPositionInTraversableGround(target, traversability.traversableGround)) {
      const invalid: InvalidNavigationResult = Object.freeze({
        kind: 'invalid',
        reason: 'out-of-bounds',
        message: 'Target position is outside traversable ground.',
      })
      return invalid
    }

    // 4. Validate current position is within traversable ground
    if (!isPositionInTraversableGround(state.position, traversability.traversableGround)) {
      const invalid: InvalidNavigationResult = Object.freeze({
        kind: 'invalid',
        reason: 'out-of-bounds',
        message: 'Current position is outside traversable ground.',
      })
      return invalid
    }

    // 5. Validate reachability if predicate provided
    if (traversability.isReachable !== undefined && !traversability.isReachable(state.position, target)) {
      const invalid: InvalidNavigationResult = Object.freeze({
        kind: 'invalid',
        reason: 'unreachable',
        message: 'Target position is unreachable from current position.',
      })
      return invalid
    }

    // 6. Calculate displacement and Euclidean distance
    const dx = target.x - state.position.x
    const dy = target.y - state.position.y
    const dz = target.z - state.position.z
    const distance = Math.hypot(dx, dy, dz)

    const frozenTarget: WorldPosition = Object.freeze({
      x: target.x,
      y: target.y,
      z: target.z,
    })

    // 7. Arrival / stop check
    if (distance === 0 || distance < 1e-12) {
      const intent: SteeringIntent = Object.freeze({
        kind: 'steering-intent',
        arrived: true,
        step: Object.freeze({ x: 0, y: 0, z: 0 }),
        desiredDirection: Object.freeze({ x: 0, y: 0, z: 0 }),
        remainingDistance: 0,
        target: frozenTarget,
      })
      return intent
    }

    // 8. Calculate bounded step without overshoot
    const speedPerTick =
      speedWorldUnitsPerTick !== undefined && speedWorldUnitsPerTick > 0
        ? speedWorldUnitsPerTick
        : calculateSpeedPerTick(traversability.travel)

    const stepDistance = Math.min(speedPerTick, distance)
    const ux = dx / distance
    const uy = dy / distance
    const uz = dz / distance

    const step: WorldPosition = Object.freeze({
      x: ux * stepDistance,
      y: uy * stepDistance,
      z: uz * stepDistance,
    })

    const desiredDirection: WorldPosition = Object.freeze({
      x: ux,
      y: uy,
      z: uz,
    })

    const intent: SteeringIntent = Object.freeze({
      kind: 'steering-intent',
      arrived: false,
      step,
      desiredDirection,
      remainingDistance: distance,
      target: frozenTarget,
    })

    return intent
  }
}

/**
 * Factory creating one platform-neutral Authored Navigation Adapter (ARCH-014, ARCH-015).
 */
export function createAuthoredNavigationAdapter(): NavigationPort {
  return new AuthoredNavigationAdapter()
}
