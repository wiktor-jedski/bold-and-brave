/**
 * Shared Overworld travel evidence record and validation (ARCH-001, ARCH-002,
 * ARCH-006, ARCH-007, ARCH-008, ARCH-009, ARCH-012, ARCH-023, ARCH-024,
 * REQ-017, REQ-018, REQ-035, REQ-117, REQ-170, PVS-FLW-001, PVS-FLW-002,
 * PVS-FLW-022, PVS-UI-001).
 *
 * The local promised-row acceptance observes the complete focused travel
 * check twice from clean campaigns:
 *   - confirms the exact start position and 1.5-world-unit route;
 *   - rotates and zooms without leaving the top-down view;
 *   - clicks traversable ground to travel to the settlement boundary;
 *   - pauses and resumes mid-route;
 *   - observes an exact stop at 0.5 elapsed Overworld day with Provisions 9.8;
 *   - proves two clean runs have equal command and projection traces;
 *   - verifies the Phase 9 visual checklist and captures one visual review PNG;
 *   - proves device loss closes input before another command can be created.
 *
 * This module owns the machine-readable evidence shape and the validation
 * that gates the `test-results/support-row/overworld-travel.json` record.
 */
import type { MovementState, SimulationProjection } from '../src/core/simulation'
import type {
  OverworldCameraBoundsContent,
  WorldPosition,
} from '../src/core/content'
import {
  OVERWORLD,
  OVERWORLD_CAMERA_BOUNDS,
} from '../src/core/content'

/** The required delivery state when travel is exercised. */
export const REQUIRED_TRAVEL_DELIVERY_STATE = 'Ready'

/** Position tolerance for floating-point comparisons (within settlement boundary radius 0.25). */
const EPSILON = 0.05
/**
 * Trace of one clean campaign travel run.
 */
export interface TravelRunTrace {
  readonly commands: readonly string[]
  readonly startProjection: SimulationProjection
  readonly pausedProjection: SimulationProjection
  readonly finalProjection: SimulationProjection
}

/**
 * The Phase 9 visual review checklist criteria (ARCH-009, ARCH-016, REQ-170, PVS-UI-001).
 */
export interface Phase9VisualChecklist {
  /** Recognizable frontier boundary landmark present. */
  readonly frontierBoundaryLandmark: boolean
  /** Low-poly woodcut terrain and pawn materials present. */
  readonly woodcutTerrainAndPawnMaterials: boolean
  /** Authored frontier lighting present. */
  readonly lighting: boolean
  /** Movement feedback (animation transition) active. */
  readonly movementFeedback: boolean
  /** Exactly one smaller player-character Band pawn node present. */
  readonly singleBandPawnNode: boolean
  /** Separate Band-member models absent. */
  readonly separateBandMemberNodesAbsent: boolean
  /** Technical box meshes absent. */
  readonly technicalBoxMeshesAbsent: boolean
  /** Path to the captured visual-review PNG. */
  readonly imagePath: string
}

/**
 * Device loss input gate verification facts (ARCH-006, ARCH-007, REQ-138).
 */
export interface DeviceLossInputGateEvidence {
  /** Whether a real move command was accepted and processed before loss. */
  readonly commandBeforeLoss: boolean
  /** Whether any command was accepted or processed after device loss. */
  readonly commandAfterLoss: boolean
  /** Whether the Browser Runtime closed its gameplay-input gate after loss. */
  readonly inputGateClosedAfterLoss: boolean
  /** Whether the projection remained unchanged after device loss. */
  readonly projectionUnchangedAfterLoss: boolean
}

/**
 * The machine-readable Phase 9 Overworld travel evidence record (ARCH-024, REQ-018, REQ-170).
 */
