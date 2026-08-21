import { describe, expect, it } from 'vitest'
import { createSimulation } from '../../core/simulation'
import type { SimulationProjection } from '../../core/simulation'
import { createBrowserRuntime } from './index'
import type { FrameCallback, FramePresenter, FrameScheduler, PresenterSlot } from './index'

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

/**
 * The frame-presentation contract of the Browser Runtime (ARCH-008,
 * ARCH-012, REQ-118): after each fixed-tick batch the runtime reads one
 * immutable projection and calls the bound presenter once from the same
 * frame loop, passing only the projection and the interpolation timing —
 * the fractional fixed-tick remainder between the settled tick and the
 * next tick. All due ticks dispatch before the single projection read and
 * presentation call, and one next-frame request follows.
 */
describe('Browser Runtime frame presentation (ARCH-008, ARCH-012, REQ-118)', () => {
  /** A recording presenter capturing every received projection and interpolation value. */
  interface RecordingPresenter extends FramePresenter {
    readonly received: Array<{ projection: SimulationProjection; interpolation: number }>
  }

  /** Build a recording presenter. */
  function createRecordingPresenter(): RecordingPresenter {
    const received: Array<{ projection: SimulationProjection; interpolation: number }> = []
    return {
      received,
      present(projection: SimulationProjection, interpolation: number): void {
        received.push({ projection, interpolation })
      },
    }
  }

  /** Build an unbound presenter slot. */
  function createSlot(presenter: FramePresenter | null = null): PresenterSlot {
    return { presenter }
  }

  it('reads one immutable projection and presents once per rendered frame after the tick batch', () => {
    const simulation = createSimulation()
    const scheduler = createControlledFrameScheduler()
    const presenter = createRecordingPresenter()
    const runtime = createBrowserRuntime(simulation, scheduler, createSlot(presenter))

    runtime.start()
    // The baseline frame presents the initial projection at tick 0.
    scheduler.fire(0)
    // One regular frame of one fixed interval dispatches one tick and
    // presents the settled projection.
    const frameDelta = 1000 / 60
    scheduler.fire(frameDelta)
    // A second regular frame dispatches the next tick.
    scheduler.fire(2 * frameDelta)

    expect(presenter.received).toHaveLength(3)
    expect(presenter.received[0]?.projection.tick).toBe(0)
    expect(presenter.received[1]?.projection.tick).toBe(1)
    expect(presenter.received[2]?.projection.tick).toBe(2)
    for (const entry of presenter.received) {
      // The projection is the public immutable object: frozen and deeply
      // readonly, so presentation cannot write authoritative state.
      expect(Object.isFrozen(entry.projection)).toBe(true)
    }
    runtime.stop()
  })

  it('passes only the projection and the fractional interpolation timing between settled ticks', () => {
    const simulation = createSimulation()
    const scheduler = createControlledFrameScheduler()
    const presenter = createRecordingPresenter()
    const runtime = createBrowserRuntime(simulation, scheduler, createSlot(presenter))

    runtime.start()
    scheduler.fire(0)
    // 25 ms is 1.5 fixed intervals: one whole tick is dispatched and the
    // 0.5 fractional remainder is the interpolation value.
    scheduler.fire(25)
    // The next frame adds 0.6 intervals: combined with the retained 0.5
    // remainder, 1.1 fixed intervals are due — one tick dispatches and the
    // 0.1 remainder is the interpolation value.
    scheduler.fire(35)

    expect(presenter.received[1]?.projection.tick).toBe(1)
    expect(presenter.received[1]?.interpolation).toBeCloseTo(0.5, 12)
    expect(presenter.received[2]?.projection.tick).toBe(2)
    expect(presenter.received[2]?.interpolation).toBeCloseTo(0.1, 12)
    runtime.stop()
  })

  it('presents the settled projection with zero interpolation while retained catch-up debt exists', () => {
    const simulation = createSimulation()
    const scheduler = createControlledFrameScheduler()
    const presenter = createRecordingPresenter()
    const runtime = createBrowserRuntime(simulation, scheduler, createSlot(presenter))

    runtime.start()
    scheduler.fire(0)
    // One delayed frame of 200 ms owes 12 ticks; five dispatch and the
    // seven retained whole intervals mean the presentation is exactly at
    // the settled tick with zero interpolation.
    scheduler.fire(200)

    expect(simulation.readProjection().tick).toBe(5)
    expect(presenter.received).toHaveLength(2)
    expect(presenter.received[1]).toEqual({
      projection: simulation.readProjection(),
      interpolation: 0,
    })
    runtime.stop()
  })

  it('dispatches all due ticks before the one projection read and one presentation call, then requests the next frame', () => {
    const simulation = createSimulation()
    const scheduler = createControlledFrameScheduler()
    const presenter = createRecordingPresenter()
    const runtime = createBrowserRuntime(simulation, scheduler, createSlot(presenter))

    runtime.start()
    scheduler.fire(0)
    scheduler.fire(200)

    // All due ticks dispatched first: the presented projection is already
    // the settled tick-5 state. Exactly one presentation call followed,
    // and one next-frame request is pending (ARCH-008).
    expect(presenter.received).toHaveLength(2)
    expect(presenter.received[1]?.projection.tick).toBe(5)
    expect(scheduler.pendingCount()).toBe(1)

    runtime.stop()
    expect(scheduler.pendingCount()).toBe(0)
  })

  it('presents nothing while no presenter is bound and starts presenting from the next frame after binding', () => {
    const simulation = createSimulation()
    const scheduler = createControlledFrameScheduler()
    const presenter = createRecordingPresenter()
    const slot = createSlot(null)
    const runtime = createBrowserRuntime(simulation, scheduler, slot)

    runtime.start()
    scheduler.fire(0)
    scheduler.fire(1000 / 60)
    // No presenter is bound yet (the startup Scene is still loading), so
    // the runtime dispatched the due ticks without presenting.
    expect(presenter.received).toHaveLength(0)
    expect(simulation.readProjection().tick).toBe(1)

    // The Scene-loading handoff binds the presenter into the runtime's
    // slot; the next rendered frame presents once.
    slot.presenter = presenter
    scheduler.fire(2 * (1000 / 60))
    expect(presenter.received).toHaveLength(1)
    expect(presenter.received[0]?.projection.tick).toBe(2)
    runtime.stop()
  })
})
