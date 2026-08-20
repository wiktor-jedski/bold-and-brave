/**
 * Promised-row mismatch tests (ARCH-024, ARCH-028, REQ-012, REQ-013).
 *
 * These tests prove that the local promised-row acceptance rejects each
 * wrong browser version, platform, architecture, GPU, driver, viewport,
 * and device-pixel ratio before it can produce passing evidence. They run
 * in general CI (`test:support-row`) because they exercise pure
 * validation logic with injected values and require no promised
 * workstation; the promised-row evidence command (`check:support-row`) is
 * the only command that launches the system Chromium and writes
 * `test-results/support-row/environment.json`, and it never runs in the
 * GitHub-hosted workflow.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUPPORT_PROMISE } from '../src/browser/support'
import {
  CHROMIUM_CANDIDATES,
  matchesPromisedGpu,
  parseChromiumVersion,
  resolveSystemChromium,
  validateChromiumInfo,
  validateGpuDriver,
  validateHost,
} from './check-support-row'
import {
  buildSupportRowEnvironmentRecord,
  validateSupportRowEnvironment,
  type BrowserFacts,
  type SupportRowEnvironmentRecord,
  type SystemFacts,
} from './support-row-record'

/** A valid system-facts fixture matching the single authored promise row. */
const VALID_SYSTEM_FACTS: SystemFacts = Object.freeze({
  executablePath: '/usr/bin/chromium',
  browser: 'Chromium',
  browserVersion: '151.0.7922.137',
  platform: 'Linux x64',
  architecture: 'x64',
  gpu: 'NVIDIA RTX 2070 SUPER',
  driver: '610.57.04',
})

/** Valid browser-side measurements matching REQ-013. */
const VALID_BROWSER_FACTS: BrowserFacts = Object.freeze({
  browserVersion: '151.0.7922.137',
  viewportWidth: 1920,
  viewportHeight: 1080,
  devicePixelRatio: 1.0,
})

/** Build a valid environment record for mutation in each mismatch test. */
function makeValidRecord(): SupportRowEnvironmentRecord {
  return buildSupportRowEnvironmentRecord(VALID_SYSTEM_FACTS, VALID_BROWSER_FACTS)
}

/** The record shape with every `readonly` modifier removed for mutation. */
type DeepMutable<T> = { -readonly [Key in keyof T]: DeepMutable<T[Key]> }

/** Expect `validateSupportRowEnvironment` to reject a mutated record. */
function expectRecordRejected(mutate: (record: DeepMutable<SupportRowEnvironmentRecord>) => void): void {
  const record = makeValidRecord() as unknown as DeepMutable<SupportRowEnvironmentRecord>
  mutate(record)
  const rejections = validateSupportRowEnvironment(record, SUPPORT_PROMISE)
  expect(rejections).not.toEqual([])
  expect(rejections.join('\n')).toMatch(/does not match the promised|exceeds the promised maximum|distribution field/)
}

describe('promised-row environment record validation (REQ-012, REQ-013)', () => {
  it('accepts the record that matches the single authored support promise', () => {
    expect(validateSupportRowEnvironment(makeValidRecord(), SUPPORT_PROMISE)).toEqual([])
  })

  it('rejects a wrong browser version', () => {
    expectRecordRejected((record) => {
      record.browserVersion = '150.0.7922.137'
    })
  })

  it('rejects a wrong browser product', () => {
    expectRecordRejected((record) => {
      record.browser = 'Google Chrome'
    })
  })

  it('rejects a wrong platform', () => {
    expectRecordRejected((record) => {
      record.platform = 'Windows x64'
    })
  })

  it('rejects a wrong architecture', () => {
    expectRecordRejected((record) => {
      record.architecture = 'arm64'
    })
  })

  it('rejects a wrong GPU', () => {
    expectRecordRejected((record) => {
      record.gpu = 'NVIDIA GeForce RTX 3080'
    })
  })

  it('rejects a wrong driver', () => {
    expectRecordRejected((record) => {
      record.driver = '612.00.00'
    })
  })

  it('rejects a wrong viewport width', () => {
    expectRecordRejected((record) => {
      record.viewport.width = 1280
    })
  })

  it('rejects a wrong viewport height', () => {
    expectRecordRejected((record) => {
      record.viewport.height = 720
    })
  })

  it('rejects a device-pixel ratio above the promised maximum', () => {
    expectRecordRejected((record) => {
      record.devicePixelRatio = 1.5
    })
  })

  it('rejects a record that carries a Linux distribution field', () => {
    const record = makeValidRecord() as SupportRowEnvironmentRecord & { linuxDistribution: string }
    record.linuxDistribution = 'Arch Linux'
    const rejections = validateSupportRowEnvironment(record, SUPPORT_PROMISE)
    expect(rejections).not.toEqual([])
    expect(rejections.join('\n')).toMatch(/Linux distribution field/)
  })
})

