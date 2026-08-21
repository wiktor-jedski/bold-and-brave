/**
 * Local promised-row acceptance command (ARCH-024, ARCH-028, REQ-012,
 * REQ-013, REQ-015, REQ-134).
 *
 * `bun run check:support-row` runs the dedicated local promised-row
 * acceptance: it resolves the system Chromium executable from `PATH`,
 * rejects an environment that does not match the promised browser, Linux
 * x64 architecture, GPU, or driver — and one that has no active desktop
 * session or more than one GPU row — before the browser launches, writes
 * the verified system facts, and then runs the promised-row Playwright
 * configuration against the built product. The Playwright spec launches
 * the system Chromium headed through the active desktop session, measures
 * the actual browser version, viewport, and device-pixel ratio, validates
 * the full environment record against the shared `SUPPORT_PROMISE` record
 * (REQ-012), and writes `test-results/support-row/environment.json` only
 * after validation passes. The same spec exercises the real Phase 6
 * startup through the built product: it waits for `Loading Scene`, reads
 * the machine-readable startup record the product reports after every
 * ordered gate success, validates it, and writes
 * `test-results/support-row/startup.json` only after validation passes
 * (REQ-011, REQ-014, REQ-134, REQ-135). The same headed run also observes
 * the real frame presentation through the loaded Scene — the two
 * projected initial Band members rendered and the authored animation
 * advancing from the current projection tick and interpolation value on
 * the existing frame loop — and writes
 * `test-results/support-row/frame-presentation.json` only after the
 * presentation record passes validation (ARCH-008, REQ-118, PVS-ARC-008).
 *
 * GitHub-hosted pull-request CI keeps the existing general Playwright
 * browser check and never runs this command, so it produces no
 * promised-row evidence in CI. The command is intentionally not a
 * `test:*` script: `scripts/ci-check.py` runs every `test:*` script in
 * general CI, and this local acceptance requires the promised workstation.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { SUPPORT_PROMISE } from '../src/browser/support'
import type { SupportPromise } from '../src/browser/support'
import type { SystemFacts } from './support-row-record'

/** Chromium-family executables tried in order while resolving `PATH`. */
export const CHROMIUM_CANDIDATES: readonly string[] = [
  'chromium',
  'chromium-browser',
  'google-chrome-stable',
  'google-chrome',
  'chrome',
]

/** The promised-row Playwright configuration file. */
export const SUPPORT_ROW_PLAYWRIGHT_CONFIG = 'playwright.support-row.config.ts'

/**
 * The system facts file written before the promised-row browser launches.
 *
 * The file lives under `node_modules/.tmp` (the same transient area the
 * TypeScript builds use) because Playwright removes its `test-results`
 * output directory at the start of every run; a file inside it would be
 * deleted before the promised-row spec could read it.
 */
export const SYSTEM_FACTS_PATH = join('node_modules', '.tmp', 'support-row', 'system.json')

/**
 * The machine-readable promised-row evidence file.
 *
 * The promised-row spec writes this file only after the environment record
 * passes validation, so a mismatched environment never leaves passing
 * evidence. The gate removes any stale file before a new run so the only
 * `environment.json` present belongs to the latest accepted run.
 */
export const ENVIRONMENT_RECORD_PATH = join('test-results', 'support-row', 'environment.json')

/**
 * The machine-readable Phase 6 startup evidence file.
 *
 * The promised-row spec writes this file only after the built product
 * reports every ordered startup gate success and the startup record passes
 * validation, so a headless launch, a software adapter, a failed gate, or
 * a mismatched record never leaves passing startup evidence. The gate
 * removes any stale file before a new run so the only `startup.json`
 * present belongs to the latest accepted run.
 */
export const STARTUP_RECORD_PATH = join('test-results', 'support-row', 'startup.json')

/**
 * The machine-readable Phase 7 Scene-load evidence file.
 *
 * The promised-row spec writes this file only after the built product
 * reaches `Ready` through the real Scene load and the Scene-load record
 * passes validation, so a failed or mismatched load never leaves passing
 * Scene-load evidence. The gate removes any stale file before a new run so
 * the only `scene-load.json` present belongs to the latest accepted run.
 */
