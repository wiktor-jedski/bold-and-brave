import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkProject } from './check-dependencies'

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

  it('accepts a browser import of the public Simulation module entry', () => {
    const root = makeFixtureProject()
    try {
      mkdirSync(join(root, 'core', 'simulation'))
      writeFileSync(join(root, 'core', 'simulation', 'index.ts'), 'export const createSimulation = (): unknown => ({})\n')
      writeFileSync(join(root, 'browser', 'main.ts'), "import { createSimulation } from '../core/simulation'\nvoid createSimulation\n")

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
