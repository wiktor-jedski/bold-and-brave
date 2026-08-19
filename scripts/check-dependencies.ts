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
 * Relative import specifiers resolve against TypeScript source. The
 * extensionless form, an explicit `.ts` suffix, a directory `index.ts`, and
 * the emitted `.js` extension (which maps back to the `.ts` source) are all
 * recognized, so a `.js` import cannot bypass either boundary rule.
 *
 * Import extraction is a single-pass scanner that understands comments and
 * string literals: import-like text inside line comments, block comments,
 * string literals, and template literals never produces a specifier, while
 * real `import`/`export` ... `from` declarations, `import('...')` dynamic
 * imports, and side-effect imports are detected. Regex literals are outside
 * the scanner's scope.
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

const IDENTIFIER_START = /[A-Za-z_$]/
const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/

type ScanState = 'code' | 'line-comment' | 'block-comment' | 'import-clause' | 'export-clause'
type ClauseState = 'import-clause' | 'export-clause'

interface LineScanResult {
  readonly specifiers: string[]
  readonly inBlockComment: boolean
}

/**
 * Extract import specifiers with their 1-based source line numbers.
 *
 * Only imports written in real code produce specifiers; import-like text
 * inside line comments, block comments, string literals, and template
 * literals is ignored.
 */
export function extractImports(content: string): ImportSpecifier[] {
  const found: ImportSpecifier[] = []
  let inBlockComment = false

  content.split('\n').forEach((line, index) => {
    const scan = scanLine(line, inBlockComment)
    inBlockComment = scan.inBlockComment
    for (const specifier of scan.specifiers) {
      found.push({ specifier, line: index + 1 })
    }
  })

  return found
}

/**
 * Scan one source line for import specifiers.
 *
 * The scanner walks the line character by character, tracking comments and
 * string literals so that only imports written in real code are recorded.
 * `startsInBlockComment` carries an unterminated block comment from a
 * previous line; the result reports whether this line still ends inside one.
 */
function scanLine(line: string, startsInBlockComment: boolean): LineScanResult {
  const specifiers: string[] = []
  let state: ScanState = startsInBlockComment ? 'block-comment' : 'code'
  let resumeState: ScanState = 'code'
  let i = 0

  while (i < line.length) {
    const c = line[i]

    switch (state) {
      case 'code': {
        if (c === '/' && line[i + 1] === '/') {
          state = 'line-comment'
          i += 2
        } else if (c === '/' && line[i + 1] === '*') {
          state = 'block-comment'
          resumeState = 'code'
          i += 2
        } else if (c === "'" || c === '"' || c === '`') {
          // A string literal is opaque: skip it whole so its content cannot
          // be misread as an import.
          i = skipQuoted(line, i)
        } else if (IDENTIFIER_START.test(c)) {
          const end = readIdentifier(line, i)
          const word = line.slice(i, end)
          if (word === 'import' && isKeyword(line, i)) {
            const continuation = classifyImport(line, end)
            if (continuation.kind === 'clause') {
              state = 'import-clause'
            } else {
              specifiers.push(continuation.specifier)
            }
            i = continuation.end
          } else if (word === 'export' && isKeyword(line, i)) {
            state = 'export-clause'
            i = end
          } else {
            i = end
          }
        } else {
          i += 1
        }
        break
      }

      case 'line-comment':
        i = line.length
        break

      case 'block-comment': {
        if (c === '*' && line[i + 1] === '/') {
          state = resumeState
          i += 2
        } else {
          i += 1
        }
        break
      }

      case 'import-clause':
      case 'export-clause': {
        const step = scanClause(line, i, state, specifiers)
        if (step.nextState === 'block-comment') {
          resumeState = state
        }
        i = step.nextIndex
        state = step.nextState
        break
      }
    }
  }

  return { specifiers, inBlockComment: state === 'block-comment' }
}

type ImportContinuation =
  | { kind: 'clause'; end: number }
  | { kind: 'specifier'; specifier: string; end: number }

/**
 * Classify what follows the word `import` at `end`.
 *
 * `import('...')` and `import '...'` yield a specifier directly; any other
 * form (`import { x } from ...`, `import x from ...`, `import type ...`)
 * yields an import clause that still needs a `from` specifier.
 */
