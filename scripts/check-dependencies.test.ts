import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { checkProject, extractImports } from './check-dependencies'

const execFileAsync = promisify(execFile)

/** Create a controlled fixture project with empty `core` and `browser` zones. */
function makeFixtureProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'bold-and-brave-deps-'))
  mkdirSync(join(root, 'core'))
  mkdirSync(join(root, 'browser'))
  return root
}

/** Write a minimal Simulation module (public entry + private implementation) into the fixture. */
function writeSimulationModule(root: string): void {
  mkdirSync(join(root, 'core', 'simulation'))
  writeFileSync(join(root, 'core', 'simulation', 'index.ts'), 'export { createSimulation } from "./implementation"\n')
  writeFileSync(join(root, 'core', 'simulation', 'implementation.ts'), 'export const createSimulation = (): unknown => ({})\n')
}

describe('dependency boundary rules (ARCH-001, ARCH-002, ARCH-024)', () => {
  it('fails on a core-to-browser import fixture', async () => {
    const root = makeFixtureProject()
    try {
      writeFileSync(join(root, 'browser', 'main.ts'), 'export const boot = (): void => {}\n')
      writeFileSync(join(root, 'core', 'leaks.ts'), "import { boot } from '../browser/main'\n")

      const violations = await checkProject(root)

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

  it('fails on a core-to-browser import that uses the emitted .js extension', async () => {
    const root = makeFixtureProject()
    try {
      writeFileSync(join(root, 'browser', 'main.ts'), 'export const boot = (): void => {}\n')
      writeFileSync(join(root, 'core', 'leaks.ts'), "import { boot } from '../browser/main.js'\n")

      const violations = await checkProject(root)

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

  it('fails on a browser import of a private Simulation implementation file', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(join(root, 'browser', 'sneaks.ts'), "import { createSimulation } from '../core/simulation/implementation'\n")

      const violations = await checkProject(root)

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

  it('fails on a browser import of a private Simulation implementation file using the emitted .js extension', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(join(root, 'browser', 'sneaks.ts'), "import { createSimulation } from '../core/simulation/implementation.js'\n")

      const violations = await checkProject(root)

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

  it('accepts a browser import of the public Simulation module entry, in both extension forms', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(join(root, 'browser', 'main.ts'), "import { createSimulation } from '../core/simulation'\n")
      writeFileSync(join(root, 'browser', 'other.ts'), "import { createSimulation as other } from '../core/simulation/index.js'\nvoid other\n")

      expect(await checkProject(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts the Simulation module entry importing its own private implementation', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)

      expect(await checkProject(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a presentation file importing the public Simulation module entry (write path)', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      mkdirSync(join(root, 'browser', 'presentation'))
      writeFileSync(
        join(root, 'browser', 'presentation', 'presenter.ts'),
        "import { createSimulation } from '../../core/simulation'\nvoid createSimulation\n",
      )

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('browser-presentation-simulation-write')
      expect(violations[0].importer).toBe('browser/presentation/presenter.ts')
      expect(violations[0].imported).toBe('core/simulation/index.ts')
      expect(violations[0].specifier).toBe('../../core/simulation')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a presentation file importing a private Simulation implementation file (write path)', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      mkdirSync(join(root, 'browser', 'presentation'))
      writeFileSync(
        join(root, 'browser', 'presentation', 'presenter.ts'),
        "import { createSimulation } from '../../core/simulation/implementation'\nvoid createSimulation\n",
      )

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('browser-private-simulation')
      expect(violations[0].importer).toBe('browser/presentation/presenter.ts')
      expect(violations[0].imported).toBe('core/simulation/implementation.ts')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts a presentation file importing the projection type from the neutral core root', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(
        join(root, 'core', 'index.ts'),
        "export type { SimulationProjection } from './simulation'\n",
      )
      mkdirSync(join(root, 'browser', 'presentation'))
      writeFileSync(
        join(root, 'browser', 'presentation', 'presenter.ts'),
        "import type { SimulationProjection } from '../../core'\nconst p: SimulationProjection | null = null\nvoid p\n",
      )

      expect(await checkProject(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts a non-presentation browser file importing the public Simulation module entry', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(
        join(root, 'browser', 'runtime.ts'),
        "import { createSimulation } from '../core/simulation'\nvoid createSimulation\n",
      )

      expect(await checkProject(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a core content file importing the Three.js package', async () => {
    const root = makeFixtureProject()
    try {
      mkdirSync(join(root, 'core', 'content'))
      writeFileSync(join(root, 'core', 'content', 'leaks.ts'), "import { Scene } from 'three'\nvoid Scene\n")

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('core-content-import')
      expect(violations[0].importer).toBe('core/content/leaks.ts')
      expect(violations[0].imported).toBe('three')
      expect(violations[0].specifier).toBe('three')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a core content file importing a Three.js entry subpath', async () => {
    const root = makeFixtureProject()
    try {
      mkdirSync(join(root, 'core', 'content'))
      writeFileSync(
        join(root, 'core', 'content', 'leaks.ts'),
        "import { WebGPURenderer } from 'three/webgpu'\nvoid WebGPURenderer\n",
      )

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('core-content-import')
      expect(violations[0].importer).toBe('core/content/leaks.ts')
      expect(violations[0].imported).toBe('three/webgpu')
      expect(violations[0].specifier).toBe('three/webgpu')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a core content file importing browser code', async () => {
    const root = makeFixtureProject()
    try {
      mkdirSync(join(root, 'core', 'content'))
      writeFileSync(join(root, 'browser', 'main.ts'), 'export const boot = (): void => {}\n')
      writeFileSync(join(root, 'core', 'content', 'leaks.ts'), "import { boot } from '../../browser/main'\n")

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('core-content-import')
      expect(violations[0].importer).toBe('core/content/leaks.ts')
      expect(violations[0].imported).toBe('browser/main.ts')
      expect(violations[0].specifier).toBe('../../browser/main')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts a core content file importing only platform-neutral core content', async () => {
    const root = makeFixtureProject()
    try {
      mkdirSync(join(root, 'core', 'content'))
      writeFileSync(join(root, 'core', 'content', 'catalog.ts'), 'export const SCENE = 1\n')
      writeFileSync(join(root, 'core', 'content', 'reader.ts'), "import { SCENE } from './catalog'\nvoid SCENE\n")

      expect(await checkProject(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts an empty fixture project', async () => {
    const root = makeFixtureProject()
    try {
      expect(await checkProject(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('multiline imports and comment-as-whitespace', () => {
  it('fails on a multiline core-to-browser import clause', async () => {
    const root = makeFixtureProject()
    try {
      writeFileSync(join(root, 'browser', 'main.ts'), 'export const boot = (): void => {}\n')
      writeFileSync(join(root, 'core', 'leaks.ts'), "import {\n  boot,\n} from '../browser/main'\n")

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('core-to-browser')
      expect(violations[0].imported).toBe('browser/main.ts')
      expect(violations[0].specifier).toBe('../browser/main')
      expect(violations[0].line).toBe(3)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a multiline browser import of a private Simulation implementation file', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(join(root, 'browser', 'sneaks.ts'), "import {\n  createSimulation,\n} from '../core/simulation/implementation.js'\n")

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('browser-private-simulation')
      expect(violations[0].imported).toBe('core/simulation/implementation.ts')
      expect(violations[0].specifier).toBe('../core/simulation/implementation.js')
      expect(violations[0].line).toBe(3)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a multiline re-export of a private Simulation implementation file', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(join(root, 'browser', 'sneaks.ts'), "export {\n  createSimulation,\n} from '../core/simulation/implementation'\n")

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('browser-private-simulation')
      expect(violations[0].imported).toBe('core/simulation/implementation.ts')
      expect(violations[0].specifier).toBe('../core/simulation/implementation')
      expect(violations[0].line).toBe(3)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a core-to-browser side-effect import with a comment as whitespace', async () => {
    const root = makeFixtureProject()
    try {
      writeFileSync(join(root, 'browser', 'main.ts'), 'export const boot = (): void => {}\n')
      writeFileSync(join(root, 'core', 'leaks.ts'), "import /* needs boot */ '../browser/main.js'\n")

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('core-to-browser')
      expect(violations[0].imported).toBe('browser/main.ts')
      expect(violations[0].specifier).toBe('../browser/main.js')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a core-to-browser dynamic import with a comment as whitespace', async () => {
    const root = makeFixtureProject()
    try {
      writeFileSync(join(root, 'browser', 'main.ts'), 'export const boot = (): void => {}\n')
      writeFileSync(join(root, 'core', 'leaks.ts'), "import(/* needs boot */ '../browser/main.js')\n")

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('core-to-browser')
      expect(violations[0].imported).toBe('browser/main.ts')
      expect(violations[0].specifier).toBe('../browser/main.js')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a browser dynamic import of a private Simulation implementation file', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(join(root, 'browser', 'sneaks.ts'), "import(/* private */ '../core/simulation/implementation.js')\n")

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('browser-private-simulation')
      expect(violations[0].imported).toBe('core/simulation/implementation.ts')
      expect(violations[0].specifier).toBe('../core/simulation/implementation.js')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a core-to-browser dynamic import with an options argument', async () => {
    const root = makeFixtureProject()
    try {
      writeFileSync(join(root, 'browser', 'main.ts'), 'export const boot = (): void => {}\n')
      writeFileSync(join(root, 'core', 'leaks.ts'), "import('../browser/main.js', { with: { type: 'json' } })\n")

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('core-to-browser')
      expect(violations[0].imported).toBe('browser/main.ts')
      expect(violations[0].specifier).toBe('../browser/main.js')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a browser dynamic import of a private Simulation implementation file with an options argument', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(join(root, 'browser', 'sneaks.ts'), "import('../core/simulation/implementation.js', { with: { type: 'json' } })\n")

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('browser-private-simulation')
      expect(violations[0].imported).toBe('core/simulation/implementation.ts')
      expect(violations[0].specifier).toBe('../core/simulation/implementation.js')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts a browser dynamic import of the public Simulation entry with an options argument', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(join(root, 'browser', 'main.ts'), "import('../core/simulation/index.js', { with: { type: 'json' } })\n")

      expect(await checkProject(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a core-to-browser static template dynamic import', async () => {
    const root = makeFixtureProject()
    try {
      writeFileSync(join(root, 'browser', 'main.ts'), 'export const boot = (): void => {}\n')
      writeFileSync(join(root, 'core', 'leaks.ts'), 'import(`../browser/main.js`)\n')

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('core-to-browser')
      expect(violations[0].imported).toBe('browser/main.ts')
      expect(violations[0].specifier).toBe('../browser/main.js')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a browser static template dynamic import of a private Simulation implementation file', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(join(root, 'browser', 'sneaks.ts'), 'import(`../core/simulation/implementation.js`)\n')

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('browser-private-simulation')
      expect(violations[0].imported).toBe('core/simulation/implementation.ts')
      expect(violations[0].specifier).toBe('../core/simulation/implementation.js')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a browser static template dynamic import of a private Simulation implementation file with an options argument', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(join(root, 'browser', 'sneaks.ts'), 'import(`../core/simulation/implementation.js`, { with: { type: "json" } })\n')

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('browser-private-simulation')
      expect(violations[0].imported).toBe('core/simulation/implementation.ts')
      expect(violations[0].specifier).toBe('../core/simulation/implementation.js')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts a browser static template dynamic import of the public Simulation entry', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(join(root, 'browser', 'main.ts'), 'import(`../core/simulation/index.js`)\n')

      expect(await checkProject(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('ignores interpolated template dynamic imports in every zone', async () => {
    const root = makeFixtureProject()
    try {
      writeFileSync(join(root, 'browser', 'main.ts'), 'export const boot = (): void => {}\n')
      writeFileSync(join(root, 'core', 'simulation.ts'), 'export const createSimulation = (): unknown => ({})\n')
      writeFileSync(join(root, 'core', 'leaks.ts'), 'import(`../${zone}/main.js`)\n')
      writeFileSync(join(root, 'browser', 'sneaks.ts'), 'import(`../core/simulation/${file}.js`)\n')

      expect(await checkProject(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a core-to-browser dynamic import nested inside template interpolation', async () => {
    const root = makeFixtureProject()
    try {
      writeFileSync(join(root, 'browser', 'main.ts'), 'export const boot = (): void => {}\n')
      writeFileSync(join(root, 'core', 'leaks.ts'), "const hint = `prefix ${import('../browser/main.js')} suffix`\n")

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('core-to-browser')
      expect(violations[0].imported).toBe('browser/main.ts')
      expect(violations[0].specifier).toBe('../browser/main.js')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a browser dynamic import of a private Simulation implementation file nested inside template interpolation', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(join(root, 'browser', 'sneaks.ts'), "const hint = `prefix ${import('../core/simulation/implementation.js')} suffix`\n")

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('browser-private-simulation')
      expect(violations[0].imported).toBe('core/simulation/implementation.ts')
      expect(violations[0].specifier).toBe('../core/simulation/implementation.js')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a browser dynamic import with an options argument nested inside template interpolation', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(join(root, 'browser', 'sneaks.ts'), "const hint = `prefix ${import('../core/simulation/implementation.js', { with: { type: 'json' } })} suffix`\n")

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('browser-private-simulation')
      expect(violations[0].imported).toBe('core/simulation/implementation.ts')
      expect(violations[0].specifier).toBe('../core/simulation/implementation.js')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails on a core-to-browser dynamic import nested inside nested template interpolations', async () => {
    const root = makeFixtureProject()
    try {
      writeFileSync(join(root, 'browser', 'main.ts'), 'export const boot = (): void => {}\n')
      writeFileSync(join(root, 'core', 'leaks.ts'), "const hint = `outer ${`inner ${import('../browser/main.js')} inner`} outer`\n")

      const violations = await checkProject(root)

      expect(violations).toHaveLength(1)
      expect(violations[0].rule).toBe('core-to-browser')
      expect(violations[0].imported).toBe('browser/main.ts')
      expect(violations[0].specifier).toBe('../browser/main.js')
      expect(violations[0].line).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts a browser dynamic import of the public Simulation entry nested inside template interpolation', async () => {
    const root = makeFixtureProject()
    try {
      writeSimulationModule(root)
      writeFileSync(join(root, 'browser', 'main.ts'), "const hint = `prefix ${import('../core/simulation/index.js')} suffix`\n")

      expect(await checkProject(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps an interpolated import argument non-static even inside template interpolation', async () => {
    const root = makeFixtureProject()
    try {
      writeFileSync(join(root, 'browser', 'main.ts'), 'export const boot = (): void => {}\n')
      writeFileSync(join(root, 'core', 'leaks.ts'), 'const hint = `prefix ${import(`../${zone}/main.js`)} suffix`\n')

      expect(await checkProject(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('import extraction (parser regression)', () => {
  it('ignores import-like text inside line comments', async () => {
    const content = [
      "// import { boot } from '../browser/main'",
      "const note = 'keep' // from './core/simulation/implementation'",
    ].join('\n')

    expect(await extractImports(content)).toEqual([])
  })

  it('ignores import-like text inside block comments, including multi-line ones', async () => {
    const content = [
      '/*',
      "import { boot } from '../browser/main'",
      "from './core/simulation/implementation'",
      '*/',
      "const after = 'still fine'",
    ].join('\n')

    expect(await extractImports(content)).toEqual([])
  })

  it('ignores import-like text inside string and template literals', async () => {
    const content = [
      'const a = "from \'../browser/main\'"',
      'const b = \'import "./core/simulation/implementation"\'',
      "const c = `import('../browser/main')`",
      "const d = 'from ./fake'",
    ].join('\n')

    expect(await extractImports(content)).toEqual([])
  })

  it('ignores import-like text inside a multiline template literal', async () => {
    const content = [
      'const doc = `',
      "import { boot } from '../browser/main'",
      "from './core/simulation/implementation'",
      '`',
      "const after = 'still fine'",
    ].join('\n')

    expect(await extractImports(content)).toEqual([])
  })

  it('ignores identifiers that merely look like import or from usage', async () => {
    const content = [
      'const url = import.meta.url',
      "const label = obj.from('./not-an-import')",
      "export const value = from('not-an-import')",
    ].join('\n')

    expect(await extractImports(content)).toEqual([])
  })

  it('still detects a real import on a line that also contains a comment or string', async () => {
    const content = [
      "import { createSimulation } from '../core/simulation' // public entry",
      "const s = 'from ./fake'",
    ].join('\n')

    expect(await extractImports(content)).toEqual([{ specifier: '../core/simulation', line: 1 }])
  })

  it('detects every supported import form with correct specifiers and lines', async () => {
    const content = [
      "import './side-effect.js'",
      "import('./lazy.js')",
      "export { thing } from './re-export.js'",
      "export * from './star.js'",
      "import type { Simulation } from './types.js'",
      'export { createSimulation } from "./implementation"',
      "import a from './a'; import b from './b'",
      "export type * from './etstar.js'",
      "import { default as x } from './kw.js'",
      "import { type A } from './inline-type.js'",
      "import x = require('./req.js')",
      "import * as ns from './ns.js'",
      "export * as all from './all.js'",
      "import('./opt.js', { with: { type: 'json' } })",
      'import(`./template.js`)',
      'import(`./template-opt.js`, { with: { type: "json" } })',
    ].join('\n')

    expect(await extractImports(content)).toEqual([
      { specifier: './side-effect.js', line: 1 },
      { specifier: './lazy.js', line: 2 },
      { specifier: './re-export.js', line: 3 },
      { specifier: './star.js', line: 4 },
      { specifier: './types.js', line: 5 },
      { specifier: './implementation', line: 6 },
      { specifier: './a', line: 7 },
      { specifier: './b', line: 7 },
      { specifier: './etstar.js', line: 8 },
      { specifier: './kw.js', line: 9 },
      { specifier: './inline-type.js', line: 10 },
      { specifier: './req.js', line: 11 },
      { specifier: './ns.js', line: 12 },
      { specifier: './all.js', line: 13 },
      { specifier: './opt.js', line: 14 },
      { specifier: './template.js', line: 15 },
      { specifier: './template-opt.js', line: 16 },
    ])
  })

  it('does not treat a non-literal or interpolated dynamic import argument as a specifier', async () => {
    const content = [
      "const a = import('./prefix' + suffix)",
      'const b = import(`./interpolated-${name}.js`)',
      'const c = import(someVariable)',
      'const d = `import(\'./fake.js\')`',
    ].join('\n')

    expect(await extractImports(content)).toEqual([])
  })

  it('detects real dynamic imports inside template interpolation code', async () => {
    const content = [
      "const a = `prefix ${import('./inside.js')} suffix`",
      "const b = `prefix ${import(`./static-template.js`)} suffix`",
      "const c = `prefix ${import('./opt.js', { with: { type: 'json' } })} suffix`",
      "const d = `outer ${`inner ${import('./deep.js')} inner`} outer`",
      "const e = `outer ${`inner ${import(`./deep-template.js`)} inner`} outer`",
    ].join('\n')

    expect(await extractImports(content)).toEqual([
      { specifier: './inside.js', line: 1 },
      { specifier: './static-template.js', line: 2 },
      { specifier: './opt.js', line: 3 },
      { specifier: './deep.js', line: 4 },
      { specifier: './deep-template.js', line: 5 },
    ])
  })

  it('keeps interpolated import arguments non-static inside template interpolation', async () => {
    const content = [
      "const a = `prefix ${import(`./${name}.js`)} suffix`",
      "const b = `prefix ${import('./prefix' + suffix)} suffix`",
      "const c = `prefix ${import(variable)} suffix`",
    ].join('\n')

    expect(await extractImports(content)).toEqual([])
  })

  it('keeps import-like template text opaque alongside real interpolation imports', async () => {
    const content = [
      "const s = `import { x } from './fake.js'`",
      "const t = `text ${import('./real.js')} more`",
    ].join('\n')

    expect(await extractImports(content)).toEqual([{ specifier: './real.js', line: 2 }])
  })

  it('preserves clause state across newlines and comments for every clause shape', async () => {
    const content = [
      "import {\n  a,\n} from './multiline.js'",
      "import\n  type {\n    B,\n  } from './multiline-type.js'",
      "import /* c */\n  * as ns from './star-comment.js'",
      "export {\n  c,\n} from './multiline-export.js'",
      "export * from './star-multiline.js'",
    ].join('\n')

    expect((await extractImports(content)).map((entry) => entry.specifier)).toEqual([
      './multiline.js',
      './multiline-type.js',
      './star-comment.js',
      './multiline-export.js',
      './star-multiline.js',
    ])
  })
})

describe('compiler-server lifecycle', () => {
  it('lets a standalone Bun process exit after awaiting the public helpers', async () => {
    const scriptDir = mkdtempSync(join(tmpdir(), 'bold-and-brave-standalone-'))
    const checkerPath = join(process.cwd(), 'scripts', 'check-dependencies.ts')
    const script = [
      `import { extractImports, checkProject } from ${JSON.stringify(checkerPath)}`,
      `import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'`,
      `import { tmpdir } from 'node:os'`,
      `import { join } from 'node:path'`,
      `const specifiers = await extractImports("import { x } from './y.js'\\n")`,
      `const root = mkdtempSync(join(tmpdir(), 'standalone-fixture-'))`,
      `mkdirSync(join(root, 'core'))`,
      `mkdirSync(join(root, 'browser'))`,
      `writeFileSync(join(root, 'core', 'a.ts'), "import { x } from './b.ts'\\n")`,
      `writeFileSync(join(root, 'core', 'b.ts'), 'export const x = 1\\n')`,
      `writeFileSync(join(root, 'browser', 'main.ts'), 'export const boot = (): void => {}\\n')`,
      `const violations = await checkProject(root)`,
      `console.log(JSON.stringify({ specifiers, violations }))`,
    ].join('\n')
    const scriptPath = join(scriptDir, 'standalone.ts')
    writeFileSync(scriptPath, script)
    try {
      // The process must print its result and exit; a leaked compiler
      // server keeps the event loop alive and makes execFile time out.
      const { stdout } = await execFileAsync('bun', [scriptPath], { timeout: 10000, cwd: process.cwd() })
      expect(JSON.parse(stdout)).toEqual({
        specifiers: [{ specifier: './y.js', line: 1 }],
        violations: [],
      })
    } finally {
      rmSync(scriptDir, { recursive: true, force: true })
    }
  })
})
