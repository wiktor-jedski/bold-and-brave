/**
 * Dependency rules for the Simulation boundary and the content catalog
 * (ARCH-001, ARCH-002, ARCH-016, ARCH-024, REQ-121).
 *
 * Enforced rules:
 *   1. `core-to-browser`: a file under `src/core` must not import a file
 *      under `src/browser`.
 *   2. `browser-private-simulation`: a file under `src/browser` must not
 *      import a private Simulation implementation file — any entry of
 *      `src/core/simulation` other than the public module entry
 *      `index.ts` (ARCH-002).
 *   3. `core-content-import`: a file under `src/core/content` — the
 *      Typed Content Catalog — must not import browser code or the
 *      Three.js package, so the platform-neutral manifest can never
 *      depend on a browser or rendering library (ARCH-016, REQ-121).
 *
 * Import extraction is a TypeScript AST traversal. The `typescript` package
 * already in the toolchain (v7) ships its native compiler as a server
 * process; source files are fed to it over a virtual filesystem and walked
 * with the AST predicates and `forEachChild`. Static module specifiers come
 * from import declarations, export declarations, import-equals
 * `require(...)` calls, and dynamic `import(...)` calls at any AST depth,
 * including inside nested template expressions. A specifier is static only
 * when it is a string literal or a no-substitution template literal;
 * interpolated arguments are ignored. Comments, strings, and template text
 * are never imports because the parser itself skips them.
 *
 * Relative import specifiers resolve against TypeScript source. The
 * extensionless form, an explicit `.ts` suffix, a directory `index.ts`, and
 * the emitted `.js` extension (which maps back to the `.ts` source) are all
 * recognized, so a `.js` import cannot bypass either boundary rule.
 *
 * Run with `bun scripts/check-dependencies.ts`. The command exits 0 when
 * the scanned project has no violation and exits 1 otherwise, listing each
 * violation.
 *
 * Each public operation (`extractImports`, `checkProject`) owns its own
 * compiler-server instance and closes it before the operation settles, so
 * a standalone process that awaits either helper can exit.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { API } from 'typescript/unstable/async'
import type { Project } from 'typescript/unstable/async'
import {
  SyntaxKind,
  isCallExpression,
  isExportDeclaration,
  isExternalModuleReference,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isStringLiteral,
} from 'typescript/unstable/ast'
import type { Node, NoSubstitutionTemplateLiteral, SourceFile, StringLiteral } from 'typescript/unstable/ast'
import type { FileSystem } from 'typescript/unstable/fs'

export type RuleId = 'core-to-browser' | 'browser-private-simulation' | 'core-content-import'

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

const CORE_ZONE = 'core'
const BROWSER_ZONE = 'browser'
const CONTENT_DIR = 'content'
const THREE_PACKAGE = 'three'
const SIMULATION_DIR = 'simulation'
const PUBLIC_SIMULATION_ENTRY = 'index.ts'

/** Virtual project root prefix served to the TypeScript compiler server. */
const VIRTUAL_ROOT = '/bold-and-brave'
const CONFIG_CONTENT = JSON.stringify({
  compilerOptions: {
    target: 'es2022',
    module: 'esnext',
    moduleResolution: 'bundler',
    noEmit: true,
    skipLibCheck: true,
  },
  include: ['src'],
})

let projectSequence = 0

/** A virtual filesystem view over one operation's file map. */
function createFileSystem(virtualFiles: Map<string, string>): FileSystem {
  return {
    fileExists(fileName) {
      return virtualFiles.has(fileName)
    },
    readFile(fileName) {
      return virtualFiles.get(fileName)
    },
    realpath: (path) => path,
    directoryExists(dir) {
      for (const key of virtualFiles.keys()) {
        if (key === dir || key.startsWith(`${dir}/`)) {
          return true
        }
      }
      return false
    },
    getAccessibleEntries(dir) {
      // Like createVirtualFileSystem: return the child names relative to the
      // queried directory, or `undefined` when the directory does not exist.
      const prefix = dir === VIRTUAL_ROOT ? `${VIRTUAL_ROOT}/` : dir.endsWith('/') ? dir : `${dir}/`
      const files = new Set<string>()
      const directories = new Set<string>()
      let found = false
      for (const key of virtualFiles.keys()) {
        if (!key.startsWith(prefix)) {
          continue
        }
        found = true
        const rest = key.slice(prefix.length)
        const slash = rest.indexOf('/')
        if (slash === -1) {
          files.add(rest)
        } else {
          directories.add(rest.slice(0, slash))
        }
      }
      return found ? { files: [...files], directories: [...directories] } : undefined
    },
  }
}

