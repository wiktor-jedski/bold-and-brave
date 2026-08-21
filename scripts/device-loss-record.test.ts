/**
 * Device-loss record validation tests (ARCH-024, REQ-134, REQ-138,
 * PVS-WEB-001, PVS-WEB-005).
 *
 * These tests prove that the local promised-row acceptance rejects each
 * wrong device-loss evidence value — a changed tick or projection in a
 * pre-Reload sample, a post-loss frame, a wrong visible state, a missing
 * or extra Reload action, an in-process adapter or device retry, a missing
 * or reordered startup gate, or a missing final `Ready` — before it can
 * produce passing evidence. They run in general CI (`test:device-loss-record`)
 * because they exercise pure validation logic with injected values and
 * require no promised workstation; the promised-row evidence command
 * (`check:support-row`) is the only command that launches the system
 * Chromium and writes `test-results/support-row/device-loss.json`, and it
 * never runs in the GitHub-hosted workflow.
 */
import { describe, expect, it } from 'vitest'
import type { SimulationProjection } from '../src/core/simulation'
import {
  projectionsEqual,
  REQUIRED_GATE_ORDER,
  validateDeviceLossEvidenceRecord,
} from './device-loss-record'
import type { DeviceLossEvidenceRecord } from './device-loss-record'

/** The complete projection at loss of the valid fixture: tick 87. */
const LOSS_PROJECTION: SimulationProjection = Object.freeze({
  tick: 87,
  agents: Object.freeze([
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
  ]),
  band: Object.freeze([
    Object.freeze({ id: 'poc-player-character', name: 'Player Character' }),
    Object.freeze({ id: 'poc-companion', name: 'Miro' }),
  ]),
  coin: 100,
  provisions: 10,
})

/** A valid device-loss evidence record for mutation in each mismatch test. */
function makeValidRecord(): DeviceLossEvidenceRecord {
  return {
    lossTick: 87,
    lossProjection: LOSS_PROJECTION,
    samples: [LOSS_PROJECTION, LOSS_PROJECTION, LOSS_PROJECTION],
    presentation: {
      presentedFramesAtLoss: 40,
      presentedFramesAfter: 40,
    },
    visibleState: 'Device lost',
    reloadActions: 1,
    adapterRequests: { beforeReload: 1, afterReload: 1 },
    deviceRequests: { beforeReload: 1, afterReload: 1 },
    gateOrder: [...REQUIRED_GATE_ORDER],
    startupGates: [
      'secure-context',
      'webgpu-presence',
      'physical-adapter',
      'core-device',
      'webgpu-backend',
    ],
    finalState: 'Ready',
  }
}

/** The record shape with every `readonly` modifier removed for mutation. */
type DeepMutable<T> = { -readonly [Key in keyof T]: DeepMutable<T[Key]> }

/** Expect `validateDeviceLossEvidenceRecord` to reject a mutated record. */
function expectRecordRejected(
  mutate: (record: DeepMutable<DeviceLossEvidenceRecord>) => void,
): void {
  const record = makeValidRecord() as unknown as DeepMutable<DeviceLossEvidenceRecord>
  mutate(record)
  const rejections = validateDeviceLossEvidenceRecord(
    record as unknown as DeviceLossEvidenceRecord,
  )
  expect(rejections).not.toEqual([])
}

/** Build one complete projection that differs from the projection at loss. */
function changedProjection(change: (projection: DeepMutable<SimulationProjection>) => void): SimulationProjection {
  const projection = structuredClone(LOSS_PROJECTION) as DeepMutable<SimulationProjection>
  change(projection)
  return projection as unknown as SimulationProjection
}

