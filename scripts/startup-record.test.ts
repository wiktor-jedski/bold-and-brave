/**
 * Phase 6 startup-record mismatch tests (ARCH-023, ARCH-024, REQ-011,
 * REQ-012, REQ-014, REQ-134, REQ-135).
 *
 * These tests prove that the promised-row acceptance rejects each wrong
 * startup-record value — an insecure context, wrong gate order, wrong
 * power preference, non-NVIDIA or fallback adapter, missing adapter
 * information or limits, a non-empty core device request, a non-WebGPU
 * backend, a WebGL fallback, a wrong delivery state, a wrong host GPU or
 * driver, or more than one host GPU row — before it can produce passing
 * evidence. They run in general CI (`test:startup-record`) because they
 * exercise pure validation logic with injected values and require no
 * promised workstation; the promised-row evidence command
 * (`check:support-row`) is the only command that launches the system
 * Chromium and writes `test-results/support-row/startup.json`, and it
 * never runs in the GitHub-hosted workflow.
 */
import { describe, expect, it } from 'vitest'
import { SUPPORT_PROMISE } from '../src/browser/support'
import { STARTUP_GATE_ORDER } from '../src/browser/startup'
import {
  buildStartupEvidenceRecord,
  matchesPromisedAdapterVendor,
  validateStartupEvidenceRecord,
} from './startup-record'
import type { StartupEvidenceRecord } from './startup-record'
import type { StartupRecord } from '../src/browser/startup'
import type { SystemFacts } from './support-row-record'

/** Valid system facts matching the single authored promise row. */
const VALID_SYSTEM_FACTS: SystemFacts = Object.freeze({
  executablePath: '/usr/bin/chromium',
  browser: 'Chromium',
  browserVersion: '151.0.7922.137',
  platform: 'Linux x64',
  architecture: 'x64',
  gpu: 'NVIDIA RTX 2070 SUPER',
  driver: '610.57.04',
  gpuRows: 1,
})

/** The product-reported startup record matching the promised row. */
const VALID_STARTUP_RECORD: StartupRecord = Object.freeze({
  secureContext: true,
  gates: STARTUP_GATE_ORDER,
  powerPreference: 'high-performance',
  adapter: Object.freeze({
    vendor: 'nvidia',
    isFallbackAdapter: false,
    info: Object.freeze({
      vendor: 'nvidia',
      architecture: 'turing',
      device: '',
      description: '',
      subgroupMinSize: 32,
      subgroupMaxSize: 32,
      isFallbackAdapter: false,
    }),
    limits: Object.freeze({
      maxTextureDimension2D: 16384,
      maxBufferSize: 1073741824,
      maxBindGroups: 4,
    }),
  }),
  device: Object.freeze({
    descriptor: Object.freeze({}),
    optionalFeatures: Object.freeze([]),
    requiredLimits: Object.freeze({}),
  }),
  backend: Object.freeze({
    selected: 'webgpu',
    webglFallback: false,
  }),
  deliveryState: 'Loading Scene',
})

/** Build a valid evidence record for mutation in each mismatch test. */
function makeValidRecord(): StartupEvidenceRecord {
  // Deep-clone through JSON: the record is plain machine-readable data,
  // and each mismatch test must be able to mutate every nested field.
  return JSON.parse(JSON.stringify(buildStartupEvidenceRecord(VALID_STARTUP_RECORD, VALID_SYSTEM_FACTS)))
}

/** The record shape with every `readonly` modifier removed for mutation. */
type DeepMutable<T> = { -readonly [Key in keyof T]: DeepMutable<T[Key]> }

/** Expect `validateStartupEvidenceRecord` to reject a mutated record. */
function expectRecordRejected(
  mutate: (record: DeepMutable<StartupEvidenceRecord>) => void,
): void {
  const record = makeValidRecord() as unknown as DeepMutable<StartupEvidenceRecord>
  mutate(record)
  const rejections = validateStartupEvidenceRecord(record, SUPPORT_PROMISE)
  expect(rejections).not.toEqual([])
}

