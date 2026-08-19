import type { Simulation } from '../../core/simulation'
import type { BrowserRuntime, FrameScheduler } from './interface'

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
 * The runtime owns browser-only lifecycle state only; gameplay truth stays
 * in the Simulation, which arrives through the public core-owned seam
 * (ARCH-002, REQ-121).
 */
export function createBrowserRuntime(
  simulation: Simulation,
  scheduler: FrameScheduler,
): BrowserRuntime {
  let running = false
  /** Elapsed time accumulated in fixed-tick units since the last dispatched tick. */
  let accumulatedTicks = 0
  /** Timestamp of the last rendered frame, or `null` before the first frame. */
  let previousTimestamp: number | null = null
  /** Handle of the pending frame request, or `null` when none is pending. */
  let frameHandle: number | null = null

  /** One rendered frame: accumulate elapsed time and dispatch due ticks. */
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

    previousTimestamp = timestamp
    frameHandle = scheduler.requestFrame(frame)
  }

  return {
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
