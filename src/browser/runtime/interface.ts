/**
 * Public contract of the Browser Runtime timing module (ARCH-006, ARCH-008).
 *
 * The runtime owns browser-only frame timing: it accumulates elapsed
 * rendered-frame time and advances the injected core-owned Simulation at
 * one fixed 60 Hz interval. It never owns gameplay truth (ARCH-006).
 * The interface contains no DOM dependency beyond the injected
 * `requestAnimationFrame`-style scheduler, so tests can drive it with
 * controlled frame timestamps.
 */

/** Callback signature of one rendered animation frame, as `requestAnimationFrame` provides it. */
export type FrameCallback = (timestamp: number) => void

/**
 * A `requestAnimationFrame`-style scheduler injected into the runtime.
 *
 * Injection keeps the timing loop testable with controlled timestamps and
 * lets the composition root bind the production `window.requestAnimationFrame`
 * scheduler (ARCH-024). `requestFrame` returns a handle that `cancelFrame`
 * cancels.
 */
export interface FrameScheduler {
  /** Request the next rendered frame; returns a handle for cancellation. */
  requestFrame(callback: FrameCallback): number
  /** Cancel the pending frame request identified by `handle`. */
  cancelFrame(handle: number): void
}

/** The Browser Runtime timing loop (ARCH-006). */
export interface BrowserRuntime {
  /** Start the frame loop. Scheduling the first frame is idempotent while running. */
  start(): void
  /** Stop the frame loop and cancel the pending frame request. */
  stop(): void
}
