/**
 * Public contract of the Browser Runtime timing module (ARCH-006, ARCH-008).
 *
 * The runtime owns browser-only frame timing: it accumulates elapsed
 * rendered-frame time, advances the injected core-owned Simulation at one
 * fixed 60 Hz interval, and — after each fixed-tick batch — reads one
 * immutable projection and calls the bound Three.js presenter once from
 * the same frame loop (ARCH-008, ARCH-012). It never owns gameplay truth
 * (ARCH-006). The interface contains no DOM dependency beyond the injected
 * `requestAnimationFrame`-style scheduler, so tests can drive it with
 * controlled frame timestamps.
 */
import type { SimulationProjection } from '../../core/simulation'

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

/**
 * The Three.js presenter of one rendered frame (ARCH-008, ARCH-012).
 *
 * The Browser Runtime calls the presenter exactly once per rendered frame,
 * after the fixed-tick batch, passing only the current immutable
 * projection and the interpolation timing — the fractional fixed-tick
 * remainder between the settled projection tick and the next tick
 * (REQ-118). The presenter (ARCH-009) interpolates presentation only and
 * has no write path to the Simulation: it receives the projection value,
 * never the Simulation seam, so missing or delayed presentation output can
 * never change an authoritative result (PVS-ARC-008).
 */
export interface FramePresenter {
  /**
   * Present one frame from the current immutable projection and the
   * interpolation timing in fixed-tick units.
   */
  present(projection: SimulationProjection, interpolation: number): void
}

/**
 * The mutable presenter binding of the frame loop (ARCH-006, ARCH-008).
 *
 * The runtime starts before the startup Scene is loaded, so no presenter
 * exists yet; the Scene-loading handoff (ARCH-022) binds the Three.js
 * presenter into this slot after the real load passes. Until then the
 * runtime dispatches ticks and renders nothing; after the binding, every
 * rendered frame reads one projection and presents once.
 */
export interface PresenterSlot {
  /** The bound presenter, or `null` while no Scene is loaded. */
  presenter: FramePresenter | null
}

/** The Browser Runtime timing loop (ARCH-006). */
export interface BrowserRuntime {
  /**
   * The presenter slot of the frame loop (ARCH-008).
   *
   * The Scene-loading handoff binds the Three.js presenter here after the
   * startup Scene load passes; the runtime reads the slot on every
   * rendered frame. The slot is browser-only lifecycle wiring and carries
   * no gameplay truth.
   */
  readonly presenterSlot: PresenterSlot
  /** Start the frame loop. Scheduling the first frame is idempotent while running. */
  start(): void
  /**
   * Stop the frame loop and cancel the pending frame request.
   *
   * This is the ordinary lifecycle stop (ARCH-006): the runtime remains
   * restartable, and a later `start` begins a fresh frame loop with a new
   * time baseline. The accumulated frame debt is discarded by the next
   * `start`, which resets the accumulator.
   */
  stop(): void
  /**
   * Terminal-stop the runtime irreversibly (REQ-138, PVS-WEB-005).
   *
   * The terminal stop cancels the one pending frame, discards the
   * accumulated frame debt and the time baseline, clears the presenter
   * slot, and makes every later `start` call a no-op, so no hidden tick
   * can be dispatched and no frame can be presented while no frame can be
   * shown. It never advances or replaces the Simulation: the complete
   * immutable projection stays equal to the projection at the stop. The
   * ordinary restartable `stop` remains for normal lifecycle work
   * (ARCH-006, ARCH-023).
   */
  terminalStop(): void
  /**
   * Whether the runtime currently accepts gameplay input (ARCH-006,
   * ARCH-007).
   *
   * Returns `true` only while the normal runtime runs; returns `false`
   * during an ordinary lifecycle stop and remains `false` after a
   * terminal stop, even after a later `start` attempt. The Input Adapter
   * consults this gate before it creates or submits any gameplay command
   * (REQ-138, ARCH-007). No generic command module or gameplay-command
   * payload exists in this phase.
   */
  acceptsGameplayInput(): boolean
}
