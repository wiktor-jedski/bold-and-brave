import { describe, expect, it } from 'vitest'
import { SUPPORT_PROMISE } from './index'

/**
 * The one canonical expected support row (REQ-012, REQ-013, REQ-015).
 *
 * The exact-value assertion against this row fails for an added row, an
 * added Linux distribution field, an alternate browser, an alternate input
 * mode, an alternate GPU, or an alternate driver, because `toEqual` matches
 * the complete set of own enumerable properties and every exact value.
 */
const EXPECTED_ROW = Object.freeze({
  browser: 'Chromium',
  browserVersion: '151.0.7922.137',
  platform: 'Linux x64',
  gpu: 'NVIDIA RTX 2070 SUPER',
  driver: '610.57.04',
  viewport: Object.freeze({
    width: 1920,
    height: 1080,
    unit: 'CSS px',
  }),
  maxDevicePixelRatio: 1.0,
  inputMode: 'keyboard and mouse',
})

describe('Support promise (ARCH-024, REQ-012, REQ-013, REQ-015)', () => {
  it('exports exactly one authored support row', () => {
    expect(SUPPORT_PROMISE.rows).toHaveLength(1)
  })

  it('matches the promised machine, viewport, and input mode exactly', () => {
    expect(SUPPORT_PROMISE.rows[0]).toEqual(EXPECTED_ROW)
  })

  it('promises Linux x64 without a Linux distribution version', () => {
    const row = SUPPORT_PROMISE.rows[0]
    expect(row.platform).toBe('Linux x64')
    expect(Object.keys(row)).not.toContain('linuxDistribution')
  })

  it('is deeply frozen at every level so the authored promise cannot change at runtime', () => {
    expect(Object.isFrozen(SUPPORT_PROMISE)).toBe(true)
    expect(Object.isFrozen(SUPPORT_PROMISE.rows)).toBe(true)
    expect(Object.isFrozen(SUPPORT_PROMISE.rows[0])).toBe(true)
    expect(Object.isFrozen(SUPPORT_PROMISE.rows[0].viewport)).toBe(true)
  })
})
