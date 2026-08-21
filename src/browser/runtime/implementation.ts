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
 *
 * Lifecycle: `start` begins the loop and is idempotent while running; the
 * ordinary `stop` cancels the pending frame and stays restartable. The
 * irreversible `terminalStop` (REQ-138, PVS-WEB-005) cancels the pending
 * frame, discards the accumulated frame debt and the time baseline, clears
 * the presenter slot, and makes every later `start` a no-op, so no hidden
 * tick can be dispatched and no frame can be presented while no frame can
 * be shown. `acceptsGameplayInput` is the input gate of ARCH-007: open only
 * while the normal runtime runs, closed during an ordinary stop, and
 * permanently closed after a terminal stop. The terminal stop never
 * advances or replaces the Simulation.
 */
export function createBrowserRuntime(
  simulation: Simulation,
  scheduler: FrameScheduler,
  presenterSlot: PresenterSlot = { presenter: null },
): BrowserRuntime {
  let running = false
  /** Whether the runtime received the irreversible terminal stop (REQ-138). */
  let terminal = false
  /** Elapsed time accumulated in fixed-tick units since the last dispatched tick. */
  let accumulatedTicks = 0
  /** Timestamp of the last rendered frame, or `null` before the first frame. */
  let previousTimestamp: number | null = null
  /** Handle of the pending frame request, or `null` when none is pending. */
  let frameHandle: number | null = null

  /** One rendered frame: accumulate elapsed time, dispatch due ticks, and present. */
  function frame(timestamp: number): void {
    // A callback the environment already handed out can still run after a
    // stop or terminal stop; the guard makes such an already-held callback
    // a no-op that cannot advance the Simulation or present (REQ-138).
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
      // A terminal stop is irreversible: every later `start` is a no-op,
      // so no frame can be scheduled and no hidden tick can be dispatched
      // after a terminal delivery failure (REQ-138, PVS-WEB-005).
      if (running || terminal) {
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
    terminalStop(): void {
      if (terminal) {
        return
      }
      terminal = true
      running = false
      if (frameHandle !== null) {
        scheduler.cancelFrame(frameHandle)
        frameHandle = null
      }
      // Discard the accumulated frame debt and the time baseline: no
      // retained whole interval or fractional remainder may later
      // dispatch a hidden tick while no frame can be shown (REQ-138).
      accumulatedTicks = 0
      previousTimestamp = null
      // Clear the presenter slot so no later presentation can occur.
      presenterSlot.presenter = null
    },
    acceptsGameplayInput(): boolean {
      // The gate is open only while the normal runtime runs. The terminal
      // stop keeps `running` false forever and blocks every later `start`,
      // so the gate stays closed permanently (REQ-138, ARCH-007).
      return running && !terminal
    },
  }
}