/**
 * Populate a fresh virtual project with `files` (keyed by their paths
 * relative to the project root, e.g. `src/core/a.ts`), open it, and run
 * `run` with the parsed project and its `src` prefix.
 *
 * Each public operation owns its own compiler-server instance: the server
 * is created here and always closed before the operation settles, so a
 * standalone process that awaits `extractImports` or `checkProject` can
 * exit. Every call uses a unique virtual root so the server never serves
 * stale file contents.
 */
async function withProject<T>(
  files: Record<string, string>,
  run: (project: Project, srcPrefix: string) => Promise<T>,
): Promise<T> {
  projectSequence += 1
  const root = `${VIRTUAL_ROOT}-${projectSequence}`
  const configPath = `${root}/tsconfig.json`
  const srcPrefix = `${root}/src`
  const virtualFiles = new Map<string, string>()

  virtualFiles.set(configPath, CONFIG_CONTENT)
  for (const [relativePath, content] of Object.entries(files)) {
    virtualFiles.set(`${root}/${relativePath}`, content)
  }

  const api = new API({ cwd: '/', fs: createFileSystem(virtualFiles) })
  try {
    const snapshot = await api.updateSnapshot({ openProjects: [configPath], fileChanges: { invalidateAll: true } })
    try {
      const project = snapshot.getProject(configPath)
      if (project === undefined) {
        throw new Error('The TypeScript compiler server did not open the virtual project.')
      }
      return await run(project, srcPrefix)
    } finally {
      await snapshot.dispose()
    }
  } finally {
    await api.close()
  }
}

/**
 * Collect the static import specifiers of a parsed source file.
 *
 * Walks the full AST: import declarations, export declarations,
 * import-equals `require(...)` calls, and dynamic `import(...)` calls at any
 * depth — including inside template interpolations. A specifier is static
 * only as a string literal or a no-substitution template literal.
 */
export function collectSpecifiers(sourceFile: SourceFile): ImportSpecifier[] {
  const found: ImportSpecifier[] = []

  const visit = (node: Node): void => {
    if (isImportDeclaration(node) || isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier
      if (moduleSpecifier !== undefined) {
        const specifier = staticSpecifierText(moduleSpecifier)
        if (specifier !== undefined) {
          found.push({ specifier, line: lineOf(sourceFile, moduleSpecifier) })
        }
      }
    } else if (isImportEqualsDeclaration(node) && isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression
      const specifier = staticSpecifierText(expression)
      if (specifier !== undefined) {
        found.push({ specifier, line: lineOf(sourceFile, expression) })
      }
    } else if (isCallExpression(node) && node.expression.kind === SyntaxKind.ImportKeyword && node.arguments.length >= 1) {
      const firstArgument = node.arguments[0]
      const specifier = staticSpecifierText(firstArgument)
      if (specifier !== undefined) {
        found.push({ specifier, line: lineOf(sourceFile, firstArgument) })
      }
    }
    node.forEachChild(visit)
  }

  visit(sourceFile)
  return found
}

/**
 * The static specifier text of a module-specifier node, or `undefined` for
 * interpolated template expressions, computed expressions, and identifiers.
 */
function staticSpecifierText(node: Node): string | undefined {
  if (isStringLiteral(node) || node.kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
    return (node as StringLiteral | NoSubstitutionTemplateLiteral).text
  }
  return undefined
}

/** 1-based line number of a node in its source file. */
function lineOf(sourceFile: SourceFile, node: Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
}

/**
 * Extract the static import specifiers of one TypeScript source text.
 *
 * The content is parsed as a virtual file by the compiler server.
 */
