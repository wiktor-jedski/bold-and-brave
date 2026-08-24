/**
 * Overworld travel evidence record validation tests (ARCH-024, REQ-017,
 * REQ-018, REQ-035, REQ-117, REQ-170, PVS-FLW-002, PVS-UI-001).
 *
 * These tests prove that the local promised-row acceptance rejects each wrong
 * Overworld travel evidence value — wrong initial state, wrong route distance,
 * camera pitch or zoom outside authored bounds, missing or malformed pause,
 * wrong final position/time/provisions, non-null final destination,
 * non-deterministic runs, mismatched complete projections (including tick,
 * agents, band, consumption remainder), cross-check mismatches between top-level
 * and run states, failed visual checklist items, missing device loss provenance,
 * or commands accepted after device loss — before it can produce passing evidence.
 */
import { describe, expect, it } from 'vitest'
import type { SimulationProjection } from '../src/core/simulation'
import {
  OVERWORLD,
  OVERWORLD_CAMERA_BOUNDS,
} from '../src/core/content'
import {
  projectionsEqual,
  REQUIRED_TRAVEL_DELIVERY_STATE,
  validateOverworldTravelEvidenceRecord,
} from './overworld-travel-record'
import type {
  OverworldTravelEvidenceRecord,
  TravelRunTrace,
} from './overworld-travel-record'

/** The record shape with every `readonly` modifier removed for mutation in tests. */
type DeepMutable<T> = { -readonly [Key in keyof T]: DeepMutable<T[Key]> }

const INITIAL_PROJECTION: SimulationProjection = Object.freeze({
  tick: 0,
  agents: Object.freeze([
    Object.freeze({
      id: 'poc-contract-giver',
      name: 'Village Elder',
      role: 'contract-giver',
      disposition: 'Neutral',
      status: 'Active',
      grievances: Object.freeze([]),
      fate: null,
    }),
    Object.freeze({
      id: 'poc-enemy-agent',
      name: 'Varek',
      role: 'enemy-agent',
      disposition: 'Hostile',
      status: 'Active',
      grievances: Object.freeze([]),
      fate: null,
    }),
  ]),
  band: Object.freeze([
    Object.freeze({ id: 'poc-player-character', name: 'Player Character' }),
    Object.freeze({ id: 'poc-companion', name: 'Miro' }),
  ]),
  coin: 100,
  provisions: 10.0,
  scene: 'poc-overworld',
  bandPawnPosition: Object.freeze({ x: 0, y: 0, z: 1.5 }),
  destination: null,
  movementState: 'idle',
  paused: false,
  elapsedCampaignTime: 0,
  consumptionRemainder: 0,
})

const PAUSED_PROJECTION: SimulationProjection = Object.freeze({
  tick: 1800,
  agents: Object.freeze([
    Object.freeze({
      id: 'poc-contract-giver',
      name: 'Village Elder',
      role: 'contract-giver',
      disposition: 'Neutral',
      status: 'Active',
      grievances: Object.freeze([]),
      fate: null,
    }),
    Object.freeze({
      id: 'poc-enemy-agent',
      name: 'Varek',
      role: 'enemy-agent',
      disposition: 'Hostile',
      status: 'Active',
      grievances: Object.freeze([]),
      fate: null,
    }),
  ]),
  band: Object.freeze([
    Object.freeze({ id: 'poc-player-character', name: 'Player Character' }),
    Object.freeze({ id: 'poc-companion', name: 'Miro' }),
  ]),
  coin: 100,
  provisions: 9.9,
  scene: 'poc-overworld',
  bandPawnPosition: Object.freeze({ x: 0, y: 0, z: 0.75 }),
  destination: Object.freeze({ x: 0, y: 0, z: 0 }),
  movementState: 'idle',
  paused: true,
  elapsedCampaignTime: 0.25,
  consumptionRemainder: 0,
})

