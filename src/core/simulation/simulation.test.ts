import { describe, expect, it } from 'vitest'
import { createSimulation } from './index'
import type { Simulation, SimulationProjection } from './index'

describe('Simulation module', () => {
  it('exposes only the public Simulation interface from the factory', () => {
    const simulation = createSimulation()

    expect(Object.keys(simulation)).toEqual(['readProjection', 'advanceTick'])
    expect(simulation.readProjection).toBeTypeOf('function')
    expect(simulation.advanceTick).toBeTypeOf('function')

    const typed: Simulation = simulation
    expect(typed.readProjection()).toEqual({ tick: 0 })
  })

  it('reports the initial Simulation tick of 0 on two reads', () => {
    const simulation = createSimulation()

    expect(simulation.readProjection().tick).toBe(0)
    expect(simulation.readProjection().tick).toBe(0)
  })

  it('changes tick 0 to tick 1 with one public advanceTick call', () => {
    const simulation = createSimulation()

    expect(simulation.readProjection().tick).toBe(0)
    simulation.advanceTick()
    expect(simulation.readProjection().tick).toBe(1)
  })

  it('ends at exactly tick 60 after 60 advanceTick calls', () => {
    const simulation = createSimulation()

    for (let tick = 0; tick < 60; tick += 1) {
      simulation.advanceTick()
    }

    expect(simulation.readProjection().tick).toBe(60)
  })

  it('lets a scenario-style caller advance an exact requested count through the same operation', () => {
    const simulation = createSimulation()

    // ARCH-025 scenario callers advance exact ticks through the one public
    // advanceTick operation; there is no scenario-only state mutator.
    const advanceExactTicks = (count: number): void => {
      for (let tick = 0; tick < count; tick += 1) {
        simulation.advanceTick()
      }
    }

    advanceExactTicks(137)

    expect(simulation.readProjection().tick).toBe(137)
    // No extra advance happens after the requested count.
    expect(simulation.readProjection().tick).toBe(137)
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

  it('keeps every projection frozen and unchanged by later advanceTick calls', () => {
    const simulation = createSimulation()

    const atTickZero = simulation.readProjection()
    simulation.advanceTick()
    const atTickOne = simulation.readProjection()

    expect(Object.isFrozen(atTickZero)).toBe(true)
    expect(Object.isFrozen(atTickOne)).toBe(true)
    expect(atTickZero.tick).toBe(0)
    expect(atTickOne.tick).toBe(1)

    // An attempted projection mutation cannot change the Simulation tick.
    expect(() => {
      (atTickOne as { tick: number }).tick = 0
    }).toThrow(TypeError)
    expect(simulation.readProjection().tick).toBe(1)
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
