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
 * Import extraction uses the TypeScript tokenizer (the `typescript` package
 * already in the toolchain). Tokenization skips comments and whitespace, so
 * clause state spans newlines, comments act as whitespace inside side-effect
 * and dynamic imports, and template-literal content never yields an import.
 * A small finite automaton over the token stream accepts the grammar of
 * `import`/`export ... from` declarations, `import('...')` and
 * `import(\`...\`)` dynamic imports (with or without an options argument),
 * side-effect imports, and `import x = require('...')` assignments; any
 * token sequence outside that grammar is ignored. An interpolated template
 * specifier opens with a TemplateHead and is therefore never recorded as a
 * static import.
 *
 * Run with `bun scripts/check-dependencies.ts`. The command exits 0 when
 * the scanned project has no violation and exits 1 otherwise, listing each
 * violation.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { createScanner, LanguageVariant, SyntaxKind } from 'typescript/unstable/ast'
import type { Scanner } from 'typescript/unstable/ast'

export type RuleId = 'core-to-browser' | 'browser-private-simulation'

export interface DependencyViolation {
  readonly rule: RuleId
  /** Project-relative path of the file that contains the import. */
  readonly importer: string
  /** Project-relative path of the resolved import target. */
  readonly imported: string
  /** The import specifier as written. */
  readonly specifier: string
  /** 1-based line number of the import specifier. */
  readonly line: number
}

export interface ImportSpecifier {
  readonly specifier: string
  readonly line: number
}

interface Token {
  readonly kind: SyntaxKind
  /** Unquoted value for string and template tokens; raw text otherwise. */
  readonly value: string
  /** 0-based character offset of the token start. */
  readonly pos: number
}

type ClauseState =
  | 'start'
  | 'typeSeen'
  | 'defaultSeen'
  | 'expectBinding'
  | 'braces'
  | 'starSeen'
  | 'starAsSeen'
  | 'afterBindings'

const END_OF_FILE = SyntaxKind.EndOfFile

const CORE_ZONE = 'core'
const BROWSER_ZONE = 'browser'
const SIMULATION_DIR = 'simulation'
const PUBLIC_SIMULATION_ENTRY = 'index.ts'

/**
 * Extract import specifiers with their 1-based source line numbers.
 *
 * Only imports the TypeScript tokenizer accepts in real code produce
 * specifiers: comments, string literals, template literals, and multiline
 * constructs are handled by the tokenizer itself.
 */
export function extractImports(content: string): ImportSpecifier[] {
  const scanner = createScanner(true, LanguageVariant.Standard, content)
  const found: ImportSpecifier[] = []
  const templateFrames: number[] = []
  let token = scanToken(scanner)

  while (token.kind !== END_OF_FILE) {
    if (templateFrames.length > 0) {
      token = scanTemplateInterpolation(scanner, token, templateFrames)
    } else if (token.kind === SyntaxKind.ImportKeyword) {
      token = scanImport(scanner, found, content)
    } else if (token.kind === SyntaxKind.ExportKeyword) {
      token = scanExport(scanner, found, content)
    } else if (token.kind === SyntaxKind.TemplateHead) {
      // An interpolated template literal begins; its content is opaque.
      templateFrames.push(0)
      token = scanToken(scanner)
    } else {
      token = scanToken(scanner)
    }
  }

  return found
}

/**
 * Scan one token position inside a template interpolation. A closing brace
 * at depth zero ends the interpolation, so the scanner re-scans the
 * template continuation (`reScanTemplateToken`) instead of tokenizing the
 * template text as code. Template text and interpolated expressions never
 * produce imports. Returns the next token to process.
 */
function scanTemplateInterpolation(scanner: Scanner, token: Token, templateFrames: number[]): Token {
  if (token.kind === SyntaxKind.OpenBraceToken) {
    templateFrames[templateFrames.length - 1] += 1
    return scanToken(scanner)
  }
  if (token.kind === SyntaxKind.CloseBraceToken) {
    const depth = templateFrames[templateFrames.length - 1]
    if (depth > 0) {
      templateFrames[templateFrames.length - 1] = depth - 1
      return scanToken(scanner)
    }
    return rescanTemplate(scanner, templateFrames)
  }
  if (token.kind === SyntaxKind.TemplateHead) {
    // A nested template literal inside the interpolation.
    templateFrames.push(0)
    return scanToken(scanner)
  }
  return scanToken(scanner)
}