describe('device-loss record validation (REQ-138, PVS-WEB-005)', () => {
  it('accepts the record of a valid device-loss journey', () => {
    expect(validateDeviceLossEvidenceRecord(makeValidRecord())).toEqual([])
  })

  it('accepts one sampled complete projection equal to the projection at loss', () => {
    const record = makeValidRecord()
    record.samples = [LOSS_PROJECTION]
    expect(validateDeviceLossEvidenceRecord(record)).toEqual([])
  })

  it('rejects a loss tick that does not match the projection at loss', () => {
    expectRecordRejected((record) => {
      record.lossTick = 88
    })
  })

  it('rejects a pre-Reload sample with a changed tick', () => {
    expectRecordRejected((record) => {
      record.samples[1] = changedProjection((projection) => {
        projection.tick = 88
      })
    })
  })

  it('rejects a pre-Reload sample with a changed projection value', () => {
    expectRecordRejected((record) => {
      record.samples[1] = changedProjection((projection) => {
        projection.coin = 99
      })
    })
  })

  it('rejects a pre-Reload sample with a changed Agent record', () => {
    expectRecordRejected((record) => {
      record.samples[1] = changedProjection((projection) => {
        projection.agents[0].name = 'Changed Elder'
      })
    })
  })

  it('rejects a pre-Reload sample with a changed Band membership', () => {
    expectRecordRejected((record) => {
      record.samples[1] = changedProjection((projection) => {
        projection.band = []
      })
    })
  })

  it('rejects a journey with no pre-Reload sample', () => {
    expectRecordRejected((record) => {
      record.samples = []
    })
  })

  it('rejects a post-loss frame', () => {
    expectRecordRejected((record) => {
      record.presentation.presentedFramesAfter =
        record.presentation.presentedFramesAtLoss + 1
    })
  })

  it('rejects a wrong visible state', () => {
    expectRecordRejected((record) => {
      record.visibleState = 'Ready'
    })
  })

  it('rejects a missing Reload action', () => {
    expectRecordRejected((record) => {
      record.reloadActions = 0
    })
  })

  it('rejects more than one Reload action', () => {
    expectRecordRejected((record) => {
      record.reloadActions = 2
    })
  })

  it('rejects an in-process adapter retry before Reload', () => {
    expectRecordRejected((record) => {
      record.adapterRequests.beforeReload = 2
    })
  })

  it('rejects a missing adapter request after Reload', () => {
    expectRecordRejected((record) => {
      record.adapterRequests.afterReload = 0
    })
  })

  it('rejects an in-process device retry before Reload', () => {
    expectRecordRejected((record) => {
      record.deviceRequests.beforeReload = 2
    })
  })

  it('rejects a missing device request after Reload', () => {
    expectRecordRejected((record) => {
      record.deviceRequests.afterReload = 0
    })
  })

  it('rejects a missing Scene-load gate in the repeated order', () => {
    expectRecordRejected((record) => {
      record.gateOrder = record.gateOrder.filter((name) => name !== 'scene-load')
    })
  })

  it('rejects a reordered gate sequence', () => {
    expectRecordRejected((record) => {
      record.gateOrder = [...record.gateOrder].reverse()
    })
  })

  it('rejects a missing startup gate in the reload journey', () => {
    expectRecordRejected((record) => {
      record.startupGates = record.startupGates.filter((name) => name !== 'core-device')
    })
  })

  it('rejects a reordered startup gate sequence', () => {
    expectRecordRejected((record) => {
      record.startupGates = [...record.startupGates].reverse()
    })
  })

  it('rejects a missing final Ready state', () => {
    expectRecordRejected((record) => {
      record.finalState = 'Loading Scene'
    })
  })

  it('compares complete projections value by value', () => {
    expect(projectionsEqual(LOSS_PROJECTION, LOSS_PROJECTION)).toBe(true)
    expect(projectionsEqual(LOSS_PROJECTION, structuredClone(LOSS_PROJECTION))).toBe(true)
    expect(
      projectionsEqual(
        LOSS_PROJECTION,
        changedProjection((projection) => {
          projection.provisions = 9
        }),
      ),
    ).toBe(false)
  })
})
