import { describe, expect, it } from 'vitest'
import { createSimulation } from '../../core/simulation'
import { createBrowserRuntime } from './index'
import type { FrameCallback, FrameScheduler } from './index'

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

describe('Browser Runtime timing loop (ARCH-006, ARCH-008)', () => {
  it('advances exactly 60 ticks for one Simulation second of regular frame time', () => {
    const simulation = createSimulation()
    const scheduler = createControlledFrameScheduler()
    const runtime = createBrowserRuntime(simulation, scheduler)

    runtime.start()
    // The first frame only establishes the baseline timestamp.
    scheduler.fire(0)

    const frameDelta = 1000 / 60
    for (let frame = 1; frame <= 60; frame += 1) {
      scheduler.fire(frame * frameDelta)
    }

    expect(simulation.readProjection().tick).toBe(60)
    runtime.stop()
  })

  it('processes only 5 of 12 owed ticks from a delayed frame and retains the rest', () => {
    const simulation = createSimulation()
    const scheduler = createControlledFrameScheduler()
    const runtime = createBrowserRuntime(simulation, scheduler)

    runtime.start()
    scheduler.fire(0)
    // One delayed rendered frame of 200 ms owes 12 fixed intervals.
    scheduler.fire(200)

    expect(simulation.readProjection().tick).toBe(5)
    runtime.stop()
  })

  it('consumes the retained debt as 5 then 2 ticks when later frames each add less than one tick', () => {
    const simulation = createSimulation()
    const scheduler = createControlledFrameScheduler()
    const runtime = createBrowserRuntime(simulation, scheduler)

    runtime.start()
    scheduler.fire(0)
    scheduler.fire(200)

    expect(simulation.readProjection().tick).toBe(5)

    // Each later callback adds only 0.4 of one fixed interval, so the
    // retained whole-interval debt is what dispatches: 5, then the last 2.
    const subTickDelta = (1000 / 60) * 0.4
    scheduler.fire(200 + subTickDelta)
    expect(simulation.readProjection().tick).toBe(10)

    scheduler.fire(200 + 2 * subTickDelta)
    expect(simulation.readProjection().tick).toBe(12)
    runtime.stop()
  })

  it('combines a fractional remainder with later elapsed time instead of dropping it', () => {
    const simulation = createSimulation()
    const scheduler = createControlledFrameScheduler()
    const runtime = createBrowserRuntime(simulation, scheduler)

    runtime.start()
    scheduler.fire(0)
    // 25 ms is 1.5 fixed intervals: one whole tick plus a 0.5 remainder.
    scheduler.fire(25)
    expect(simulation.readProjection().tick).toBe(1)

    // The next frame adds 0.6 intervals; combined with the retained 0.5
    // remainder the second tick becomes due instead of being lost.
    scheduler.fire(35)
    expect(simulation.readProjection().tick).toBe(2)
    runtime.stop()
  })

  it('keeps start idempotent and stop cancels the pending frame request', () => {
    const simulation = createSimulation()
    const scheduler = createControlledFrameScheduler()
    const runtime = createBrowserRuntime(simulation, scheduler)

    runtime.start()
    runtime.start()
    expect(scheduler.pendingCount()).toBe(1)

    runtime.stop()
    expect(scheduler.pendingCount()).toBe(0)

    runtime.start()
    scheduler.fire(0)
    scheduler.fire(1000)
    expect(simulation.readProjection().tick).toBe(5)
    runtime.stop()
    expect(scheduler.pendingCount()).toBe(0)
  })

  it('restarts the frame loop with a fresh time baseline', () => {
    const simulation = createSimulation()
    const scheduler = createControlledFrameScheduler()
    const runtime = createBrowserRuntime(simulation, scheduler)

    runtime.start()
    scheduler.fire(0)
    scheduler.fire(1000)
    expect(simulation.readProjection().tick).toBe(5)
    runtime.stop()

    // After a restart, one fresh fixed interval advances exactly one tick;
    // the previous accumulator is not carried over. A 17 ms delta is 1.02
    // fixed intervals, so exactly one tick is due.
    runtime.start()
    scheduler.fire(1000)
    scheduler.fire(1000 + 17)
    expect(simulation.readProjection().tick).toBe(6)
    runtime.stop()
  })
})