export const SCENE_LOAD_RECORD_PATH = join('test-results', 'support-row', 'scene-load.json')

/**
 * The machine-readable frame-presentation evidence file.
 *
 * The promised-row spec writes this file only after the built product
 * presented the two projected initial Band members and advanced its
 * authored animation from the current projection tick and interpolation
 * value on the existing frame loop, and the frame-presentation record
 * passes validation (REQ-118, PVS-ARC-008). The gate removes any stale
 * file before a new run so the only `frame-presentation.json` present
 * belongs to the latest accepted run.
 */
export const FRAME_PRESENTATION_RECORD_PATH = join(
  'test-results',
  'support-row',
  'frame-presentation.json',
)

/**
 * Parse the product name and version from a Chromium `--version` output
 * line, e.g. `Chromium 151.0.7922.137 Arch Linux`.
 */
export function parseChromiumVersion(output: string): { name: string; version: string } | null {
  const match = /^(.+?)\s+(\d+\.\d+\.\d+\.\d+)/.exec(output.trim())
  if (match === null) {
    return null
  }
  return { name: match[1], version: match[2] }
}

/**
 * Resolve the system Chromium executable from `PATH` (ARCH-024).
 *
 * Returns the first existing candidate executable in `PATH` order, or
 * `null` when no candidate exists.
 */
export function resolveSystemChromium(pathEnv: string): string | null {
  for (const directory of pathEnv.split(delimiter)) {
    if (directory === '') {
      continue
    }
    for (const candidate of CHROMIUM_CANDIDATES) {
      const executable = join(directory, candidate)
      if (existsSync(executable)) {
        return executable
      }
    }
  }
  return null
}

/**
 * Read the product name and version of a Chromium executable with
 * `--version`, or `null` when the executable does not report a version.
 */
export function readChromiumInfo(executable: string): { name: string; version: string } | null {
  try {
    const output = execFileSync(executable, ['--version'], { encoding: 'utf8' })
    return parseChromiumVersion(output)
  } catch {
    return null
  }
}

/**
 * Read every GPU name and driver version row the system reports, or
 * `null` when no NVIDIA tool reports them.
 *
 * The promised-row acceptance requires exactly one host GPU and driver
 * row: a multi-GPU system could hide the promised device behind another
 * row, and an empty report proves nothing. The gate rejects any report
 * that is not exactly one row (REQ-012).
 */
export function readGpuDriverRows(): Array<{ gpu: string; driver: string }> | null {
  try {
    const output: string = execFileSync(
      'nvidia-smi',
      ['--query-gpu=name,driver_version', '--format=csv,noheader'],
      { encoding: 'utf8' },
    )
    const rows = output
      .split('\n')
      .map((line) => {
        const [gpu, driver] = line
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part !== '')
        if (gpu === undefined || driver === undefined) {
          return null
        }
        return { gpu, driver }
      })
      .filter((row): row is { gpu: string; driver: string } => row !== null)
    return rows.length > 0 ? rows : null
  } catch {
    return null
  }
}

/**
 * Marketing product-line labels removed before comparing GPU names.
 *
 * The NVIDIA vendor string reports the promise's GPU as
 * `NVIDIA GeForce RTX 2070 SUPER`: `GeForce` is the product-line label,
 * not part of the model name. Removing known labels before comparing lets
 * the promised model match its vendor report without accepting a variant.
 */
const GPU_LINE_LABELS: readonly string[] = ['geforce']

/**
 * Whether the vendor-reported GPU matches the promised GPU exactly.
 *
 * Both names are lower-cased and tokenized; known marketing product-line
 * labels (`GeForce`) are removed from the vendor report, and the promised
 * name must then match the vendor report token-for-token (set equality).
 * The promised `NVIDIA RTX 2070 SUPER` matches the vendor-reported
 * `NVIDIA GeForce RTX 2070 SUPER` but rejects every different model,
 * vendor, tier, or variant (e.g. `RTX 3080`, `GTX 2070 SUPER`,
 * `RTX 2070 SUPER Mobile`, `RTX 2070 SUPER Ti`) and every missing or
 * extra token (REQ-012).
 */