describe('Phase 6 startup-record validation (REQ-011, REQ-012, REQ-014, REQ-134, REQ-135)', () => {
  it('accepts the record that matches the promised row and the verified host facts', () => {
    expect(
      validateStartupEvidenceRecord(makeValidRecord(), SUPPORT_PROMISE),
    ).toEqual([])
  })

  it('rejects an insecure context', () => {
    expectRecordRejected((record) => {
      record.secureContext = false
    })
  })

  it('rejects a wrong gate order', () => {
    expectRecordRejected((record) => {
      record.gates = ['secure-context', 'physical-adapter', 'core-device', 'webgpu-backend']
    })
  })

  it('rejects a missing gate', () => {
    expectRecordRejected((record) => {
      record.gates = [
        'secure-context',
        'webgpu-presence',
        'physical-adapter',
        'webgpu-backend',
      ]
    })
  })

  it('rejects a wrong power preference', () => {
    expectRecordRejected((record) => {
      record.powerPreference = 'low-power'
    })
  })

  it('rejects a non-NVIDIA browser adapter vendor', () => {
    expectRecordRejected((record) => {
      record.adapter.vendor = 'amd'
    })
  })

  it('rejects an empty browser adapter vendor', () => {
    expectRecordRejected((record) => {
      record.adapter.vendor = ''
    })
  })

  it('rejects a software-fallback browser adapter', () => {
    expectRecordRejected((record) => {
      record.adapter.isFallbackAdapter = true
    })
  })

  it('rejects missing adapter information', () => {
    expectRecordRejected((record) => {
      record.adapter.info = {}
    })
  })

  it('rejects missing reported limits', () => {
    expectRecordRejected((record) => {
      record.adapter.limits = {}
    })
  })

  it('rejects a non-empty core device descriptor', () => {
    expectRecordRejected((record) => {
      record.device.descriptor = { requiredFeatures: ['timestamp-query'] }
    })
  })

  it('rejects an enabled optional adapter feature', () => {
    expectRecordRejected((record) => {
      record.device.optionalFeatures = ['timestamp-query']
    })
  })

  it('rejects a raised limit', () => {
    expectRecordRejected((record) => {
      record.device.requiredLimits = { maxBindGroups: 8 }
    })
  })

  it('rejects a non-WebGPU backend', () => {
    expectRecordRejected((record) => {
      record.backend.selected = 'webgl'
    })
  })

  it('rejects a WebGL fallback', () => {
    expectRecordRejected((record) => {
      record.backend.webglFallback = true
    })
  })

  it('rejects a wrong final delivery state', () => {
    expectRecordRejected((record) => {
      record.deliveryState = 'Unsupported'
    })
  })

  it('rejects a wrong host GPU', () => {
    expectRecordRejected((record) => {
      record.host.gpu = 'NVIDIA GeForce RTX 3080'
    })
  })

  it('rejects a wrong host driver', () => {
    expectRecordRejected((record) => {
      record.host.driver = '612.00.00'
    })
  })

  it('rejects more than one host GPU row', () => {
    expectRecordRejected((record) => {
      record.host.gpuRows = 2
    })
  })

  it('correlates the browser adapter vendor with the promised GPU vendor', () => {
    expect(matchesPromisedAdapterVendor('nvidia', 'NVIDIA RTX 2070 SUPER')).toBe(true)
    expect(matchesPromisedAdapterVendor('NVIDIA', 'NVIDIA RTX 2070 SUPER')).toBe(true)
    expect(matchesPromisedAdapterVendor('amd', 'NVIDIA RTX 2070 SUPER')).toBe(false)
    expect(matchesPromisedAdapterVendor('', 'NVIDIA RTX 2070 SUPER')).toBe(false)
  })
})