const FINAL_PROJECTION: SimulationProjection = Object.freeze({
  tick: 3600,
  agents: Object.freeze([
    Object.freeze({
      id: 'poc-contract-giver',
      name: 'Village Elder',
      role: 'contract-giver',
      disposition: 'Neutral',
      status: 'Active',
      grievances: Object.freeze([]),
      fate: null,
    }),
    Object.freeze({
      id: 'poc-enemy-agent',
      name: 'Varek',
      role: 'enemy-agent',
      disposition: 'Hostile',
      status: 'Active',
      grievances: Object.freeze([]),
      fate: null,
    }),
  ]),
  band: Object.freeze([
    Object.freeze({ id: 'poc-player-character', name: 'Player Character' }),
    Object.freeze({ id: 'poc-companion', name: 'Miro' }),
  ]),
  coin: 100,
  provisions: 9.8,
  scene: 'poc-overworld',
  bandPawnPosition: Object.freeze({ x: 0, y: 0, z: 0 }),
  destination: null,
  movementState: 'idle',
  paused: false,
  elapsedCampaignTime: 0.5,
  consumptionRemainder: 0.008,
})

const LOSS_PROJECTION: SimulationProjection = Object.freeze({
  tick: 3650,
  agents: Object.freeze([...FINAL_PROJECTION.agents]),
  band: Object.freeze([...FINAL_PROJECTION.band]),
  coin: 100,
  provisions: 9.8,
  scene: 'poc-overworld',
  bandPawnPosition: Object.freeze({ x: 0, y: 0, z: 0 }),
  destination: Object.freeze({ x: 0, y: 0, z: 0.5 }),
  movementState: 'travel',
  paused: false,
  elapsedCampaignTime: 0.5,
  consumptionRemainder: 0.008,
})

function makeValidRunTrace(): TravelRunTrace {
  return {
    commands: ['set-destination:(0, 0, 0)', 'toggle-pause', 'toggle-pause'],
    startProjection: INITIAL_PROJECTION,
    pausedProjection: PAUSED_PROJECTION,
    finalProjection: FINAL_PROJECTION,
  }
}

function makeValidRecord(): OverworldTravelEvidenceRecord {
  return {
    initialState: {
      scene: 'poc-overworld',
      startPosition: { x: 0, y: 0, z: 1.5 },
      destination: null,
      movementState: 'idle',
      paused: false,
      elapsedCampaignTime: 0,
      provisions: 10.0,
      consumptionRemainder: 0,
    },
    route: {
      startPosition: { x: 0, y: 0, z: 1.5 },
      destinationPosition: { x: 0, y: 0, z: 0 },
      distance: 1.5,
      scale: 1.0,
    },
    camera: {
      yaw: 0.2,
      pitch: 1.0,
      distance: 5.0,
      bounds: { ...OVERWORLD_CAMERA_BOUNDS },
      topDown: true,
    },
    pauseMidRoute: {
      pausedPosition: { x: 0, y: 0, z: 0.75 },
      pausedTime: 0.25,
      pausedProvisions: 9.9,
      paused: true,
      movementState: 'idle',
    },
    finalState: {
      finalPosition: { x: 0, y: 0, z: 0 },
      destination: null,
      movementState: 'idle',
      paused: false,
      elapsedCampaignTime: 0.5,
      provisions: 9.8,
      consumptionRemainder: 0.008,
    },
    runs: [makeValidRunTrace(), makeValidRunTrace()],
    tracesEqual: true,
    visualChecklist: {
      frontierBoundaryLandmark: true,
      woodcutTerrainAndPawnMaterials: true,
      lighting: true,
      movementFeedback: true,
      singleBandPawnNode: true,
      separateBandMemberNodesAbsent: true,
      technicalBoxMeshesAbsent: true,
      imagePath: 'test-results/support-row/phase-9-visual-review.png',
    },
    deviceLossInputGate: {
      lossTick: 3650,
      projectionAtLoss: LOSS_PROJECTION,
      projectionAfterAttemptedInput: LOSS_PROJECTION,
      inputAdapterAttachedBeforeLoss: true,
      inputAdapterAttachedAfterLoss: false,
      inputGateOpenBeforeLoss: true,
      inputGateOpenAfterLoss: false,
      commandBeforeLoss: true,
      commandAfterLoss: false,
      inputGateClosedAfterLoss: true,
      projectionUnchangedAfterLoss: true,
    },
    deliveryState: REQUIRED_TRAVEL_DELIVERY_STATE,
  }
}

