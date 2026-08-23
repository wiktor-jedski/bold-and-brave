/**
 * The browser Input Adapter implementation (ARCH-007, ARCH-002, ARCH-006,
 * ARCH-008, ARCH-009, REQ-018, REQ-019, REQ-119).
 *
 * The adapter converts supported browser pointer, mouse, wheel, and keyboard
 * events into typed Simulation commands with target ticks (ARCH-007).
 * On the Overworld:
 *   - Primary-button click initiates movement to a candidate ground position
 *     resolved on authored traversable terrain by the Three.js presenter (ARCH-009,
 *     REQ-018, PVS-FLW-002);
 *   - Secondary-button drag rotates the top-down strategic camera (REQ-018);
 *   - Wheel input zooms the camera within authored distance bounds (REQ-018);
 *   - Space pauses and resumes travel (REQ-019, PVS-FLW-003).
 *
 * The Browser Runtime gameplay-input gate is checked before ground resolution,
 * command creation, and command submission (ARCH-006, REQ-138). Camera
 * operations create no gameplay commands (ARCH-007).
 */
import type { Simulation, SimulationCommand } from '../../core/simulation'
import type { BrowserRuntime } from '../runtime'
import type { ScenePresenter } from '../presentation'
import type { InputAdapter, InputAdapterOptions } from './interface'

/** Multiplier for converting CSS-pixel mouse delta to camera yaw and pitch radians (ARCH-009). */
export const CAMERA_ROTATION_SPEED = 0.005

/** Multiplier for converting wheel deltaY to camera distance change (ARCH-009). */
export const CAMERA_ZOOM_SPEED = 0.01

/** Maximum milliseconds between pointerup and click to consider them the same interaction. */
const DEDUPLICATION_WINDOW_MS = 100

/** Maximum CSS-pixel movement threshold between pointerup and click for deduplication. */
const DEDUPLICATION_DISTANCE_PX = 4

/**
 * Create the browser Input Adapter (ARCH-007).
 *
 * @param options Collaborators and optional event targets for the adapter.
 * @returns The initialized InputAdapter instance.
 */