describe('system gate validation (REQ-012)', () => {
  it('rejects a wrong browser version from the resolved Chromium', () => {
    const rejections = validateChromiumInfo(SUPPORT_PROMISE, {
      name: 'Chromium',
      version: '150.0.7922.137',
    })
    expect(rejections.join('\n')).toMatch(/does not match the promised 151\.0\.7922\.137/)
  })

  it('rejects a wrong browser product from the resolved Chromium', () => {
    const rejections = validateChromiumInfo(SUPPORT_PROMISE, {
      name: 'Google Chrome',
      version: '151.0.7922.137',
    })
    expect(rejections.join('\n')).toMatch(/does not match the promised Chromium/)
  })

  it('accepts the promised Chromium product and version', () => {
    expect(
      validateChromiumInfo(SUPPORT_PROMISE, { name: 'Chromium', version: '151.0.7922.137' }),
    ).toEqual([])
  })

  it('rejects a non-Linux platform', () => {
    const rejections = validateHost(SUPPORT_PROMISE, 'darwin', 'x64')
    expect(rejections.join('\n')).toMatch(/does not match the promised Linux x64/)
  })

  it('rejects a non-x64 architecture', () => {
    const rejections = validateHost(SUPPORT_PROMISE, 'linux', 'arm64')
    expect(rejections.join('\n')).toMatch(/does not match the promised Linux x64/)
  })

  it('accepts the Linux x64 host', () => {
    expect(validateHost(SUPPORT_PROMISE, 'linux', 'x64')).toEqual([])
  })

  it('rejects a wrong GPU model while accepting the vendor-reported promised model', () => {
    expect(matchesPromisedGpu('NVIDIA GeForce RTX 2070 SUPER', 'NVIDIA RTX 2070 SUPER')).toBe(true)
    expect(matchesPromisedGpu('NVIDIA RTX 2070 SUPER', 'NVIDIA RTX 2070 SUPER')).toBe(true)
    expect(matchesPromisedGpu('NVIDIA GeForce RTX 3080', 'NVIDIA RTX 2070 SUPER')).toBe(false)
    expect(matchesPromisedGpu('AMD Radeon RX 6800 XT', 'NVIDIA RTX 2070 SUPER')).toBe(false)
    expect(matchesPromisedGpu('NVIDIA GeForce GTX 2070 SUPER', 'NVIDIA RTX 2070 SUPER')).toBe(false)
  })

  it('rejects GPU variants that contain the promised model name', () => {
    expect(matchesPromisedGpu('NVIDIA GeForce RTX 2070 SUPER Mobile', 'NVIDIA RTX 2070 SUPER')).toBe(
      false,
    )
    expect(matchesPromisedGpu('NVIDIA GeForce RTX 2070 SUPER Ti', 'NVIDIA RTX 2070 SUPER')).toBe(
      false,
    )
    expect(
      matchesPromisedGpu('NVIDIA GeForce RTX 2070 SUPER Max-Q Design', 'NVIDIA RTX 2070 SUPER'),
    ).toBe(false)
    expect(matchesPromisedGpu('NVIDIA RTX 2070 SUPER OC', 'NVIDIA RTX 2070 SUPER')).toBe(false)
  })

  it('rejects a wrong GPU and driver through the system validation', () => {
    expect(validateGpuDriver(SUPPORT_PROMISE, 'NVIDIA GeForce RTX 3080', '610.57.04')).not.toEqual(
      [],
    )
    expect(validateGpuDriver(SUPPORT_PROMISE, 'NVIDIA GeForce RTX 2070 SUPER', '612.00.00')).not.toEqual(
      [],
    )
  })

  it('accepts the promised GPU and driver through the system validation', () => {
    expect(
      validateGpuDriver(SUPPORT_PROMISE, 'NVIDIA GeForce RTX 2070 SUPER', '610.57.04'),
    ).toEqual([])
  })
})

describe('Chromium resolution and version parsing (ARCH-024)', () => {
  it('parses the product name and version from the system Chromium output', () => {
    expect(parseChromiumVersion('Chromium 151.0.7922.137 Arch Linux')).toEqual({
      name: 'Chromium',
      version: '151.0.7922.137',
    })
  })

  it('parses a Google Chrome version line for a rejection check', () => {
    expect(parseChromiumVersion('Google Chrome 150.0.7922.137')).toEqual({
      name: 'Google Chrome',
      version: '150.0.7922.137',
    })
  })

  it('returns null for output without a Chromium version', () => {
    expect(parseChromiumVersion('no version here')).toBeNull()
  })

  it('resolves the first existing Chromium candidate on PATH', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bold-and-brave-chromium-'))
    writeFileSync(join(directory, 'chromium'), '')
    expect(resolveSystemChromium(directory)).toBe(join(directory, 'chromium'))
  })

  it('prefers the first candidate in PATH order', () => {
    const first = mkdtempSync(join(tmpdir(), 'bold-and-brave-chromium-first-'))
    const second = mkdtempSync(join(tmpdir(), 'bold-and-brave-chromium-second-'))
    writeFileSync(join(first, 'chromium'), '')
    writeFileSync(join(second, 'google-chrome-stable'), '')
    expect(resolveSystemChromium(`${first}${delimiter}${second}`)).toBe(
      join(first, 'chromium'),
    )
  })

  it('returns null when no Chromium candidate exists on PATH', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bold-and-brave-chromium-empty-'))
    expect(resolveSystemChromium(directory)).toBeNull()
  })

  it('knows the ordered candidate names used for PATH resolution', () => {
    expect(CHROMIUM_CANDIDATES[0]).toBe('chromium')
  })
})
