/**
 * The platform-neutral Navigation Port and Authored Navigation Adapter (ARCH-014, ARCH-015).
 *
 * Exposes the Navigation Port interface and its production Authored
 * Navigation Adapter for deterministic Overworld movement and steering.
 */

export type {
  InvalidNavigationReason,
  InvalidNavigationResult,
  NavigationPort,
  NavigationRequest,
  NavigationResult,
  NavigationState,
  NavigationTraversabilityData,
  SteeringIntent,
} from './interface'

export {
  isInvalidNavigationResult,
  isSteeringIntent,
} from './interface'

export {
  AuthoredNavigationAdapter,
  calculateSpeedPerTick,
  createAuthoredNavigationAdapter,
  distanceBetween,
  isPositionInTraversableGround,
} from './adapter'
