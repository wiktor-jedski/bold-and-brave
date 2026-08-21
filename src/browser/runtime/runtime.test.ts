import { describe, expect, it } from 'vitest'
import { createSimulation } from '../../core/simulation'
import type { SimulationProjection } from '../../core/simulation'
import { createBrowserRuntime } from './index'
import type { BrowserRuntime, FrameCallback, FramePresenter, FrameScheduler } from './index'

/** A controlled `requestAnimationFrame`-style scheduler for deterministic frame timestamps. */
interface ControlledFrameScheduler extends FrameScheduler {
  /** Fire the oldest pending frame callback with `timestamp`. */
  fire(timestamp: number): void
  /** Number of pending, not yet fired frame requests. */
  pendingCount(): number
  /**
   * The callback of the oldest pending frame, without removing it.
   *
   * This models a frame the environment has already handed out: the
   * runtime scheduled it, but the environment still holds the callback and
   * may invoke it even after `cancelFrame` (an in-flight `requestAnimationFrame`
   * callback cannot be revoked).
   */
  holdNext(): FrameCallback
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
    holdNext() {
      const [entry] = pending
      if (entry === undefined) {
        throw new Error('no pending frame request to hold')
      }
      return entry.callback
    },
  }
  return scheduler
}

/** A recording Three.js frame presenter for presentation assertions. */
function createRecordingPresenter(): {
  slot: { presenter: FramePresenter | null }
  calls: Array<{ projection: SimulationProjection; interpolation: number }>
} {
  const calls: Array<{ projection: SimulationProjection; interpolation: number }> = []
  return {
    slot: {
      presenter: {
        present(projection: SimulationProjection, interpolation: number): void {
          calls.push({ projection, interpolation })
        },
      },
    },
    calls,
  }
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

  it('terminal-stops between frame callbacks: cancels the pending frame, a held callback cannot advance or present, and later start schedules no frame', () => {
    const simulation = createSimulation()
    const scheduler = createControlledFrameScheduler()
    const recording = createRecordingPresenter()
    const runtime = createBrowserRuntime(simulation, scheduler, recording.slot)

    runtime.start()
    // The first frame only establishes the baseline timestamp and presents
    // the settled tick-0 projection.
    scheduler.fire(0)
    // One delayed rendered frame of 1000 ms owes 60 fixed intervals; the
    // runtime processes at most five catch-up ticks per rendered frame and
    // retains the rest as frame debt.
    scheduler.fire(1000)
    expect(simulation.readProjection().tick).toBe(5)
    expect(recording.calls).toHaveLength(2)

    // The environment already holds the next pending frame callback, so it
    // counts as an in-flight callback that cancelFrame cannot revoke.
    const heldCallback = scheduler.holdNext()

    // The terminal stop happens between controlled frame callbacks.
    const projectionAtStop = simulation.readProjection()
    runtime.terminalStop()

    // The pending frame is canceled and the presenter slot is cleared.
    expect(scheduler.pendingCount()).toBe(0)
    expect(runtime.presenterSlot.presenter).toBeNull()

    // The already-held callback runs after the stop: it cannot advance the
    // Simulation and cannot present.
    heldCallback(1000 + 1000 / 60)
    expect(simulation.readProjection().tick).toBe(5)
    expect(recording.calls).toHaveLength(2)

    // Later `start` calls schedule no frame: the terminal stop is
    // irreversible.
    runtime.start()
    runtime.start()
    expect(scheduler.pendingCount()).toBe(0)

    // The complete immutable projection stays equal to the projection at
    // the stop — the terminal stop neither advanced nor replaced the
    // Simulation (REQ-138, PVS-WEB-005).
    expect(simulation.readProjection()).toEqual(projectionAtStop)
  })

  it('acceptsGameplayInput is false before start, true while running, false during an ordinary stop, true after an ordinary restart, and permanently false after a terminal stop', () => {
    const simulation = createSimulation()
    const scheduler = createControlledFrameScheduler()
    const runtime = createBrowserRuntime(simulation, scheduler)

    // Before the runtime starts, no gameplay input is accepted.
    expect(runtime.acceptsGameplayInput()).toBe(false)

    // The gate is open only while the normal runtime runs.
    runtime.start()
    expect(runtime.acceptsGameplayInput()).toBe(true)

    // An ordinary lifecycle stop closes the gate...
    runtime.stop()
    expect(runtime.acceptsGameplayInput()).toBe(false)

    // ...but an ordinary restart reopens it.
    runtime.start()
    expect(runtime.acceptsGameplayInput()).toBe(true)

    // The terminal stop closes the gate permanently: even a later `start`
    // attempt cannot reopen it (REQ-138, ARCH-007).
    runtime.terminalStop()
    expect(runtime.acceptsGameplayInput()).toBe(false)
    runtime.start()
    expect(runtime.acceptsGameplayInput()).toBe(false)
    expect(runtime.acceptsGameplayInput()).toBe(false)
  })

  it('schedules no later frame when a presenter terminal-stops re-entrantly from inside a frame', () => {
    const simulation = createSimulation()
    const scheduler = createControlledFrameScheduler()
    let runtime: BrowserRuntime
    let stopped = false
    const presenter: FramePresenter = {
      present(): void {
        // A terminal delivery failure observed during presentation calls
        // the runtime's terminal stop synchronously from inside the
        // rendered frame (REQ-138, PVS-WEB-005).
        if (!stopped) {
          stopped = true
          runtime.terminalStop()
        }
      },
    }
    runtime = createBrowserRuntime(simulation, scheduler, { presenter })

    runtime.start()
    // The baseline frame runs the presenter, which terminal-stops the
    // runtime from inside the frame; no later frame may be scheduled.
    scheduler.fire(0)
    expect(scheduler.pendingCount()).toBe(0)
    expect(runtime.acceptsGameplayInput()).toBe(false)
    expect(simulation.readProjection().tick).toBe(0)

    // The terminal stop stays irreversible: later `start` calls schedule
    // no frame, and the one Simulation never advanced.
    runtime.start()
    expect(scheduler.pendingCount()).toBe(0)
    expect(runtime.acceptsGameplayInput()).toBe(false)
    expect(simulation.readProjection().tick).toBe(0)
  })
})