export function matchesPromisedGpu(vendorReported: string, promised: string): boolean {
  const modelTokens = (name: string): string[] =>
    name
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token !== '' && !GPU_LINE_LABELS.includes(token))
      .sort()
  const vendorTokens = modelTokens(vendorReported)
  const promisedTokens = modelTokens(promised)
  return (
    vendorTokens.length === promisedTokens.length &&
    vendorTokens.every((token, index) => token === promisedTokens[index])
  )
}

/**
 * Validate the resolved Chromium product name and version against the
 * promised browser (REQ-012). Returns the rejection reasons.
 */
export function validateChromiumInfo(
  promise: SupportPromise,
  info: { name: string; version: string },
): string[] {
  const rejections: string[] = []
  const row = promise.rows[0]
  if (info.name !== row.browser) {
    rejections.push(`Browser ${info.name} does not match the promised ${row.browser}.`)
  }
  if (info.version !== row.browserVersion) {
    rejections.push(
      `Browser version ${info.version} does not match the promised ${row.browserVersion}.`,
    )
  }
  return rejections
}

/**
 * Validate the host platform and architecture against the promised Linux
 * x64 platform (REQ-012). Returns the rejection reasons.
 */
export function validateHost(
  promise: SupportPromise,
  platform: string,
  architecture: string,
): string[] {
  const rejections: string[] = []
  const promised = promise.rows[0].platform
  const [promisedOs, promisedArchitecture] = promised.split(/\s+/).filter(Boolean)
  if (platform.toLowerCase() !== promisedOs?.toLowerCase()) {
    rejections.push(`Platform ${platform} does not match the promised ${promised}.`)
  }
  if (architecture.toLowerCase() !== promisedArchitecture?.toLowerCase()) {
    rejections.push(`Architecture ${architecture} does not match the promised ${promised}.`)
  }
  return rejections
}

/**
 * Validate the system GPU and driver against the promised GPU and driver
 * (REQ-012). Returns the rejection reasons.
 */
export function validateGpuDriver(
  promise: SupportPromise,
  gpu: string,
  driver: string,
): string[] {
  const rejections: string[] = []
  const row = promise.rows[0]
  if (!matchesPromisedGpu(gpu, row.gpu)) {
    rejections.push(`GPU ${gpu} does not match the promised ${row.gpu}.`)
  }
  if (driver !== row.driver) {
    rejections.push(`Driver ${driver} does not match the promised ${row.driver}.`)
  }
  return rejections
}

/**
 * The result of the pre-launch system check.
 */
export interface SupportRowSystemCheck {
  /** The verified system facts, or `null` when the environment is rejected. */
  readonly facts: SystemFacts | null
  /** The rejection reasons; empty when the environment matches. */
  readonly rejections: readonly string[]
}

/**
 * Check the local environment against the promised row before the browser
 * launches: resolve the system Chromium from `PATH`, verify the browser,
 * Linux x64 platform and architecture, GPU, and driver, and return the
 * verified facts or the rejection reasons (REQ-012).
 *
 * The acceptance launches the browser in headed mode through the active
 * desktop session (ARCH-024), so the check also rejects an environment
 * with no active graphical session: headed Chromium cannot launch there,
 * and a headless launch must never produce promised-row evidence.
 */
