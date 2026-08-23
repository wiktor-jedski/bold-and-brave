/**
 * Public contract of the browser Input Adapter module (ARCH-007, ARCH-002,
 * ARCH-006, ARCH-008, ARCH-009, REQ-018, REQ-019, REQ-119).
 *
 * The Input Adapter normalizes supported browser keyboard, pointer, and
 * mouse interactions into target-tick gameplay commands for the Simulation
 * (ARCH-007, PVS-ARC-009). On the Overworld, primary-button click triggers
 * destination travel, secondary-button drag rotates the camera, the wheel
 * zooms the camera, and Space pauses and resumes travel (REQ-018, REQ-019,
 * PVS-FLW-002, PVS-FLW-003).
 *
 * The adapter preserves CSS-pixel coordinates, queries the Three.js
 * Presentation Adapter (ARCH-009) to resolve candidate ground positions,
 * and submits typed target-tick commands to the Simulation (ARCH-002).
 * Camera operations modify presentation state only and create no gameplay
 * commands. The Browser Runtime gameplay-input gate is checked before
 * ground resolution, command creation, and command submission (ARCH-006,
 * REQ-138).
 */
import type { Simulation } from '../../core/simulation'
import type { BrowserRuntime } from '../runtime'
import type { ScenePresenter } from '../presentation'

/**
 * Options for creating the browser Input Adapter (ARCH-007).
 */
export interface InputAdapterOptions {
  /** The authoritative Simulation seam receiving target-tick commands (ARCH-002). */
  readonly simulation: Simulation
  /** The Browser Runtime owning the gameplay-input acceptance gate (ARCH-006, REQ-138). */
  readonly runtime: BrowserRuntime
  /** The Three.js Presentation Adapter resolving ground positions and camera controls (ARCH-009). */
  readonly presenter: ScenePresenter
  /**
   * The DOM element or event target receiving pointer, mouse, and wheel events (ARCH-007).
   * Defaults to global window.
   */
  readonly target?: EventTarget | null
  /**
   * The DOM event target receiving keyboard events (ARCH-007).
   * Defaults to global window.
   */
  readonly keyboardTarget?: EventTarget | null
}

/**
 * The browser Input Adapter surface (ARCH-007).
 */
export interface InputAdapter {
  /**
   * Attach browser event listeners for pointer, mouse, wheel, and keyboard input.
   *
   * Attaching is idempotent: repeated calls while already attached do not add
   * duplicate listener paths (ARCH-007).
   */
  attach(): void

  /**
   * Detach all browser event listeners.
   *
   * Detaching removes all active listeners and resets drag state.
   */
  detach(): void

  /**
   * Whether the adapter is currently attached to its event targets.
   */
  isAttached(): boolean

  /**
   * Dispose the adapter and detach all listeners.
   */
  dispose(): void
}