export function createInputAdapter(options: InputAdapterOptions): InputAdapter {
  const simulation: Simulation = options.simulation
  const runtime: BrowserRuntime = options.runtime
  const presenter: ScenePresenter = options.presenter

  const defaultTarget = typeof window !== 'undefined' ? window : null
  const pointerTarget = options.target !== undefined ? options.target : defaultTarget
  const keyboardTarget = options.keyboardTarget !== undefined ? options.keyboardTarget : defaultTarget

  let attached = false
  let isSecondaryDragging = false
  let lastDragX = 0
  let lastDragY = 0

  let lastHandledClickTimestamp = 0
  let lastHandledClickX = 0
  let lastHandledClickY = 0

  function handlePrimaryClick(event: PointerEvent | MouseEvent): void {
    const clientX = event.clientX
    const clientY = event.clientY

    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return
    }

    const now = Date.now()
    if (
      now - lastHandledClickTimestamp < DEDUPLICATION_WINDOW_MS &&
      Math.hypot(clientX - lastHandledClickX, clientY - lastHandledClickY) < DEDUPLICATION_DISTANCE_PX
    ) {
      return
    }

    // 1. Check acceptsGameplayInput() before ground resolution (ARCH-006, ARCH-007, REQ-138)
    if (!runtime.acceptsGameplayInput()) {
      return
    }

    // Preserve CSS-pixel coordinates relative to target element or viewport
    let cssX = clientX
    let cssY = clientY

    const currentTarget = event.currentTarget ?? pointerTarget
    if (
      currentTarget !== null &&
      typeof (currentTarget as HTMLElement).getBoundingClientRect === 'function'
    ) {
      const rect = (currentTarget as HTMLElement).getBoundingClientRect()
      if (rect !== null && typeof rect === 'object') {
        cssX = clientX - (rect.left ?? 0)
        cssY = clientY - (rect.top ?? 0)
      }
    }

    // 2. Ask presenter to resolve candidate ground point (ARCH-009, REQ-018)
    const candidateGroundPoint = presenter.resolveGroundPosition(cssX, cssY)
    if (candidateGroundPoint === null) {
      return
    }

    // 3. Check acceptsGameplayInput() before command creation (ARCH-006, ARCH-007, REQ-138)
    if (!runtime.acceptsGameplayInput()) {
      return
    }

    // 4. Create target-tick destination command for the next target tick (ARCH-002, REQ-112)
    const projection = simulation.readProjection()
    const targetTick = projection.tick + 1
    const command: SimulationCommand = {
      kind: 'set-destination',
      targetTick,
      destination: candidateGroundPoint,
    }

    // 5. Check acceptsGameplayInput() before command submission (ARCH-006, ARCH-007, REQ-138)
    if (!runtime.acceptsGameplayInput()) {
      return
    }

    // 6. Submit command to the Simulation (ARCH-002, REQ-119)
    simulation.submitCommand(command)

    lastHandledClickTimestamp = now
    lastHandledClickX = clientX
    lastHandledClickY = clientY
  }

  function handlePointerDown(event: Event): void {
    const pointerEvent = event as PointerEvent | MouseEvent
    const button = pointerEvent.button

    if (button === 2) {
      // Secondary button -> start camera rotation drag (REQ-018)
      isSecondaryDragging = true
      lastDragX = pointerEvent.clientX
      lastDragY = pointerEvent.clientY
    }
  }

  function handlePointerMove(event: Event): void {
    const pointerEvent = event as PointerEvent | MouseEvent
    if (!isSecondaryDragging) {
      return
    }

    const clientX = pointerEvent.clientX
    const clientY = pointerEvent.clientY
    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      const deltaX = clientX - lastDragX
      const deltaY = clientY - lastDragY
      lastDragX = clientX
      lastDragY = clientY

      // Camera rotation creates no gameplay command (ARCH-007, ARCH-009)
      const deltaYaw = -deltaX * CAMERA_ROTATION_SPEED
      const deltaPitch = -deltaY * CAMERA_ROTATION_SPEED
      presenter.rotateCamera(deltaYaw, deltaPitch)
    }
  }

  function handlePointerUp(event: Event): void {
    const pointerEvent = event as PointerEvent | MouseEvent
    const button = pointerEvent.button

    if (button === 2) {
      isSecondaryDragging = false
      return
    }

    if (button === 0) {
      handlePrimaryClick(pointerEvent)
    }
  }

  function handleClick(event: Event): void {
    const mouseEvent = event as MouseEvent
    if (mouseEvent.button === 0) {
      handlePrimaryClick(mouseEvent)
    }
  }

  function handleWheel(event: Event): void {
    const wheelEvent = event as WheelEvent
    if (typeof wheelEvent.preventDefault === 'function') {
      wheelEvent.preventDefault()
    }

    const deltaY = wheelEvent.deltaY
    if (Number.isFinite(deltaY) && deltaY !== 0) {
      // Camera zoom creates no gameplay command (ARCH-007, ARCH-009)
      const deltaDistance = deltaY * CAMERA_ZOOM_SPEED
      presenter.zoomCamera(deltaDistance)
    }
  }

  function handleContextMenu(event: Event): void {
    if (typeof event.preventDefault === 'function') {
      event.preventDefault()
    }
  }

  function handleKeyDown(event: Event): void {
    const keyEvent = event as KeyboardEvent
    if (keyEvent.repeat) {
      return
    }

    if (keyEvent.code === 'Space' || keyEvent.key === ' ' || keyEvent.key === 'Spacebar') {
      if (typeof keyEvent.preventDefault === 'function') {
        keyEvent.preventDefault()
      }

      // Check acceptsGameplayInput() before command creation (ARCH-006, REQ-138)
      if (!runtime.acceptsGameplayInput()) {
        return
      }

      const projection = simulation.readProjection()
      const targetTick = projection.tick + 1
      const command: SimulationCommand = {
        kind: 'toggle-pause',
        targetTick,
      }

      // Check acceptsGameplayInput() before command submission (ARCH-006, REQ-138)
      if (!runtime.acceptsGameplayInput()) {
        return
      }

      simulation.submitCommand(command)
    }
  }

  return {
    attach(): void {
      if (attached) {
        return
      }
      attached = true

      if (pointerTarget !== null && typeof pointerTarget.addEventListener === 'function') {
        pointerTarget.addEventListener('pointerdown', handlePointerDown as EventListener)
        pointerTarget.addEventListener('pointermove', handlePointerMove as EventListener)
        pointerTarget.addEventListener('pointerup', handlePointerUp as EventListener)
        pointerTarget.addEventListener('click', handleClick as EventListener)
        pointerTarget.addEventListener('wheel', handleWheel as EventListener, { passive: false })
        pointerTarget.addEventListener('contextmenu', handleContextMenu as EventListener)
      }

      if (keyboardTarget !== null && typeof keyboardTarget.addEventListener === 'function') {
        keyboardTarget.addEventListener('keydown', handleKeyDown as EventListener)
      }
    },

    detach(): void {
      if (!attached) {
        return
      }
      attached = false
      isSecondaryDragging = false

      if (pointerTarget !== null && typeof pointerTarget.removeEventListener === 'function') {
        pointerTarget.removeEventListener('pointerdown', handlePointerDown as EventListener)
        pointerTarget.removeEventListener('pointermove', handlePointerMove as EventListener)
        pointerTarget.removeEventListener('pointerup', handlePointerUp as EventListener)
        pointerTarget.removeEventListener('click', handleClick as EventListener)
        pointerTarget.removeEventListener('wheel', handleWheel as EventListener)
        pointerTarget.removeEventListener('contextmenu', handleContextMenu as EventListener)
      }

      if (keyboardTarget !== null && typeof keyboardTarget.removeEventListener === 'function') {
        keyboardTarget.removeEventListener('keydown', handleKeyDown as EventListener)
      }
    },

    isAttached(): boolean {
      return attached
    },

    dispose(): void {
      this.detach()
    },
  }
}