export async function extractImports(content: string): Promise<ImportSpecifier[]> {
  return withProject({ 'src/probe.ts': content }, async (project, srcPrefix) => {
    const sourceFile = await project.program.getSourceFile(`${srcPrefix}/probe.ts`)
    return sourceFile === undefined ? [] : collectSpecifiers(sourceFile)
  })
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

/** Whether a bare specifier is the Three.js package or one of its entries. */
export function isThreeImport(specifier: string): boolean {
  return specifier === THREE_PACKAGE || specifier.startsWith(`${THREE_PACKAGE}/`)
}

/** Apply the boundary rules to one resolved import. */
export function checkRules(
  srcRoot: string,
  importerFile: string,
  importedFile: string | null,
  specifier: string,
  line: number,
): DependencyViolation | null {
  const importerZone = zoneOf(srcRoot, importerFile)
  const importerRel = relative(srcRoot, importerFile)
  const importerInContent =
    importerZone === CORE_ZONE && importerRel.startsWith(`${CORE_ZONE}${sep}${CONTENT_DIR}${sep}`)

  // The Typed Content Catalog must stay platform-neutral: a core content
  // file must not import browser code or the Three.js package (ARCH-016,
  // REQ-121). Bare package specifiers resolve to no file, so the rule also
  // inspects the specifier itself.
  if (importerInContent) {
    const importedRel = importedFile === null ? null : relative(srcRoot, importedFile)
    const browserImport = importedRel?.startsWith(`${BROWSER_ZONE}${sep}`) ?? false
    const threeImport = importedFile === null && isThreeImport(specifier)
    if (browserImport || threeImport) {
      return {
        rule: 'core-content-import',
        importer: toPosix(relative(srcRoot, importerFile)),
        imported: toPosix(importedRel ?? specifier),
        specifier,
        line,
      }
    }
  }

  if (importerZone === CORE_ZONE && importedFile !== null) {
    const importedRel = relative(srcRoot, importedFile)
    if (importedRel.startsWith(`${BROWSER_ZONE}${sep}`)) {
      return { rule: 'core-to-browser', importer: toPosix(relative(srcRoot, importerFile)), imported: toPosix(importedRel), specifier, line }
    }
  }

  if (importerZone === BROWSER_ZONE && importedFile !== null) {
    const importedRel = relative(srcRoot, importedFile)
    if (importedRel.startsWith(`${CORE_ZONE}${sep}${SIMULATION_DIR}${sep}`)) {
      const tail = importedRel.slice(`${CORE_ZONE}${sep}${SIMULATION_DIR}${sep}`.length)
      if (tail !== PUBLIC_SIMULATION_ENTRY) {
        return { rule: 'browser-private-simulation', importer: toPosix(relative(srcRoot, importerFile)), imported: toPosix(importedRel), specifier, line }
      }
    }
  }

  return null
}

/** Scan every TypeScript file under `srcRoot` for rule violations. */
export async function checkProject(srcRoot: string): Promise<DependencyViolation[]> {
  const files = collectTypeScriptFiles(srcRoot)
  const contentByRelativePath: Record<string, string> = {}
  const relativePathByFile = new Map<string, string>()

  for (const file of files) {
    const relativePath = `src/${toPosix(relative(srcRoot, file))}`
    contentByRelativePath[relativePath] = readFileSync(file, 'utf8')
    relativePathByFile.set(relativePath, file)
  }

  return withProject(contentByRelativePath, async (project, srcPrefix) => {
    const violations: DependencyViolation[] = []

    for (const [relativePath, importerFile] of relativePathByFile) {
      const sourceFile = await project.program.getSourceFile(`${srcPrefix}/${relativePath.slice('src/'.length)}`)
      if (sourceFile === undefined) {
        continue
      }
      for (const { specifier, line } of collectSpecifiers(sourceFile)) {
        const imported = resolveImportedFile(importerFile, specifier)
        const violation = checkRules(srcRoot, importerFile, imported, specifier, line)
        if (violation !== null) {
          violations.push(violation)
        }
      }
    }

    return violations
  })
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

async function main(): Promise<void> {
  const srcRoot = resolve('src')
  const violations = await checkProject(srcRoot)

  for (const violation of violations) {
    console.error(`[${violation.rule}] ${violation.importer}:${violation.line} imports ${violation.imported}`)
  }

  if (violations.length > 0) {
    console.error(`Dependency rules failed: ${violations.length} violation(s).`)
    process.exit(1)
  }

  console.log(
    'Dependency rules OK: no core-to-browser, private-Simulation, or core-content-import found.',
  )
}

if (import.meta.main) {
  await main()
}