/** Re-scan a template continuation after `}` and return the token after it. */
function rescanTemplate(scanner: Scanner, templateFrames: number[]): Token {
  const kind = scanner.reScanTemplateToken(false)
  if (kind === SyntaxKind.TemplateTail || kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
    templateFrames.pop()
  }
  return scanToken(scanner)
}

/**
 * Scan the tokens that follow an `import` keyword and record any specifier.
 * Returns the current (already scanned) token after the import construct.
 */
function scanImport(
  scanner: Scanner,
  found: ImportSpecifier[],
  content: string,
): Token {
  let token = scanToken(scanner)

  if (token.kind === SyntaxKind.StringLiteral) {
    // Side-effect import: import 'spec'.
    record(found, token, content)
    return scanToken(scanner)
  }
  if (token.kind === SyntaxKind.OpenParenToken) {
    // Dynamic import: import('spec') / import(`spec`), each with an
    // optional options argument. An interpolated template opens with a
    // TemplateHead, not a NoSubstitutionTemplateLiteral, so its specifier
    // is never statically recorded.
    const inner = scanToken(scanner)
    if (inner.kind === SyntaxKind.StringLiteral || inner.kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
      const after = scanToken(scanner)
      if (after.kind === SyntaxKind.CloseParenToken) {
        record(found, inner, content)
      } else if (after.kind === SyntaxKind.CommaToken) {
        // An options argument follows; the specifier is still statically
        // known. Skip to the token after the matching close paren.
        record(found, inner, content)
        return skipToMatchingParen(scanner, after)
      }
      return after
    }
    return inner
  }
  if (token.kind === SyntaxKind.DotToken) {
    // import.meta: not an import clause.
    return token
  }

  return scanClause(scanner, token, 'import', found, content)
}

/**
 * Scan the tokens that follow an `export` keyword and record a re-export
 * specifier. Returns the current (already scanned) token after the
 * construct. Declarations such as `export const ...` or `export function`
 * consume no specifier and leave scanning untouched.
 */
function scanExport(
  scanner: Scanner,
  found: ImportSpecifier[],
  content: string,
): Token {
  let token = scanToken(scanner)

  if (token.kind === SyntaxKind.TypeKeyword) {
    // export type { ... } from ... | export type * from ...
    token = scanToken(scanner)
  }
  if (token.kind === SyntaxKind.OpenBraceToken || token.kind === SyntaxKind.AsteriskToken) {
    return scanClause(scanner, token, 'export', found, content)
  }

  return token
}

/**
 * Drive the import/export clause automaton until a `from 'spec'` is
 * consumed (recording the specifier) or the clause proves to be something
 * else. Returns the current (already scanned) token.
 */
function scanClause(
  scanner: Scanner,
  firstToken: Token,
  mode: 'import' | 'export',
  found: ImportSpecifier[],
  content: string,
): Token {
  let state: ClauseState = 'start'
  let token = firstToken

  while (token.kind !== END_OF_FILE) {
    switch (state) {
      case 'start': {
        if (mode === 'import' && token.kind === SyntaxKind.Identifier) {
          // Default import binding: import name from ...
          state = 'defaultSeen'
        } else if (token.kind === SyntaxKind.TypeKeyword && mode === 'import') {
          state = 'typeSeen'
        } else if (token.kind === SyntaxKind.OpenBraceToken) {
          state = 'braces'
        } else if (token.kind === SyntaxKind.AsteriskToken) {
          state = 'starSeen'
        } else if (token.kind === SyntaxKind.FromKeyword) {
          return expectFrom(scanner, found, content)
        } else {
          return token
        }
        token = scanToken(scanner)
        break
      }

      case 'typeSeen': {
        if (token.kind === SyntaxKind.Identifier && mode === 'import') {
          // import type name from ... (type-only default import)
          state = 'defaultSeen'
        } else if (token.kind === SyntaxKind.OpenBraceToken) {
          state = 'braces'
        } else if (token.kind === SyntaxKind.AsteriskToken) {
          state = 'starSeen'
        } else if (token.kind === SyntaxKind.FromKeyword) {
          return expectFrom(scanner, found, content)
        } else {
          return token
        }
        token = scanToken(scanner)
        break
      }

      case 'defaultSeen': {
        if (token.kind === SyntaxKind.CommaToken) {
          state = 'expectBinding'
        } else if (token.kind === SyntaxKind.FromKeyword) {
          return expectFrom(scanner, found, content)
        } else if (token.kind === SyntaxKind.EqualsToken) {
          // import x = require('spec')
          return scanRequireAssignment(scanner, found, content)
        } else {
          return token
        }
        token = scanToken(scanner)
        break
      }

      case 'expectBinding': {
        if (token.kind === SyntaxKind.OpenBraceToken) {
          state = 'braces'
        } else if (token.kind === SyntaxKind.AsteriskToken) {
          state = 'starSeen'
        } else {
          return token
        }
        token = scanToken(scanner)
        break
      }

      case 'braces': {
        if (token.kind === SyntaxKind.CloseBraceToken) {
          state = 'afterBindings'
        } else if (isBindingElementToken(token)) {
          // Identifiers, string-literal names, keywords (default, if, ...),
          // `as`, `type` modifiers, and commas inside the braces.
          // Continue scanning the binding list.
        } else {
          return token
        }
        token = scanToken(scanner)
        break
      }

      case 'starSeen': {
        if (token.kind === SyntaxKind.AsKeyword) {
          state = 'starAsSeen'
        } else if (token.kind === SyntaxKind.FromKeyword && mode === 'export') {
          // export * from 'spec'
          return expectFrom(scanner, found, content)
        } else {
          return token
        }
        token = scanToken(scanner)
        break
      }

      case 'starAsSeen': {
        if (token.kind === SyntaxKind.Identifier) {
          state = 'afterBindings'
        } else {
          return token
        }
        token = scanToken(scanner)
        break
      }

      case 'afterBindings': {
        if (token.kind === SyntaxKind.FromKeyword) {
          return expectFrom(scanner, found, content)
        }
        return token
      }
    }
  }

  return token
}

