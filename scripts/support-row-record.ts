/**
 * Shared promised-row environment record and validation (ARCH-024,
 * ARCH-028, REQ-012, REQ-013).
 *
 * The local promised-row acceptance command records the actual browser
 * version, platform, architecture, GPU, driver, browser dimensions, and
 * device-pixel ratio as one machine-readable record. This module owns the
 * record shape and the validation that compares a record with the single
 * authored support promise from the shared `SUPPORT_PROMISE` record
 * (REQ-012). The Playwright promised-row spec builds and validates the
 * record before it writes the evidence file, and the vitest mismatch tests
 * prove that every wrong value is rejected before it can produce passing
 * evidence. The record contains no Linux distribution version (PVS-SCP-007).
 */
import type { SupportPromise } from '../src/browser/support'

/**
 * System facts collected before the browser launches (ARCH-024).
 *
 * The gate script (`check-support-row.ts`) resolves the system Chromium
 * executable from `PATH`, verifies its product name and version, verifies
 * the Linux x64 host, and verifies the NVIDIA GPU and driver before the
 * promised-row browser launches. `platform` is the promised operating
 * system architecture ("Linux x64") and `architecture` is its architecture
 * part ("x64"); neither carries a Linux distribution version (REQ-012,
 * PVS-SCP-007). `gpuRows` is the count of GPU rows the system reported;
 * the gate accepts the environment only when exactly one row exists and
 * matches the promise.
 */
export interface SystemFacts {
  /** The resolved system Chromium executable path. */
  readonly executablePath: string
  /** The product name reported by the resolved Chromium executable. */
  readonly browser: string
  /** The browser version reported by the resolved Chromium executable. */
  readonly browserVersion: string
  /** The operating-system architecture, e.g. `Linux x64` (REQ-012). */
  readonly platform: string
  /** The CPU architecture part of the platform, e.g. `x64`. */
  readonly architecture: string
  /** The GPU model, verified against the promise (REQ-012). */
  readonly gpu: string
  /** The GPU driver version reported by the system. */
  readonly driver: string
  /** The number of GPU rows the system reported; the gate accepts exactly one. */
  readonly gpuRows: number
}

/**
 * Browser-side facts measured in the launched promised-row browser.
 */
export interface BrowserFacts {
  /** The version of the launched system Chromium (`browser.version()`). */
  readonly browserVersion: string
  /** The actual CSS-pixel viewport width (REQ-013). */
  readonly viewportWidth: number
  /** The actual CSS-pixel viewport height (REQ-013). */
  readonly viewportHeight: number
  /** The actual device-pixel ratio (REQ-013). */
  readonly devicePixelRatio: number
}

/**
 * The machine-readable promised-row environment record (ARCH-024,
 * ARCH-028, REQ-012, REQ-013).
 *
 * The record carries the actual browser version, platform, architecture,
 * GPU, driver, browser dimensions, and device-pixel ratio without a Linux
 * distribution version (PVS-SCP-007). The promised-row acceptance writes
 * this record as `test-results/support-row/environment.json` only after
 * validation passes, so a mismatched environment never produces passing
 * evidence.
 */
export interface SupportRowEnvironmentRecord {
  /** The actual browser product name. */
  readonly browser: string
  /** The actual browser version. */
  readonly browserVersion: string
  /** The actual operating-system architecture, e.g. `Linux x64`. */
  readonly platform: string
  /** The actual CPU architecture, e.g. `x64`. */
  readonly architecture: string
  /** The actual GPU model. */
  readonly gpu: string
  /** The actual GPU driver version. */
  readonly driver: string
  /** The actual CSS-pixel browser viewport (REQ-013). */
  readonly viewport: {
    /** The viewport width in CSS pixels. */
    readonly width: number
    /** The viewport height in CSS pixels. */
    readonly height: number
    /** The unit of `width` and `height`. */
    readonly unit: 'CSS px'
  }
  /** The actual device-pixel ratio (REQ-013). */
  readonly devicePixelRatio: number
}

/**
 * Build the machine-readable environment record from the verified system
 * facts and the browser-side measurements (REQ-012, REQ-013).
 */
export function buildSupportRowEnvironmentRecord(
  system: SystemFacts,
  browser: BrowserFacts,
): SupportRowEnvironmentRecord {
  return {
    browser: system.browser,
    browserVersion: browser.browserVersion,
    platform: system.platform,
    architecture: system.architecture,
    gpu: system.gpu,
    driver: system.driver,
    viewport: {
      width: browser.viewportWidth,
      height: browser.viewportHeight,
      unit: 'CSS px',
    },
    devicePixelRatio: browser.devicePixelRatio,
  }
}

/**
 * Validate one environment record against the single authored support
 * promise (REQ-012, REQ-013).
 *
 * Returns the list of rejection reasons; an empty list means the record
 * matches the promised browser, Linux x64 platform and architecture, GPU,
 * driver, 1920 × 1080 CSS-pixel viewport, and maximum device-pixel ratio.
 * A record that carries a Linux distribution field is rejected (PVS-SCP-007).
 */
export function validateSupportRowEnvironment(
  record: SupportRowEnvironmentRecord,
  promise: SupportPromise,
): string[] {
  const rejections: string[] = []
  const row = promise.rows[0]
  const promisedArchitecture = row.platform.split(/\s+/).filter(Boolean)[1]

  if (record.browser !== row.browser) {
    rejections.push(`Browser ${record.browser} does not match the promised ${row.browser}.`)
  }
  if (record.browserVersion !== row.browserVersion) {
    rejections.push(
      `Browser version ${record.browserVersion} does not match the promised ${row.browserVersion}.`,
    )
  }
  if (record.platform !== row.platform) {
    rejections.push(`Platform ${record.platform} does not match the promised ${row.platform}.`)
  }
  if (record.architecture !== promisedArchitecture) {
    rejections.push(
      `Architecture ${record.architecture} does not match the promised ${promisedArchitecture}.`,
    )
  }
  if (record.gpu !== row.gpu) {
    rejections.push(`GPU ${record.gpu} does not match the promised ${row.gpu}.`)
  }
  if (record.driver !== row.driver) {
    rejections.push(`Driver ${record.driver} does not match the promised ${row.driver}.`)
  }
  if (
    record.viewport.width !== row.viewport.width ||
    record.viewport.height !== row.viewport.height ||
    record.viewport.unit !== row.viewport.unit
  ) {
    rejections.push(
      `Viewport ${record.viewport.width} × ${record.viewport.height} ${record.viewport.unit} does not match the promised ${row.viewport.width} × ${row.viewport.height} ${row.viewport.unit}.`,
    )
  }
  if (record.devicePixelRatio > row.maxDevicePixelRatio) {
    rejections.push(
      `Device-pixel ratio ${record.devicePixelRatio} exceeds the promised maximum ${row.maxDevicePixelRatio}.`,
    )
  }

  for (const key of Object.keys(record)) {
    if (/distribut|distro|release/i.test(key)) {
      rejections.push(`The record contains a Linux distribution field: ${key}.`)
    }
  }

  return rejections
}
