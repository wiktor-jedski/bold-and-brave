import { describe, expect, it, vi } from 'vitest'
import { createSimulation } from '../core/simulation'
import type { Simulation } from '../core/simulation'
import { createBrowserApplication } from './compositionRoot'
import type { FrameCallback, FrameScheduler } from './runtime'

/** A controlled `requestAnimationFrame`-style scheduler for deterministic frame timestamps. */
interface ControlledFrameScheduler extends FrameScheduler {
  /** Fire the oldest pending frame callback with `timestamp`. */
  fire(timestamp: number): void
  /** Number of pending, not yet fired frame requests. */
  pendingCount(): number
}

/** Build a scheduler whose pending callbacks the test fires by hand. */
function createControlledFrameScheduler(): ControlledFrameScheduler {
  let nextHandle = 1
  let pending: Array<{ handle: number; callback: FrameCallback }> = []

  const scheduler: ControlledFrameScheduler = {
    requestFrame(callback) {
      const handle = nextHandle
      nextHandle += 1
      pending = [...pending, { handle, callback }]
      return handle
    },
    cancelFrame(handle) {
      pending = pending.filter((entry) => entry.handle !== handle)
    },
    fire(timestamp) {
      const [entry, ...rest] = pending
      if (entry === undefined) {
        throw new Error('no pending frame request to fire')
      }
      pending = rest
      entry.callback(timestamp)
    },
    pendingCount() {
      return pending.length
    },
  }
  return scheduler
}

describe('browser composition root (ARCH-024)', () => {
  it('creates exactly one Simulation through the real core-owned factory', () => {
    const factory = vi.fn(createSimulation)
    const application = createBrowserApplication(factory)

    expect(factory).toHaveBeenCalledTimes(1)
    expect(application.name).toBe('Bold and Brave')
    expect(application.simulation.readProjection().tick).toBe(0)
  })

  it('hands the browser the public Simulation seam with only the single advanceTick operation', () => {
    const factory = vi.fn(createSimulation)
    const application = createBrowserApplication(factory)

    const simulation: Simulation = application.simulation
    // The browser receives the public seam: one read operation and the single
    // fixed-tick advance operation. No scenario-only state mutator exists.
    expect(Object.keys(simulation)).toEqual(['readProjection', 'advanceTick'])
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

  it('wires exactly one runtime frame loop bound to the composed Simulation', () => {
    const factory = vi.fn(createSimulation)
    const scheduler = createControlledFrameScheduler()
    const application = createBrowserApplication(factory, scheduler)

    expect(factory).toHaveBeenCalledTimes(1)
    // Nothing runs before startup: no pending frame request exists.
    expect(scheduler.pendingCount()).toBe(0)

    application.runtime.start()
    // One runtime frame loop: exactly one pending frame request per frame.
    expect(scheduler.pendingCount()).toBe(1)

    application.runtime.stop()
    expect(scheduler.pendingCount()).toBe(0)
  })

  it('advances five ticks from a delayed frame and the retained debt on later frames through the same Simulation', () => {
    const factory = vi.fn(createSimulation)
    const scheduler = createControlledFrameScheduler()
    const application = createBrowserApplication(factory, scheduler)

    application.runtime.start()
    // The first frame only establishes the baseline timestamp.
    scheduler.fire(0)
    // One delayed rendered frame of 200 ms owes 12 fixed intervals; the
    // runtime processes at most five catch-up ticks per rendered frame.
    scheduler.fire(200)
    expect(application.simulation.readProjection().tick).toBe(5)

    // Each later callback adds only 0.4 of one fixed interval, so the
    // retained whole-interval debt is what dispatches: 5, then the last 2.
    const subTickDelta = (1000 / 60) * 0.4
    scheduler.fire(200 + subTickDelta)
    expect(application.simulation.readProjection().tick).toBe(10)

    scheduler.fire(200 + 2 * subTickDelta)
    expect(application.simulation.readProjection().tick).toBe(12)

    // The composed application exposes exactly one Simulation: the same
    // object the runtime advanced.
    expect(factory).toHaveBeenCalledTimes(1)

    application.runtime.stop()
    expect(scheduler.pendingCount()).toBe(0)
  })
})