/** Consume `from 'spec'` when the current token is `from`; record the specifier. */
function expectFrom(
  scanner: Scanner,
  found: ImportSpecifier[],
  content: string,
): Token {
  const specifierToken = scanToken(scanner)
  if (specifierToken.kind === SyntaxKind.StringLiteral) {
    record(found, specifierToken, content)
    return scanToken(scanner)
  }
  return specifierToken
}

/**
 * Skip a dynamic-import options argument, starting at the comma that
 * separates it from the specifier, and return the token after the import
 * call's closing paren. Nested parens, braces, and brackets are balanced.
 */
function skipToMatchingParen(scanner: Scanner, startToken: Token): Token {
  let depth = 1 // the import call's own open paren
  let token = startToken
  while (token.kind !== END_OF_FILE) {
    if (
      token.kind === SyntaxKind.OpenParenToken ||
      token.kind === SyntaxKind.OpenBraceToken ||
      token.kind === SyntaxKind.OpenBracketToken
    ) {
      depth += 1
    } else if (
      token.kind === SyntaxKind.CloseParenToken ||
      token.kind === SyntaxKind.CloseBraceToken ||
      token.kind === SyntaxKind.CloseBracketToken
    ) {
      depth -= 1
      if (depth === 0) {
        return scanToken(scanner)
      }
    }
    token = scanToken(scanner)
  }
  return token
}

/** Consume `= require('spec')` after the current `=` token; record the specifier. */
function scanRequireAssignment(
  scanner: Scanner,
  found: ImportSpecifier[],
  content: string,
): Token {
  let token = scanToken(scanner)
  if (token.kind === SyntaxKind.RequireKeyword) {
    token = scanToken(scanner)
    if (token.kind === SyntaxKind.OpenParenToken) {
      token = scanToken(scanner)
      if (token.kind === SyntaxKind.StringLiteral) {
        record(found, token, content)
      }
    }
  }
  return token
}

/** Binding-list tokens allowed between the braces of an import/export clause. */
function isBindingElementToken(token: Token): boolean {
  const kind = token.kind
  return (
    kind === SyntaxKind.Identifier ||
    kind === SyntaxKind.StringLiteral ||
    kind === SyntaxKind.CommaToken ||
    kind === SyntaxKind.AsKeyword ||
    kind === SyntaxKind.TypeKeyword ||
    kind === SyntaxKind.DotToken ||
    (kind >= SyntaxKind.FirstKeyword && kind <= SyntaxKind.LastKeyword)
  )
}

function record(found: ImportSpecifier[], token: Token, content: string): void {
  found.push({ specifier: token.value, line: lineAt(content, token.pos) })
}

/** 1-based line number of a character offset. */
function lineAt(content: string, pos: number): number {
  let line = 1
  for (let i = 0; i < pos && i < content.length; i++) {
    if (content[i] === '\n') {
      line += 1
    }
  }
  return line
}

function scanToken(scanner: Scanner): Token {
  const kind = scanner.scan()
  return {
    kind,
    value: scanner.getTokenValue(),
    pos: scanner.getTokenStart(),
  }
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
