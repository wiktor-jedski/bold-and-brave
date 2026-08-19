/**
 * Dependency rules for the Simulation boundary (ARCH-001, ARCH-002,
 * ARCH-024, REQ-121).
 *
 * Enforced rules:
 *   1. `core-to-browser`: a file under `src/core` must not import a file
 *      under `src/browser`.
 *   2. `browser-private-simulation`: a file under `src/browser` must not
 *      import a private Simulation implementation file — any entry of
 *      `src/core/simulation` other than the public module entry
 *      `index.ts` (ARCH-002).
 *
 * Run with `bun scripts/check-dependencies.ts`. The command exits 0 when
 * the scanned project has no violation and exits 1 otherwise, listing each
 * violation.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

export type RuleId = 'core-to-browser' | 'browser-private-simulation'

export interface DependencyViolation {
  readonly rule: RuleId
  /** Project-relative path of the file that contains the import. */
  readonly importer: string
  /** Project-relative path of the resolved import target. */
  readonly imported: string
  /** The import specifier as written. */
  readonly specifier: string
  /** 1-based line number of the import. */
  readonly line: number
}

export interface ImportSpecifier {
  readonly specifier: string
  readonly line: number
}

const CORE_ZONE = 'core'
const BROWSER_ZONE = 'browser'
const SIMULATION_DIR = 'simulation'
const PUBLIC_SIMULATION_ENTRY = 'index.ts'

const IMPORT_PATTERN = /\b(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g
const SIDE_EFFECT_PATTERN = /^\s*import\s*['"]([^'"]+)['"]/

/** Extract import specifiers with their 1-based source line numbers. */
export function extractImports(content: string): ImportSpecifier[] {
  const found: ImportSpecifier[] = []

  content.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(IMPORT_PATTERN)) {
      found.push({ specifier: match[1], line: index + 1 })
    }
    const sideEffect = line.match(SIDE_EFFECT_PATTERN)
    if (sideEffect !== null) {
      found.push({ specifier: sideEffect[1], line: index + 1 })
    }
  })

  return found
}

/**
 * Resolve a relative import specifier to an existing file.
 *
 * Tries the specifier as written, with a `.ts` extension, and as a
 * directory `index.ts`. Returns `null` for bare specifiers (external
 * packages and aliases, which the boundary rules do not cover) and for
 * unresolved relative specifiers.
 */
export function resolveImportedFile(importerFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) {
    return null
  }

  const base = resolve(dirname(importerFile), specifier)
  const candidates = [base, `${base}.ts`, join(base, 'index.ts')]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate
    }
  }

  return null
}

/** The project zone (`core`, `browser`, or `null`) a file lives in. */
export function zoneOf(srcRoot: string, file: string): string | null {
  const first = relative(srcRoot, file).split(sep)[0]
  return first === CORE_ZONE || first === BROWSER_ZONE ? first : null
}

/** Apply the boundary rules to one resolved import. */
export function checkRules(
  srcRoot: string,
  importerFile: string,
  importedFile: string,
  specifier: string,
  line: number,
): DependencyViolation | null {
  const importerZone = zoneOf(srcRoot, importerFile)
  const importedRel = relative(srcRoot, importedFile)

  if (importerZone === CORE_ZONE && importedRel.startsWith(`${BROWSER_ZONE}${sep}`)) {
    return { rule: 'core-to-browser', importer: toPosix(relative(srcRoot, importerFile)), imported: toPosix(importedRel), specifier, line }
  }

  if (importerZone === BROWSER_ZONE && importedRel.startsWith(`${CORE_ZONE}${sep}${SIMULATION_DIR}${sep}`)) {
    const tail = importedRel.slice(`${CORE_ZONE}${sep}${SIMULATION_DIR}${sep}`.length)
    if (tail !== PUBLIC_SIMULATION_ENTRY) {
      return { rule: 'browser-private-simulation', importer: toPosix(relative(srcRoot, importerFile)), imported: toPosix(importedRel), specifier, line }
    }
  }

  return null
}

/** Scan every TypeScript file under `srcRoot` for rule violations. */
export function checkProject(srcRoot: string): DependencyViolation[] {
  const violations: DependencyViolation[] = []

  for (const file of collectTypeScriptFiles(srcRoot)) {
    const content = readFileSync(file, 'utf8')
    for (const { specifier, line } of extractImports(content)) {
      const imported = resolveImportedFile(file, specifier)
      if (imported === null) {
        continue
      }
      const violation = checkRules(srcRoot, file, imported, specifier, line)
      if (violation !== null) {
        violations.push(violation)
      }
    }
  }

  return violations
}

function collectTypeScriptFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) {
      continue
    }
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectTypeScriptFiles(full, out)
    } else if (full.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

function toPosix(path: string): string {
  return path.split(sep).join('/')
}

function main(): void {
  const srcRoot = resolve('src')
  const violations = checkProject(srcRoot)

  for (const violation of violations) {
    console.error(`[${violation.rule}] ${violation.importer}:${violation.line} imports ${violation.imported}`)
  }

  if (violations.length > 0) {
    console.error(`Dependency rules failed: ${violations.length} violation(s).`)
    process.exit(1)
  }

  console.log('Dependency rules OK: no core-to-browser or private-Simulation import found.')
}

if (import.meta.main) {
  main()
}
