import { describe, expect, it, vi } from 'vitest'
import { createSimulation } from '../core/simulation'
import type { Simulation } from '../core/simulation'
import { createBrowserApplication } from './compositionRoot'

describe('browser composition root (ARCH-024)', () => {
  it('creates exactly one Simulation through the real core-owned factory', () => {
    const factory = vi.fn(createSimulation)
    const application = createBrowserApplication(factory)

    expect(factory).toHaveBeenCalledTimes(1)
    expect(application.name).toBe('Bold and Brave')
    expect(application.simulation.readProjection().tick).toBe(0)
  })

  it('hands the browser no state mutator, only the read-only Simulation seam', () => {
    const factory = vi.fn(createSimulation)
    const application = createBrowserApplication(factory)

    const simulation: Simulation = application.simulation
    expect(Object.keys(simulation)).toEqual(['readProjection'])
  })

  it('reads a frozen tick-0 initial projection and keeps a second read unchanged after a mutation attempt', () => {
    const factory = vi.fn(createSimulation)
    const application = createBrowserApplication(factory)

    expect(application.initialProjection.tick).toBe(0)
    expect(Object.isFrozen(application.initialProjection)).toBe(true)

    expect(() => {
      (application.initialProjection as { tick: number }).tick = 1
    }).toThrow(TypeError)

    expect(application.simulation.readProjection().tick).toBe(0)
  })
})
