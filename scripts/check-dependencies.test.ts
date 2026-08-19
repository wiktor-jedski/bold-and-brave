import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkProject, extractImports } from './check-dependencies'

/** Create a controlled fixture project with empty `core` and `browser` zones. */
function makeFixtureProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'bold-and-brave-deps-'))
  mkdirSync(join(root, 'core'))
  mkdirSync(join(root, 'browser'))
  return root
}

describe('dependency boundary rules (ARCH-001, ARCH-002, ARCH-024)', () => {
  it('fails on a core-to-browser import fixture', () => {
    const root = makeFixtureProject()
    try {
      writeFileSync(join(root, 'browser', 'main.ts'), 'export const boot = (): void => {}\n')
      writeFileSync(join(root, 'core', 'leaks.ts'), "import { boot } from '../browser/main'\n")

      const violations = checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('core-to-browser')
      expect(violations[0].importer).toBe('core/leaks.ts')
      expect(violations[0].imported).toBe('browser/main.ts')
      expect(violations[0].specifier).toBe('../browser/main')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a core-to-browser import that uses the emitted .js extension', () => {
    const root = makeFixtureProject()
    try {
      writeFileSync(join(root, 'browser', 'main.ts'), 'export const boot = (): void => {}\n')
      writeFileSync(join(root, 'core', 'leaks.ts'), "import { boot } from '../browser/main.js'\n")

      const violations = checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('core-to-browser')
      expect(violations[0].importer).toBe('core/leaks.ts')
      expect(violations[0].imported).toBe('browser/main.ts')
      expect(violations[0].specifier).toBe('../browser/main.js')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a browser import of a private Simulation implementation file', () => {
    const root = makeFixtureProject()
    try {
      mkdirSync(join(root, 'core', 'simulation'))
      writeFileSync(join(root, 'core', 'simulation', 'index.ts'), 'export { createSimulation } from "./implementation"\n')
      writeFileSync(join(root, 'core', 'simulation', 'implementation.ts'), 'export const createSimulation = (): unknown => ({})\n')
      writeFileSync(join(root, 'browser', 'sneaks.ts'), "import { createSimulation } from '../core/simulation/implementation'\n")

      const violations = checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('browser-private-simulation')
      expect(violations[0].importer).toBe('browser/sneaks.ts')
      expect(violations[0].imported).toBe('core/simulation/implementation.ts')
      expect(violations[0].specifier).toBe('../core/simulation/implementation')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a browser import of a private Simulation implementation file using the emitted .js extension', () => {
    const root = makeFixtureProject()
    try {
      mkdirSync(join(root, 'core', 'simulation'))
      writeFileSync(join(root, 'core', 'simulation', 'index.ts'), 'export { createSimulation } from "./implementation"\n')
      writeFileSync(join(root, 'core', 'simulation', 'implementation.ts'), 'export const createSimulation = (): unknown => ({})\n')
      writeFileSync(join(root, 'browser', 'sneaks.ts'), "import { createSimulation } from '../core/simulation/implementation.js'\n")

      const violations = checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('browser-private-simulation')
      expect(violations[0].importer).toBe('browser/sneaks.ts')
      expect(violations[0].imported).toBe('core/simulation/implementation.ts')
      expect(violations[0].specifier).toBe('../core/simulation/implementation.js')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts a browser import of the public Simulation module entry, in both extension forms', () => {
    const root = makeFixtureProject()
    try {
      mkdirSync(join(root, 'core', 'simulation'))
      writeFileSync(join(root, 'core', 'simulation', 'index.ts'), 'export const createSimulation = (): unknown => ({})\n')
      writeFileSync(join(root, 'browser', 'main.ts'), "import { createSimulation } from '../core/simulation'\n")
      writeFileSync(join(root, 'browser', 'other.ts'), "import { createSimulation as other } from '../core/simulation/index.js'\nvoid other\n")

      expect(checkProject(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts the Simulation module entry importing its own private implementation', () => {
    const root = makeFixtureProject()
    try {
      mkdirSync(join(root, 'core', 'simulation'))
      writeFileSync(join(root, 'core', 'simulation', 'index.ts'), 'export { createSimulation } from "./implementation"\n')
      writeFileSync(join(root, 'core', 'simulation', 'implementation.ts'), 'export const createSimulation = (): unknown => ({})\n')

      expect(checkProject(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts an empty fixture project', () => {
    const root = makeFixtureProject()
    try {
      expect(checkProject(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('import extraction (parser regression)', () => {
  it('ignores import-like text inside line comments', () => {
    const content = [
      "// import { boot } from '../browser/main'",
      "const note = 'keep' // from './core/simulation/implementation'",
    ].join('\n')

    expect(extractImports(content)).toEqual([])
  })

  it('ignores import-like text inside block comments, including multi-line ones', () => {
    const content = [
      '/*',
      "import { boot } from '../browser/main'",
      "from './core/simulation/implementation'",
      '*/',
      "const after = 'still fine'",
    ].join('\n')

    expect(extractImports(content)).toEqual([])
  })

  it('ignores import-like text inside string and template literals', () => {
    const content = [
      'const a = "from \'../browser/main\'"',
      'const b = \'import "./core/simulation/implementation"\'',
      "const c = `import('../browser/main')`",
      "const d = 'from ./fake'",
    ].join('\n')

    expect(extractImports(content)).toEqual([])
  })

  it('ignores identifiers that merely look like import or from usage', () => {
    const content = [
      'const url = import.meta.url',
      "const label = obj.from('./not-an-import')",
    ].join('\n')

    expect(extractImports(content)).toEqual([])
  })

  it('still detects a real import on a line that also contains a comment or string', () => {
    const content = [
      "import { createSimulation } from '../core/simulation' // public entry",
      "const s = 'from ./fake'",
    ].join('\n')

    expect(extractImports(content)).toEqual([{ specifier: '../core/simulation', line: 1 }])
  })

  it('detects every supported import form with correct specifiers and lines', () => {
    const content = [
      "import './side-effect.js'",
      "import('./lazy.js')",
      "export { thing } from './re-export.js'",
      "export * from './star.js'",
      "import type { Simulation } from './types.js'",
      'export { createSimulation } from "./implementation"',
      "import a from './a'; import b from './b'",
    ].join('\n')

    expect(extractImports(content)).toEqual([
      { specifier: './side-effect.js', line: 1 },
      { specifier: './lazy.js', line: 2 },
      { specifier: './re-export.js', line: 3 },
      { specifier: './star.js', line: 4 },
      { specifier: './types.js', line: 5 },
      { specifier: './implementation', line: 6 },
      { specifier: './a', line: 7 },
      { specifier: './b', line: 7 },
    ])
  })
})