export function checkSupportRowSystem(promise: SupportPromise): SupportRowSystemCheck {
  const rejections: string[] = []

  // The headed promised-row browser needs the active desktop session
  // (REQ-012, ARCH-024): Chromium selects its display platform from the
  // session environment, and WebGPU needs that session. A tty-only
  // environment cannot run the acceptance, so it is rejected up front.
  if (process.env.DISPLAY === undefined && process.env.WAYLAND_DISPLAY === undefined) {
    rejections.push(
      'No active desktop session: neither DISPLAY nor WAYLAND_DISPLAY is set; the headed promised-row browser cannot launch.',
    )
  }

  const executable = resolveSystemChromium(process.env.PATH ?? '')
  if (executable === null) {
    rejections.push(
      `No system Chromium executable on PATH. Looked for: ${CHROMIUM_CANDIDATES.join(', ')}.`,
    )
  }

  let browserName = ''
  let browserVersion = ''
  if (executable !== null) {
    const info = readChromiumInfo(executable)
    if (info === null) {
      rejections.push(`The resolved Chromium executable does not report a version: ${executable}.`)
    } else {
      browserName = info.name
      browserVersion = info.version
      rejections.push(...validateChromiumInfo(promise, info))
    }
  }

  rejections.push(...validateHost(promise, process.platform, process.arch))

  // Require exactly one host GPU and driver row: a multi-GPU report could
  // hide the promised device behind another row (REQ-012).
  const gpuRows = readGpuDriverRows()
  if (gpuRows === null) {
    rejections.push('The system did not report an NVIDIA GPU and driver through nvidia-smi.')
  } else if (gpuRows.length !== 1) {
    rejections.push(
      `The system reported ${gpuRows.length} GPU rows; exactly one host GPU and driver row is required.`,
    )
  } else {
    const gpuDriver = gpuRows[0]
    rejections.push(...validateGpuDriver(promise, gpuDriver.gpu, gpuDriver.driver))
  }

  if (rejections.length > 0) {
    return { facts: null, rejections }
  }

  const facts: SystemFacts = {
    executablePath: executable as string,
    browser: browserName,
    browserVersion,
    platform: promise.rows[0].platform,
    architecture: promise.rows[0].platform.split(/\s+/).filter(Boolean)[1] ?? '',
    // The GPU model is the promised GPU name: the gate verified that the
    // vendor-reported device (e.g. `NVIDIA GeForce RTX 2070 SUPER`) token-
    // matches the promised model `NVIDIA RTX 2070 SUPER` (REQ-012).
    gpu: promise.rows[0].gpu,
    driver: gpuRows?.[0]?.driver ?? '',
    gpuRows: gpuRows?.length ?? 0,
  }
  return { facts, rejections }
}

/** Run the local promised-row acceptance: gate, then Playwright. */
function main(): void {
  // Remove any stale evidence from a previous run up front: whatever the
  // outcome of this run, the only `environment.json`, `startup.json`,
  // `scene-load.json`, and `frame-presentation.json` that may exist
  // afterwards belong to an accepted run of this invocation (REQ-013).
  rmSync(ENVIRONMENT_RECORD_PATH, { force: true })
  rmSync(STARTUP_RECORD_PATH, { force: true })
  rmSync(SCENE_LOAD_RECORD_PATH, { force: true })
  rmSync(FRAME_PRESENTATION_RECORD_PATH, { force: true })

  const { facts, rejections } = checkSupportRowSystem(SUPPORT_PROMISE)
  if (rejections.length > 0) {
    for (const rejection of rejections) {
      console.error(`Promised-row environment rejected: ${rejection}`)
    }
    console.error('The promised-row acceptance does not run on this environment.')
    process.exitCode = 1
    return
  }

  mkdirSync(join(SYSTEM_FACTS_PATH, '..'), { recursive: true })
  writeFileSync(SYSTEM_FACTS_PATH, `${JSON.stringify(facts, null, 2)}\n`)
  console.log(
    `Promised-row environment matches: ${facts?.executablePath} ${facts?.browser} ${facts?.browserVersion}`,
  )

  const result = spawnSync(
    'bun',
    ['x', 'playwright', 'test', '--config', SUPPORT_ROW_PLAYWRIGHT_CONFIG],
    { stdio: 'inherit' },
  )
  process.exitCode = result.status ?? 1
}

if (import.meta.main) {
  main()
}
