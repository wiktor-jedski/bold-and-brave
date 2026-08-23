/**
 * Overworld travel evidence record validation tests (ARCH-024, REQ-017,
 * REQ-018, REQ-035, REQ-117, REQ-170, PVS-FLW-002, PVS-UI-001).
 *
 * These tests prove that the local promised-row acceptance rejects each wrong
 * Overworld travel evidence value — wrong initial state, wrong route distance,
 * camera pitch or zoom outside authored bounds, missing or malformed pause,
 * wrong final position/time/provisions, non-deterministic runs, failed visual
 * checklist items, commands accepted after device loss, or a wrong delivery
 * state — before it can produce passing evidence.
 */
import { describe, expect, it } from 'vitest'
import type { SimulationProjection } from '../src/core/simulation'
import {
  OVERWORLD,
  OVERWORLD_CAMERA_BOUNDS,
} from '../src/core/content'
import {
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
  agents: Object.freeze([]),
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
  agents: Object.freeze([]),
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
  agents: Object.freeze([]),
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
  consumptionRemainder: 0,
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
      bounds: OVERWORLD_CAMERA_BOUNDS,
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
      consumptionRemainder: 0,
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

  it('rejects pause mid-route with position outside route bounds', () => {
    expectRecordRejected((record) => {
      record.pauseMidRoute.pausedPosition = { x: 0, y: 0, z: 5.0 }
    })
  })

  it('rejects pause mid-route with time outside valid range', () => {
    expectRecordRejected((record) => {
      record.pauseMidRoute.pausedTime = 1.0
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

  it('rejects mismatched projection traces between clean runs', () => {
    expectRecordRejected((record) => {
      record.runs = [
        makeValidRunTrace(),
        {
          ...makeValidRunTrace(),
          finalProjection: {
            ...FINAL_PROJECTION,
            provisions: 9.7,
          },
        },
      ]
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

  it('rejects device loss input gate violations', () => {
    expectRecordRejected((record) => {
      record.deviceLossInputGate.commandBeforeLoss = false
    })
    expectRecordRejected((record) => {
      record.deviceLossInputGate.commandAfterLoss = true
    })
    expectRecordRejected((record) => {
      record.deviceLossInputGate.inputGateClosedAfterLoss = false
    })
    expectRecordRejected((record) => {
      record.deviceLossInputGate.projectionUnchangedAfterLoss = false
    })
  })
})
