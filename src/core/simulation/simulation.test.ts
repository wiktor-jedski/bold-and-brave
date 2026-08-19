import { describe, expect, it } from 'vitest'
import { createSimulation } from './index'
import type { Simulation, SimulationProjection } from './index'

describe('Simulation module', () => {
  it('exposes only the public Simulation interface from the factory', () => {
    const simulation = createSimulation()

    expect(Object.keys(simulation)).toEqual(['readProjection'])
    expect(simulation.readProjection).toBeTypeOf('function')

    const typed: Simulation = simulation
    expect(typed.readProjection()).toEqual({ tick: 0 })
  })

  it('reports the initial Simulation tick of 0 on two reads', () => {
    const simulation = createSimulation()

    expect(simulation.readProjection().tick).toBe(0)
    expect(simulation.readProjection().tick).toBe(0)
  })

  it('returns a frozen readonly projection', () => {
    const simulation = createSimulation()

    const projection = simulation.readProjection()
    expect(Object.isFrozen(projection)).toBe(true)
    // Runtime enforcement: even a caller that casts away readonly cannot mutate.
    expect(() => {
      (projection as { tick: number }).tick = 1
    }).toThrow(TypeError)
  })

  it('leaves a later read unchanged after a mutation attempt', () => {
    const simulation = createSimulation()

    const projection = simulation.readProjection()
    expect(() => {
      (projection as { tick: number }).tick = 1
    }).toThrow(TypeError)

    expect(simulation.readProjection().tick).toBe(0)
  })

  it('rejects mutable fields and browser types in the public interface at compile time', () => {
    const simulation: Simulation = createSimulation()

    // The assertions below are compile-time only: TypeScript must report an
    // error on each annotated line. A passing core typecheck therefore proves
    // that the public interface still rejects mutation and stays free of
    // browser-owned types. The wrapper never runs.
    const assertPurity = (): void => {
      const projection = simulation.readProjection()

      // @ts-expect-error the projection rejects mutation of its tick field
      projection.tick = 1

      type BrowserNode = { readonly ownerDocument: unknown }
      // @ts-expect-error a browser-owned type must not appear in the public projection
      const projectionWithBrowserField: SimulationProjection = { tick: 0, ownerDocument: null as unknown as BrowserNode }
      void projectionWithBrowserField
    }
    void assertPurity
  })
})