function classifyImport(line: string, end: number): ImportContinuation {
  let j = end
  while (j < line.length && isSpace(line[j])) j += 1
  const nextChar = line[j]

  if (nextChar === '(') {
    let k = j + 1
    while (k < line.length && isSpace(line[k])) k += 1
    if (line[k] === "'" || line[k] === '"') {
      const spec = readQuoted(line, k)
      return { kind: 'specifier', specifier: spec.value, end: spec.end }
    }
    return { kind: 'clause', end }
  }

  if (nextChar === "'" || nextChar === '"') {
    const spec = readQuoted(line, j)
    return { kind: 'specifier', specifier: spec.value, end: spec.end }
  }

  return { kind: 'clause', end }
}

interface ClauseStep {
  readonly nextIndex: number
  readonly nextState: ScanState
}

/**
 * Scan one position of an import or export clause for a `from '...'`
 * specifier. A specifier is recorded only when the word `from` is directly
 * followed by a quoted string.
 */
function scanClause(line: string, i: number, clause: ClauseState, specifiers: string[]): ClauseStep {
  const c = line[i]

  if (c === '/' && line[i + 1] === '/') {
    return { nextIndex: line.length, nextState: clause }
  }
  if (c === '/' && line[i + 1] === '*') {
    return { nextIndex: i + 2, nextState: 'block-comment' }
  }
  if (c === "'" || c === '"') {
    // A string inside a clause is not a specifier unless it follows
    // `from`; skip it whole so its content cannot be misread.
    return { nextIndex: skipQuoted(line, i), nextState: clause }
  }
  if (IDENTIFIER_START.test(c)) {
    const end = readIdentifier(line, i)
    const word = line.slice(i, end)
    if (word === 'from') {
      let j = end
      while (j < line.length && isSpace(line[j])) j += 1
      const quote = line[j]
      if (quote === "'" || quote === '"') {
        const spec = readQuoted(line, j)
        specifiers.push(spec.value)
        return { nextIndex: spec.end, nextState: 'code' }
      }
    }
    return { nextIndex: end, nextState: clause }
  }
  return { nextIndex: i + 1, nextState: clause }
}

function readIdentifier(line: string, start: number): number {
  let end = start + 1
  while (end < line.length && IDENTIFIER_CHAR.test(line[end])) end += 1
  return end
}

/** A keyword is recognized only when it is not an identifier or property access. */
function isKeyword(line: string, index: number): boolean {
  const prev = line[index - 1]
  return prev === undefined || (!IDENTIFIER_CHAR.test(prev) && prev !== '.')
}

function isSpace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\r'
}

/** Read a quoted string starting at its opening quote; returns value and index after the closing quote. */
function readQuoted(line: string, quoteIndex: number): { value: string; end: number } {
  const quote = line[quoteIndex]
  let i = quoteIndex + 1
  let value = ''
  while (i < line.length && line[i] !== quote) {
    if (line[i] === '\\' && i + 1 < line.length) {
      value += line[i + 1]
      i += 2
    } else {
      value += line[i]
      i += 1
    }
  }
  return { value, end: i < line.length ? i + 1 : i }
}

/** Skip a quoted string starting at its opening quote; returns the index after the closing quote. */
function skipQuoted(line: string, quoteIndex: number): number {
  const quote = line[quoteIndex]
  let i = quoteIndex + 1
  while (i < line.length && line[i] !== quote) {
    i += line[i] === '\\' && i + 1 < line.length ? 2 : 1
  }
  return i < line.length ? i + 1 : i
}

/**
 * Resolve a relative import specifier to an existing file.
 *
 * Tries the specifier as written, with a `.ts` extension, as a directory
 * `index.ts`, and — for the emitted-extension form — with a `.js` suffix
 * mapped back to the `.ts` source. Returns `null` for bare specifiers
 * (external packages and aliases, which the boundary rules do not cover)
 * and for unresolved relative specifiers.
 */
export function resolveImportedFile(importerFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) {
    return null
  }

  const base = resolve(dirname(importerFile), specifier)
  const candidates = [base, `${base}.ts`, join(base, 'index.ts')]
  if (base.endsWith('.js')) {
    candidates.push(`${base.slice(0, -'.js'.length)}.ts`)
  }
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