export interface OverworldTravelEvidenceRecord {
  /** Initial campaign state at Ready. */
  readonly initialState: {
    readonly scene: string
    readonly startPosition: WorldPosition
    readonly destination: WorldPosition | null
    readonly movementState: MovementState
    readonly paused: boolean
    readonly elapsedCampaignTime: number
    readonly provisions: number
    readonly consumptionRemainder: number
  }
  /** Authored route facts. */
  readonly route: {
    readonly startPosition: WorldPosition
    readonly destinationPosition: WorldPosition
    readonly distance: number
    readonly scale: number
  }
  /** Camera state and bounds. */
  readonly camera: {
    readonly yaw: number
    readonly pitch: number
    readonly distance: number
    readonly bounds: OverworldCameraBoundsContent
    readonly topDown: boolean
  }
  /** State during mid-route pause. */
  readonly pauseMidRoute: {
    readonly pausedPosition: WorldPosition
    readonly pausedTime: number
    readonly pausedProvisions: number
    readonly paused: boolean
    readonly movementState: MovementState
  }
  /** Final state after destination arrival. */
  readonly finalState: {
    readonly finalPosition: WorldPosition
    readonly destination: WorldPosition | null
    readonly movementState: MovementState
    readonly paused: boolean
    readonly elapsedCampaignTime: number
    readonly provisions: number
    readonly consumptionRemainder: number
  }
  /** Two clean campaign runs proving determinism. */
  readonly runs: readonly TravelRunTrace[]
  /** Equivalence of run traces. */
  readonly tracesEqual: boolean
  /** Phase 9 visual checklist items. */
  readonly visualChecklist: Phase9VisualChecklist
  /** Device loss input gate verification. */
  readonly deviceLossInputGate: DeviceLossInputGateEvidence
  /** The delivery state of the application. */
  readonly deliveryState: string
}

/**
 * Structural equality of plain JSON-style values.
 */
function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return false
  }
  if (Array.isArray(left) !== Array.isArray(right)) {
    return false
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false
    }
    for (let i = 0; i < left.length; i += 1) {
      if (!deepEqual(left[i], right[i])) {
        return false
      }
    }
    return true
  }
  const leftKeys = Object.keys(left as Record<string, unknown>)
  const rightKeys = Object.keys(right as Record<string, unknown>)
  if (leftKeys.length !== rightKeys.length) {
    return false
  }
  for (const key of leftKeys) {
    if (!deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])) {
      return false
    }
  }
  return true
}

/**
 * Check if two WorldPositions are approximately equal.
 */
function positionsEqual(
  left: WorldPosition | null | undefined,
  right: WorldPosition | null | undefined,
  tolerance = EPSILON,
): boolean {
  if (!left || !right) {
    return left === right
  }
  return (
    Math.abs(left.x - right.x) <= tolerance &&
    Math.abs(left.y - right.y) <= tolerance &&
    Math.abs(left.z - right.z) <= tolerance
  )
}
/**
 * Check if two gameplay projections are value-equal in all authoritative fields.
 */
function gameplayProjectionEqual(
  left: SimulationProjection,
  right: SimulationProjection,
): boolean {
  return (
    left.scene === right.scene &&
    positionsEqual(left.bandPawnPosition, right.bandPawnPosition) &&
    positionsEqual(left.destination, right.destination) &&
    left.movementState === right.movementState &&
    left.paused === right.paused &&
    Math.abs(left.elapsedCampaignTime - right.elapsedCampaignTime) <= EPSILON &&
    Math.abs(left.provisions - right.provisions) <= EPSILON &&
    left.coin === right.coin
  )
}

/**
 * Validate one Overworld travel evidence record (ARCH-024, REQ-017, REQ-018, REQ-170).
 *
 * @param record The evidence record to validate.
 * @param authoredBandNodeNames Optional authored Band node names in the glTF asset.
 * @returns An array of validation rejection reasons; empty if valid.
 */