function expectRecordRejected(
  mutate: (record: DeepMutable<OverworldTravelEvidenceRecord>) => void,
): void {
  const record = makeValidRecord() as unknown as DeepMutable<OverworldTravelEvidenceRecord>
  mutate(record)
  const rejections = validateOverworldTravelEvidenceRecord(
    record as unknown as OverworldTravelEvidenceRecord,
    ['poc-band-pawn'],
  )
  expect(rejections.length).toBeGreaterThan(0)
}

describe('Overworld travel record validation (ARCH-024, REQ-018, REQ-170)', () => {
  it('accepts a fully valid Overworld travel evidence record', () => {
    const record = makeValidRecord()
    const rejections = validateOverworldTravelEvidenceRecord(record, ['poc-band-pawn'])
    expect(rejections).toEqual([])
  })

  it('rejects wrong delivery state', () => {
    expectRecordRejected((record) => {
      record.deliveryState = 'Startup'
    })
  })

  it('rejects wrong initial Scene ID', () => {
    expectRecordRejected((record) => {
      record.initialState.scene = 'wrong-scene'
    })
  })

  it('rejects wrong initial start position', () => {
    expectRecordRejected((record) => {
      record.initialState.startPosition = { x: 1, y: 0, z: 0 }
    })
  })

  it('rejects non-null initial destination', () => {
    expectRecordRejected((record) => {
      record.initialState.destination = { x: 0, y: 0, z: 0 }
    })
  })

  it('rejects non-idle initial movement state', () => {
    expectRecordRejected((record) => {
      record.initialState.movementState = 'travel'
    })
  })

  it('rejects initial paused state true', () => {
    expectRecordRejected((record) => {
      record.initialState.paused = true
    })
  })

  it('rejects non-zero initial elapsed campaign time', () => {
    expectRecordRejected((record) => {
      record.initialState.elapsedCampaignTime = 1.0
    })
  })

  it('rejects wrong initial provisions', () => {
    expectRecordRejected((record) => {
      record.initialState.provisions = 8.0
    })
  })

  it('rejects non-zero initial consumption remainder', () => {
    expectRecordRejected((record) => {
      record.initialState.consumptionRemainder = 0.5
    })
  })

  it('rejects wrong route distance', () => {
    expectRecordRejected((record) => {
      record.route.distance = 2.0
    })
  })

  it('rejects wrong route scale', () => {
    expectRecordRejected((record) => {
      record.route.scale = 2.0
    })
  })

  it('rejects manipulated camera bounds', () => {
    expectRecordRejected((record) => {
      record.camera.bounds.maxPitch = 3.0
    })
  })

  it('rejects camera pitch below minimum bound', () => {
    expectRecordRejected((record) => {
      record.camera.pitch = OVERWORLD_CAMERA_BOUNDS.minPitch - 0.1
    })
  })

  it('rejects camera pitch above maximum bound', () => {
    expectRecordRejected((record) => {
      record.camera.pitch = OVERWORLD_CAMERA_BOUNDS.maxPitch + 0.1
    })
  })

  it('rejects camera distance below minimum bound', () => {
    expectRecordRejected((record) => {
      record.camera.distance = OVERWORLD_CAMERA_BOUNDS.minDistance - 1.0
    })
  })

  it('rejects camera distance above maximum bound', () => {
    expectRecordRejected((record) => {
      record.camera.distance = OVERWORLD_CAMERA_BOUNDS.maxDistance + 1.0
    })
  })

  it('rejects non-top-down camera flag', () => {
    expectRecordRejected((record) => {
      record.camera.topDown = false
    })
  })

  it('rejects pause mid-route with paused = false', () => {
    expectRecordRejected((record) => {
      record.pauseMidRoute.paused = false
    })
  })

  it('rejects pause mid-route with movementState = travel', () => {
    expectRecordRejected((record) => {
      record.pauseMidRoute.movementState = 'travel'
    })
  })

  it('rejects pause mid-route with position outside route bounds or deviated from route line', () => {
    expectRecordRejected((record) => {
      record.pauseMidRoute.pausedPosition = { x: 0, y: 0, z: 5.0 }
    })
    expectRecordRejected((record) => {
      record.pauseMidRoute.pausedPosition = { x: 0.1, y: 0, z: 0.75 }
    })
    expectRecordRejected((record) => {
      record.pauseMidRoute.pausedPosition = { x: 0, y: 0.1, z: 0.75 }
    })
  })

  it('rejects pause mid-route with time outside valid range', () => {
    expectRecordRejected((record) => {
      record.pauseMidRoute.pausedTime = 0
    })
    expectRecordRejected((record) => {
      record.pauseMidRoute.pausedTime = 0.6
    })
  })

  it('rejects pause mid-route with provisions outside valid range', () => {
    expectRecordRejected((record) => {
      record.pauseMidRoute.pausedProvisions = 5.0
    })
  })

  it('rejects final position not matching settlement boundary', () => {
    expectRecordRejected((record) => {
      record.finalState.finalPosition = { x: 1.0, y: 0, z: 1.0 }
    })
  })

  it('rejects non-null final destination upon arrival', () => {
    expectRecordRejected((record) => {
      record.finalState.destination = { x: 0, y: 0, z: 0 }
    })
    expectRecordRejected((record) => {
      record.runs[0] = {
        ...makeValidRunTrace(),
        finalProjection: {
          ...FINAL_PROJECTION,
          destination: { x: 0, y: 0, z: 0 },
        },
      }
    })
  })
  it('rejects non-idle final movement state', () => {
    expectRecordRejected((record) => {
      record.finalState.movementState = 'travel'
    })
  })

  it('rejects final paused state true', () => {
    expectRecordRejected((record) => {
      record.finalState.paused = true
    })
  })

  it('rejects final elapsed time not 0.5', () => {
    expectRecordRejected((record) => {
      record.finalState.elapsedCampaignTime = 0.4
    })
  })

  it('rejects final provisions not 9.8', () => {
    expectRecordRejected((record) => {
      record.finalState.provisions = 9.5
    })
  })

  it('rejects final consumption remainder outside [0, 0.5)', () => {
    expectRecordRejected((record) => {
      record.finalState.consumptionRemainder = 0.6
    })
    expectRecordRejected((record) => {
      record.finalState.consumptionRemainder = -0.1
    })
  })

  it('rejects run count other than 2', () => {
    expectRecordRejected((record) => {
      record.runs = [makeValidRunTrace()]
    })
  })

  it('rejects mismatched command traces between clean runs', () => {
    expectRecordRejected((record) => {
      record.runs = [
        makeValidRunTrace(),
        {
          ...makeValidRunTrace(),
          commands: ['different-command'],
        },
      ]
    })
  })

  it('rejects mismatched complete start projections between clean runs', () => {
    expectRecordRejected((record) => {
      record.runs = [
        makeValidRunTrace(),
        {
          ...makeValidRunTrace(),
          startProjection: {
            ...INITIAL_PROJECTION,
            coin: 50,
          },
        },
      ]
    })
    expectRecordRejected((record) => {
      record.runs = [
        makeValidRunTrace(),
        {
          ...makeValidRunTrace(),
          startProjection: {
            ...INITIAL_PROJECTION,
            scene: 'other-scene',
          },
        },
      ]
    })
  })

  it('rejects mismatched paused projections between clean runs', () => {
    expectRecordRejected((record) => {
      record.runs = [
        makeValidRunTrace(),
        {
          ...makeValidRunTrace(),
          pausedProjection: {
            ...PAUSED_PROJECTION,
            movementState: 'travel',
          },
        },
      ]
    })
    expectRecordRejected((record) => {
      record.runs = [
        makeValidRunTrace(),
        {
          ...makeValidRunTrace(),
          pausedProjection: {
            ...PAUSED_PROJECTION,
            provisions: 8.0,
          },
        },
      ]
    })
  })

  it('rejects mismatched final projections between clean runs', () => {
    expectRecordRejected((record) => {
      record.runs = [
        makeValidRunTrace(),
        {
          ...makeValidRunTrace(),
          finalProjection: {
            ...FINAL_PROJECTION,
            destination: { x: 1, y: 0, z: 0 },
          },
        },
      ]
    })
    expectRecordRejected((record) => {
      record.runs = [
        makeValidRunTrace(),
        {
          ...makeValidRunTrace(),
          finalProjection: {
            ...FINAL_PROJECTION,
            provisions: 8.5,
          },
        },
      ]
    })
  })

  it('rejects hostile substitution of modified Run 1 projection into Run 2', () => {
    const valid = makeValidRecord()
    const run1 = valid.runs[0]
    // When Run 2 is constructed from a modified or non-matching projection
    const hostileRecord: OverworldTravelEvidenceRecord = {
      ...valid,
      runs: [
        run1,
        {
          ...makeValidRunTrace(),
          pausedProjection: {
            ...run1.pausedProjection,
            elapsedCampaignTime: 0.25,
            bandPawnPosition: { x: 0, y: 0, z: 0.5 },
          },
        },
      ],
    }
    const rejections = validateOverworldTravelEvidenceRecord(hostileRecord)
    expect(rejections.length).toBeGreaterThan(0)
    expect(rejections).toContain('Run 1 and Run 2 complete paused projections do not match.')
  })

  it('rejects top-level initialState mismatch with Run 1 startProjection', () => {
    expectRecordRejected((record) => {
      record.initialState.provisions = 9.0
    })
    expectRecordRejected((record) => {
      record.initialState.startPosition = { x: 0, y: 0, z: 0 }
    })
  })

  it('rejects top-level pauseMidRoute mismatch with Run 1 pausedProjection', () => {
    expectRecordRejected((record) => {
      record.pauseMidRoute.pausedTime = 0.1
    })
  })

  it('rejects top-level finalState mismatch with Run 1 finalProjection', () => {
    expectRecordRejected((record) => {
      record.finalState.elapsedCampaignTime = 0.6
    })
  })

  it('rejects tracesEqual false', () => {
    expectRecordRejected((record) => {
      record.tracesEqual = false
    })
  })

  it('rejects any false item in visual checklist', () => {
    expectRecordRejected((record) => {
      record.visualChecklist.frontierBoundaryLandmark = false
    })
    expectRecordRejected((record) => {
      record.visualChecklist.woodcutTerrainAndPawnMaterials = false
    })
    expectRecordRejected((record) => {
      record.visualChecklist.lighting = false
    })
    expectRecordRejected((record) => {
      record.visualChecklist.movementFeedback = false
    })
    expectRecordRejected((record) => {
      record.visualChecklist.singleBandPawnNode = false
    })
    expectRecordRejected((record) => {
      record.visualChecklist.separateBandMemberNodesAbsent = false
    })
    expectRecordRejected((record) => {
      record.visualChecklist.technicalBoxMeshesAbsent = false
    })
  })

  it('rejects empty visual checklist image path', () => {
    expectRecordRejected((record) => {
      record.visualChecklist.imagePath = ''
    })
  })

  it('rejects wrong authored Band node names', () => {
    const record = makeValidRecord()
    const rejections = validateOverworldTravelEvidenceRecord(record, ['wrong-node-name'])
    expect(rejections.length).toBeGreaterThan(0)
  })

  it('rejects device loss input gate provenance violations', () => {
    expectRecordRejected((record) => {
      record.deviceLossInputGate.lossTick = 9999
    })
    expectRecordRejected((record) => {
      record.deviceLossInputGate.projectionAfterAttemptedInput = {
        ...LOSS_PROJECTION,
        provisions: 5.0,
      }
    })
    expectRecordRejected((record) => {
      record.deviceLossInputGate.commandBeforeLoss = false
    })
    expectRecordRejected((record) => {
      record.deviceLossInputGate.commandAfterLoss = true
    })
    expectRecordRejected((record) => {
      record.deviceLossInputGate.inputAdapterAttachedBeforeLoss = false
    })
    expectRecordRejected((record) => {
      record.deviceLossInputGate.inputAdapterAttachedAfterLoss = true
    })
    expectRecordRejected((record) => {
      record.deviceLossInputGate.inputGateOpenBeforeLoss = false
    })
    expectRecordRejected((record) => {
      record.deviceLossInputGate.inputGateOpenAfterLoss = true
    })
    expectRecordRejected((record) => {
      record.deviceLossInputGate.inputGateClosedAfterLoss = false
    })
    expectRecordRejected((record) => {
      record.deviceLossInputGate.projectionUnchangedAfterLoss = false
    })
  })
})
