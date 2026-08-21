import type { Simulation } from '../../core/simulation'
import type { BrowserRuntime, FrameScheduler, PresenterSlot } from './interface'

/**
 * One fixed Simulation tick interval: 60 ticks per Simulation second
 * (ARCH-005, REQ-113, PVS-ARC-003).
 */
const FIXED_TICK_INTERVAL_MS = 1000 / 60

/** Maximum catch-up ticks processed in one rendered frame (REQ-113, ARCH-008). */
const MAX_CATCH_UP_TICKS_PER_FRAME = 5

/**
 * Create the Browser Runtime timing loop (ARCH-006).
 *
 * The loop is driven by an injected `requestAnimationFrame`-style scheduler.
 * On each rendered frame it accumulates the elapsed callback time at the
 * fixed 60 Hz interval, advances the injected Simulation once per due
 * interval, processes at most five due ticks per frame, and retains every
 * undispatched whole interval plus the fractional remainder for later
 * frames, so a fixed tick is never dropped (ARCH-008, REQ-113, PVS-ARC-003).
 *
 * After each fixed-tick batch — including an empty batch on the baseline
 * frame — the runtime reads one immutable projection and, when the
 * presenter slot is bound, calls the Three.js presenter once from the same
 * frame loop, passing only the projection and the interpolation timing: the
 * fractional fixed-tick remainder between the settled projection tick and
 * the next tick (ARCH-008, ARCH-012, REQ-118). The runtime owns browser-only
 * lifecycle state and frame metrics only; gameplay truth stays in the
 * Simulation, which arrives through the public core-owned seam (ARCH-002,
 * REQ-121).
 *
 * `presenterSlot` is optional and defaults to an unbound slot: the runtime
 * starts before the startup Scene is loaded, and the Scene-loading handoff
 * binds the Three.js presenter into the slot after the real load passes
 * (ARCH-022). While no presenter is bound the runtime dispatches ticks and
 * schedules the next frame without presenting.
 */
export function createBrowserRuntime(
  simulation: Simulation,
  scheduler: FrameScheduler,
  presenterSlot: PresenterSlot = { presenter: null },
): BrowserRuntime {
  let running = false
  /** Elapsed time accumulated in fixed-tick units since the last dispatched tick. */
  let accumulatedTicks = 0
  /** Timestamp of the last rendered frame, or `null` before the first frame. */
  let previousTimestamp: number | null = null
  /** Handle of the pending frame request, or `null` when none is pending. */
  let frameHandle: number | null = null

  /** One rendered frame: accumulate elapsed time, dispatch due ticks, and present. */
  function frame(timestamp: number): void {
    if (!running) {
      return
    }

    if (previousTimestamp !== null) {
      accumulatedTicks += (timestamp - previousTimestamp) / FIXED_TICK_INTERVAL_MS
      const dueTicks = Math.floor(accumulatedTicks)
      const dispatchedTicks = Math.min(dueTicks, MAX_CATCH_UP_TICKS_PER_FRAME)
      for (let tick = 0; tick < dispatchedTicks; tick += 1) {
        simulation.advanceTick()
      }
      // Retain every undispatched whole interval and the fractional
      // remainder: only the dispatched ticks leave the accumulator.
      accumulatedTicks -= dispatchedTicks
    }

    // After the fixed-tick batch, read one immutable projection and call
    // the Three.js presenter once from the same frame loop, passing only
    // the projection and the interpolation timing — the fractional
    // fixed-tick remainder between the settled tick and the next tick
    // (ARCH-008, ARCH-012, REQ-118). While no presenter is bound (the
    // startup Scene is still loading) the runtime dispatches ticks and
    // schedules the next frame without reading or presenting.
    const presenter = presenterSlot.presenter
    if (presenter !== null) {
      const projection = simulation.readProjection()
      const interpolation = accumulatedTicks - Math.floor(accumulatedTicks)
      presenter.present(projection, interpolation)
    }

    previousTimestamp = timestamp
    frameHandle = scheduler.requestFrame(frame)
  }

  return {
    presenterSlot,
    start(): void {
      if (running) {
        return
      }
      running = true
      accumulatedTicks = 0
      previousTimestamp = null
      frameHandle = scheduler.requestFrame(frame)
    },
    stop(): void {
      if (!running) {
        return
      }
      running = false
      if (frameHandle !== null) {
        scheduler.cancelFrame(frameHandle)
        frameHandle = null
      }
    },
  }
}