export function validateOverworldTravelEvidenceRecord(
  record: OverworldTravelEvidenceRecord,
  authoredBandNodeNames?: readonly string[],
): string[] {
  const rejections: string[] = []

  // 1. Delivery state check
  if (record.deliveryState !== REQUIRED_TRAVEL_DELIVERY_STATE) {
    rejections.push(
      `Delivery state is "${record.deliveryState}"; must be "${REQUIRED_TRAVEL_DELIVERY_STATE}".`,
    )
  }

  // 2. Initial state validation (REQ-017, REQ-077)
  if (record.initialState.scene !== OVERWORLD.id) {
    rejections.push(
      `Initial Scene "${record.initialState.scene}" does not match authored Scene "${OVERWORLD.id}".`,
    )
  }
  if (!positionsEqual(record.initialState.startPosition, OVERWORLD.startPosition)) {
    rejections.push(
      `Initial start position (${record.initialState.startPosition?.x}, ${record.initialState.startPosition?.y}, ${record.initialState.startPosition?.z}) does not match authored start (${OVERWORLD.startPosition.x}, ${OVERWORLD.startPosition.y}, ${OVERWORLD.startPosition.z}).`,
    )
  }
  if (record.initialState.destination !== null) {
    rejections.push(
      `Initial destination must be null; received ${JSON.stringify(record.initialState.destination)}.`,
    )
  }
  if (record.initialState.movementState !== 'idle') {
    rejections.push(
      `Initial movementState must be "idle"; received "${record.initialState.movementState}".`,
    )
  }
  if (record.initialState.paused !== false) {
    rejections.push(`Initial paused state must be false; received ${record.initialState.paused}.`)
  }
  if (record.initialState.elapsedCampaignTime !== 0) {
    rejections.push(
      `Initial elapsedCampaignTime must be 0; received ${record.initialState.elapsedCampaignTime}.`,
    )
  }
  if (record.initialState.provisions !== 10.0) {
    rejections.push(
      `Initial provisions must be 10.0; received ${record.initialState.provisions}.`,
    )
  }
  if (record.initialState.consumptionRemainder !== 0) {
    rejections.push(
      `Initial consumptionRemainder must be 0; received ${record.initialState.consumptionRemainder}.`,
    )
  }

  // 3. Route validation (REQ-017, REQ-018, REQ-035)
  if (!positionsEqual(record.route.startPosition, OVERWORLD.startPosition)) {
    rejections.push('Route startPosition does not match authored start position.')
  }
  const settlementPos = OVERWORLD.destinations[0]?.position ?? { x: 0, y: 0, z: 0 }
  if (!positionsEqual(record.route.destinationPosition, settlementPos)) {
    rejections.push(
      'Route destinationPosition does not match authored settlement boundary position.',
    )
  }
  if (Math.abs(record.route.distance - 1.5) > EPSILON) {
    rejections.push(`Route distance must be 1.5; received ${record.route.distance}.`)
  }
  if (record.route.scale !== 1.0 && record.route.scale !== 1) {
    rejections.push(`Production scale must be 1.0; received ${record.route.scale}.`)
  }

  // 4. Camera bounds validation (ARCH-009, REQ-018)
  const bounds = record.camera.bounds ?? OVERWORLD_CAMERA_BOUNDS
  if (
    record.camera.pitch < bounds.minPitch - EPSILON ||
    record.camera.pitch > bounds.maxPitch + EPSILON
  ) {
    rejections.push(
      `Camera pitch ${record.camera.pitch} is outside authored bounds [${bounds.minPitch}, ${bounds.maxPitch}].`,
    )
  }
  if (
    record.camera.distance < bounds.minDistance - EPSILON ||
    record.camera.distance > bounds.maxDistance + EPSILON
  ) {
    rejections.push(
      `Camera distance ${record.camera.distance} is outside authored bounds [${bounds.minDistance}, ${bounds.maxDistance}].`,
    )
  }
  if (record.camera.topDown !== true) {
    rejections.push('Camera must maintain top-down strategic perspective.')
  }

  // 5. Pause mid-route validation (REQ-019, REQ-085)
  if (record.pauseMidRoute.paused !== true) {
    rejections.push('pauseMidRoute.paused must be true.')
  }
  if (record.pauseMidRoute.movementState !== 'idle') {
    rejections.push(
      `pauseMidRoute.movementState must be "idle"; received "${record.pauseMidRoute.movementState}".`,
    )
  }
  if (
    record.pauseMidRoute.pausedPosition.z < -EPSILON ||
    record.pauseMidRoute.pausedPosition.z > 1.5 + EPSILON
  ) {
    rejections.push(
      `pauseMidRoute position z=${record.pauseMidRoute.pausedPosition.z} is outside route [0, 1.5].`,
    )
  }
  if (
    record.pauseMidRoute.pausedTime < 0 ||
    record.pauseMidRoute.pausedTime > 0.5 + EPSILON
  ) {
    rejections.push(
      `pauseMidRoute pausedTime=${record.pauseMidRoute.pausedTime} is outside valid range [0, 0.5].`,
    )
  }
  if (
    record.pauseMidRoute.pausedProvisions < 9.8 - EPSILON ||
    record.pauseMidRoute.pausedProvisions > 10.0 + EPSILON
  ) {
    rejections.push(
      `pauseMidRoute pausedProvisions=${record.pauseMidRoute.pausedProvisions} is outside valid range [9.8, 10.0].`,
    )
  }

  // 6. Final state validation (REQ-017, REQ-018, REQ-082, REQ-083)
  if (!positionsEqual(record.finalState.finalPosition, settlementPos)) {
    rejections.push(
      `Final position (${record.finalState.finalPosition?.x}, ${record.finalState.finalPosition?.y}, ${record.finalState.finalPosition?.z}) does not match settlement boundary (${settlementPos.x}, ${settlementPos.y}, ${settlementPos.z}).`,
    )
  }
  if (record.finalState.movementState !== 'idle') {
    rejections.push(
      `Final movementState must be "idle"; received "${record.finalState.movementState}".`,
    )
  }
  if (record.finalState.paused !== false) {
    rejections.push(`Final paused state must be false; received ${record.finalState.paused}.`)
  }
  if (Math.abs(record.finalState.elapsedCampaignTime - 0.5) > EPSILON) {
    rejections.push(
      `Final elapsedCampaignTime must be 0.5; received ${record.finalState.elapsedCampaignTime}.`,
    )
  }
  if (Math.abs(record.finalState.provisions - 9.8) > EPSILON) {
    rejections.push(
      `Final provisions must be 9.8; received ${record.finalState.provisions}.`,
    )
  }
  if (
    record.finalState.consumptionRemainder < 0 ||
    record.finalState.consumptionRemainder >= 0.5
  ) {
    rejections.push(
      `Final consumptionRemainder must be in [0, 0.5); received ${record.finalState.consumptionRemainder}.`,
    )
  }

  // 7. Determinism across clean runs (ARCH-005)
  if (!Array.isArray(record.runs) || record.runs.length !== 2) {
    rejections.push(`Must contain exactly 2 clean run traces; received ${record.runs?.length ?? 0}.`)
  } else {
    const run1 = record.runs[0]
    const run2 = record.runs[1]
    if (!deepEqual(run1.commands, run2.commands)) {
      rejections.push('Run 1 and Run 2 command traces do not match.')
    }
    if (!gameplayProjectionEqual(run1.startProjection, run2.startProjection)) {
      rejections.push('Run 1 and Run 2 start projections do not match.')
    }
    if (!gameplayProjectionEqual(run1.pausedProjection, run2.pausedProjection)) {
      rejections.push('Run 1 and Run 2 paused projections do not match.')
    }
    if (!gameplayProjectionEqual(run1.finalProjection, run2.finalProjection)) {
      rejections.push('Run 1 and Run 2 final projections do not match.')
    }
  }
  if (record.tracesEqual !== true) {
    rejections.push('tracesEqual must be true.')
  }

  // 8. Visual checklist validation (REQ-170, PVS-UI-001)
  const checklist = record.visualChecklist
  if (!checklist) {
    rejections.push('visualChecklist is missing.')
  } else {
    if (checklist.frontierBoundaryLandmark !== true) {
      rejections.push('visualChecklist.frontierBoundaryLandmark must be true.')
    }
    if (checklist.woodcutTerrainAndPawnMaterials !== true) {
      rejections.push('visualChecklist.woodcutTerrainAndPawnMaterials must be true.')
    }
    if (checklist.lighting !== true) {
      rejections.push('visualChecklist.lighting must be true.')
    }
    if (checklist.movementFeedback !== true) {
      rejections.push('visualChecklist.movementFeedback must be true.')
    }
    if (checklist.singleBandPawnNode !== true) {
      rejections.push('visualChecklist.singleBandPawnNode must be true.')
    }
    if (checklist.separateBandMemberNodesAbsent !== true) {
      rejections.push('visualChecklist.separateBandMemberNodesAbsent must be true.')
    }
    if (checklist.technicalBoxMeshesAbsent !== true) {
      rejections.push('visualChecklist.technicalBoxMeshesAbsent must be true.')
    }
    if (!checklist.imagePath || typeof checklist.imagePath !== 'string') {
      rejections.push('visualChecklist.imagePath must be a non-empty string.')
    }
  }

  // 9. Authored Band node names validation (if provided)
  if (authoredBandNodeNames !== undefined) {
    if (
      authoredBandNodeNames.length !== 1 ||
      authoredBandNodeNames[0] !== OVERWORLD.presentationNodes.bandPawnNodeId
    ) {
      rejections.push(
        `Authored Band node names [${authoredBandNodeNames.join(', ')}] must contain only "${OVERWORLD.presentationNodes.bandPawnNodeId}".`,
      )
    }
  }

  // 10. Device loss input gate validation (REQ-138)
  const lossGate = record.deviceLossInputGate
  if (!lossGate) {
    rejections.push('deviceLossInputGate is missing.')
  } else {
    if (lossGate.commandBeforeLoss !== true) {
      rejections.push('deviceLossInputGate.commandBeforeLoss must be true.')
    }
    if (lossGate.commandAfterLoss !== false) {
      rejections.push('deviceLossInputGate.commandAfterLoss must be false.')
    }
    if (lossGate.inputGateClosedAfterLoss !== true) {
      rejections.push('deviceLossInputGate.inputGateClosedAfterLoss must be true.')
    }
    if (lossGate.projectionUnchangedAfterLoss !== true) {
      rejections.push('deviceLossInputGate.projectionUnchangedAfterLoss must be true.')
    }
  }

  return rejections
}
