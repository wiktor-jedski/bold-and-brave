/**
 * The read-only Overworld travel observation (ARCH-002, ARCH-007, ARCH-009,
 * ARCH-024, REQ-017, REQ-018, REQ-035, REQ-117, REQ-170, PVS-FLW-002).
 *
 * The composition root wires the Overworld presenter and Input Adapter into
 * the product surface after the real Scene reaches `Ready`. The product
 * publishes this observation getter for the promised-row acceptance: it
 * exposes the current immutable Simulation projection, the presentation-only
 * camera state, and the Input Adapter attachment state.
 *
 * All properties are read-only and frozen. The observation exposes no
 * GPUDevice, no runtime object, and no state-changing command seam.
 */
import type { SimulationProjection } from '../../core/simulation'
import type { PresentedCameraState } from '../presentation'

/**
 * The read-only travel observation the product publishes (ARCH-024, REQ-018, REQ-170).
 */
export interface TravelObservation {
  /** The current immutable projection of the authoritative Simulation. */
  readonly currentProjection: SimulationProjection
  /** The current presentation camera state (presentation-only), or null if unavailable. */
  readonly cameraState: PresentedCameraState | null
  /** Whether the browser Input Adapter is currently attached to its event targets. */
  readonly isInputAttached: boolean
  /** Whether the Browser Runtime currently accepts gameplay input (ARCH-006, REQ-138). */
  readonly acceptsGameplayInput: boolean
  /** Total count of gameplay commands submitted to the Simulation through the Input Adapter. */
  readonly submittedCommandsCount: number
}

declare global {
  interface Window {
    /**
     * Read the Overworld travel observation of the built product (ARCH-024,
     * REQ-018, REQ-170).
     *
     * The promised-row acceptance calls this getter to observe the authoritative
     * Simulation projection (position, movement state, pause state, elapsed time,
     * provisions, consumption remainder), camera state, and input adapter state.
     */
    __boldAndBraveTravelObservation?: () => TravelObservation
  }
}

/**
 * The production publisher wiring the travel observation getter on the
 * browser global object (ARCH-024).
 *
 * The Scene-loading handoff calls `publish` after the real Scene load passes
 * and the Input Adapter is attached, so the acceptance can observe Overworld
 * travel from `Ready` onward.
 */
export const productionTravelObservationPublisher: {
  /** Bind the travel observation getter on the browser global object. */
  publish(getObservation: () => TravelObservation): void
} = {
  publish(getObservation: () => TravelObservation): void {
    if (typeof window === 'undefined') {
      return
    }
    window.__boldAndBraveTravelObservation = getObservation
  },
}
