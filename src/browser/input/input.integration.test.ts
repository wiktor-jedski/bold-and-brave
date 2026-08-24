// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createSimulation } from '../../core/simulation'
import type { Simulation } from '../../core/simulation'
import { STARTUP_SCENE } from '../../core/content'
import {
  createSceneLoadDiagnostics,
  loadStartupScene,
  productionSceneLoadDependencies,
} from '../scene'
import type { SceneLoadDependencies, SceneLoadReporter } from '../scene'
import { createScenePresenter } from '../presentation'
import type { PresentationRenderer, ScenePresenter } from '../presentation'
import { createBrowserRuntime } from '../runtime'
import type { BrowserRuntime, FrameScheduler } from '../runtime'
import { CAMERA_ZOOM_SPEED, createInputAdapter } from './index'

/**
 * The browser Input Adapter integration test (ARCH-007, ARCH-002, ARCH-006,
 * ARCH-008, ARCH-009, REQ-018, REQ-019, REQ-119, REQ-138, PVS-FLW-002,
 * PVS-FLW-003, PVS-ARC-009).
 *
 * This test exercises the real production collaborators:
 *   - the real Simulation from `createSimulation()`;
 *   - the real Browser Runtime from `createBrowserRuntime()`;
 *   - the real Overworld Three.js presenter loaded from the committed authored glTF;
 *   - the real Input Adapter from `createInputAdapter()`.
 */
const AUTHORED_GLTF_BYTES = readFileSync(
  join('public', 'scenes', 'poc-overworld', 'poc-overworld-environment.gltf'),
)

function committedAssetResponse(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(AUTHORED_GLTF_BYTES))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { 'content-length': String(AUTHORED_GLTF_BYTES.length) },
  })
}

const realSceneLoadDependencies: SceneLoadDependencies = {
  ...productionSceneLoadDependencies,
  fetchInput: () => Promise.resolve(committedAssetResponse()),
}

function createRenderer(canvas?: HTMLCanvasElement): PresentationRenderer {
  const domElement = canvas ?? document.createElement('canvas')
  Object.defineProperty(domElement, 'clientWidth', { value: 1920, configurable: true })
  Object.defineProperty(domElement, 'clientHeight', { value: 1080, configurable: true })
  return {
    get backend() {
      return { isWebGPUBackend: true }
    },
    init: () => Promise.resolve(),
    dispose: () => {},
    render: () => {},
    compileAsync: () => Promise.resolve(),
    setSize: () => {},
    get domElement() {
      return domElement
    },
  }
}

interface TestRig {
  readonly simulation: Simulation
  readonly runtime: BrowserRuntime
  readonly presenter: ScenePresenter
  readonly canvas: HTMLCanvasElement
}

async function createTestRig(): Promise<TestRig> {
  const simulation = createSimulation()
  const canvas = document.createElement('canvas')
  Object.defineProperty(canvas, 'clientWidth', { value: 1920, configurable: true })
  Object.defineProperty(canvas, 'clientHeight', { value: 1080, configurable: true })

  const renderer = createRenderer(canvas)
  const diagnostics = createSceneLoadDiagnostics({ info() {}, error() {} })
  const reporter: SceneLoadReporter = { report() {} }

  const result = await loadStartupScene(
    renderer,
    STARTUP_SCENE,
    realSceneLoadDependencies,
    reporter,
    diagnostics,
  )

  const presenter = createScenePresenter(result.presentation, renderer)

  const scheduler: FrameScheduler = {
    requestFrame() {
      return 1
    },
    cancelFrame() {},
  }

  const runtime = createBrowserRuntime(simulation, scheduler)
  runtime.presenterSlot.presenter = presenter

  return { simulation, runtime, presenter, canvas }
}

describe('Browser Input Adapter integration (ARCH-007, ARCH-002, ARCH-006, ARCH-009, REQ-018, REQ-019)', () => {
  it('submits exactly one target-tick destination command on primary click on traversable ground while Ready', async () => {
    const { simulation, runtime, presenter, canvas } = await createTestRig()

    const inputAdapter = createInputAdapter({
      simulation,
      runtime,
      presenter,
      target: canvas,
      keyboardTarget: window,
    })

    // Initial state: tick 0, pawn at (0, 0, 1.5), destination null, movement idle
    expect(simulation.readProjection().tick).toBe(0)
    expect(simulation.readProjection().destination).toBeNull()
    expect(simulation.readProjection().movementState).toBe('idle')

    // Start runtime (representing Ready state where acceptsGameplayInput is true)
    runtime.start()
    expect(runtime.acceptsGameplayInput()).toBe(true)

    inputAdapter.attach()
    expect(inputAdapter.isAttached()).toBe(true)

    // Center click at (960, 540) on 1920x1080 canvas resolves to traversable ground near start (0, 0, 1.5)
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 960, clientY: 540, button: 0, bubbles: true }),
    )
    canvas.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 960, clientY: 540, button: 0, bubbles: true }),
    )
    canvas.dispatchEvent(
      new MouseEvent('click', { clientX: 960, clientY: 540, button: 0, bubbles: true }),
    )

    // Before advancing tick, destination command is queued for targetTick 1
    expect(simulation.readProjection().tick).toBe(0)
    expect(simulation.readProjection().destination).toBeNull()

    // Advance to tick 1: command executes and sets destination
    simulation.advanceTick()
    const projTick1 = simulation.readProjection()
    expect(projTick1.tick).toBe(1)
    expect(projTick1.destination).not.toBeNull()
    expect(projTick1.destination?.x).toBeCloseTo(0, 1)
    expect(projTick1.destination?.z).toBeCloseTo(1.5, 1)
  })

  it('submits no command when primary click is off-map or on non-traversable ground', async () => {
    const { simulation, runtime, presenter, canvas } = await createTestRig()

    const inputAdapter = createInputAdapter({
      simulation,
      runtime,
      presenter,
      target: canvas,
    })

    runtime.start()
    inputAdapter.attach()

    // Click far off-map
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: -2000, clientY: 540, button: 0, bubbles: true }),
    )
    canvas.dispatchEvent(
      new PointerEvent('pointerup', { clientX: -2000, clientY: 540, button: 0, bubbles: true }),
    )

    simulation.advanceTick()
    expect(simulation.readProjection().destination).toBeNull()
    expect(simulation.drainFeedbackEvents()).toHaveLength(0)
  })

  it('changes only presentation state on secondary-button drag without creating any gameplay command', async () => {
    const { simulation, runtime, presenter, canvas } = await createTestRig()

    const inputAdapter = createInputAdapter({
      simulation,
      runtime,
      presenter,
      target: canvas,
    })

    runtime.start()
    inputAdapter.attach()

    const initialCamera = presenter.readCameraState?.()
    const initialProjection = simulation.readProjection()

    // Secondary drag: pointerdown with button 2, pointermove, pointerup
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 500, clientY: 500, button: 2, bubbles: true }),
    )
    canvas.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 600, clientY: 450, button: 2, bubbles: true }),
    )
    canvas.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 600, clientY: 450, button: 2, bubbles: true }),
    )

    const updatedCamera = presenter.readCameraState?.()
    expect(updatedCamera?.yaw).not.toBe(initialCamera?.yaw)

    // Simulation projection remains completely unchanged
    const afterDragProjection = simulation.readProjection()
    expect(afterDragProjection.tick).toBe(initialProjection.tick)
    expect(afterDragProjection.coin).toBe(initialProjection.coin)
    expect(afterDragProjection.provisions).toBe(initialProjection.provisions)
    expect(afterDragProjection.destination).toBe(initialProjection.destination)
    expect(afterDragProjection.movementState).toBe(initialProjection.movementState)
    expect(simulation.drainFeedbackEvents()).toHaveLength(0)
  })

  it('changes only presentation state on wheel zoom without creating any gameplay command', async () => {
    const { simulation, runtime, presenter, canvas } = await createTestRig()

    const inputAdapter = createInputAdapter({
      simulation,
      runtime,
      presenter,
      target: canvas,
    })

    runtime.start()
    inputAdapter.attach()

    const initialCamera = presenter.readCameraState?.()
    const initialProjection = simulation.readProjection()

    // Wheel zoom
    let prevented = false
    const wheelEvent = new WheelEvent('wheel', { deltaY: 50, bubbles: true })
    wheelEvent.preventDefault = () => {
      prevented = true
    }
    canvas.dispatchEvent(wheelEvent)

    expect(prevented).toBe(true)
    const updatedCamera = presenter.readCameraState?.()
    expect(updatedCamera?.distance).toBeCloseTo(
      (initialCamera?.distance ?? 0) + 50 * CAMERA_ZOOM_SPEED,
      4,
    )

    // Simulation projection remains completely unchanged
    const afterWheelProjection = simulation.readProjection()
    expect(afterWheelProjection.tick).toBe(initialProjection.tick)
    expect(afterWheelProjection.destination).toBeNull()
    expect(afterWheelProjection.movementState).toBe('idle')
    expect(simulation.drainFeedbackEvents()).toHaveLength(0)
  })

  it('pauses and resumes travel with Space key (REQ-019, PVS-FLW-003)', async () => {
    const { simulation, runtime, presenter, canvas } = await createTestRig()

    const inputAdapter = createInputAdapter({
      simulation,
      runtime,
      presenter,
      target: canvas,
      keyboardTarget: window,
    })

    runtime.start()
    inputAdapter.attach()

    // Set destination at settlement boundary (0, 0, 0) for targetTick 1
    simulation.submitCommand({
      kind: 'set-destination',
      targetTick: 1,
      destination: { x: 0, y: 0, z: 0 },
    })

    // Advance 5 ticks: Band pawn is moving
    for (let i = 0; i < 5; i++) {
      simulation.advanceTick()
    }
    expect(simulation.readProjection().movementState).toBe('travel')
    expect(simulation.readProjection().paused).toBe(false)

    // Press Space to pause
    let spacePrevented = false
    const spaceDownEvent = new KeyboardEvent('keydown', { code: 'Space', bubbles: true })
    spaceDownEvent.preventDefault = () => {
      spacePrevented = true
    }
    window.dispatchEvent(spaceDownEvent)
    expect(spacePrevented).toBe(true)

    // Advance 1 tick to execute toggle-pause command
    simulation.advanceTick()
    expect(simulation.readProjection().paused).toBe(true)
    expect(simulation.readProjection().movementState).toBe('idle')

    // While paused, advancing ticks does not change position or campaign time
    const pausedPosition = simulation.readProjection().bandPawnPosition
    const pausedTime = simulation.readProjection().elapsedCampaignTime
    const pausedProvisions = simulation.readProjection().provisions

    for (let i = 0; i < 10; i++) {
      simulation.advanceTick()
    }
    expect(simulation.readProjection().bandPawnPosition.z).toBe(pausedPosition.z)
    expect(simulation.readProjection().elapsedCampaignTime).toBe(pausedTime)
    expect(simulation.readProjection().provisions).toBe(pausedProvisions)

    // Press Space again to resume
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    simulation.advanceTick()
    expect(simulation.readProjection().paused).toBe(false)
    expect(simulation.readProjection().movementState).toBe('travel')

    // Travel continues towards (0, 0, 0)
    simulation.advanceTick()
    expect(simulation.readProjection().bandPawnPosition.z).toBeLessThan(pausedPosition.z)
  })

  it('defaults keyboardTarget to global window when target is a canvas and keyboardTarget is omitted', async () => {
    const { simulation, runtime, presenter, canvas } = await createTestRig()

    // Omit keyboardTarget: must default to global window even when target is a canvas element
    const inputAdapter = createInputAdapter({
      simulation,
      runtime,
      presenter,
      target: canvas,
    })

    runtime.start()
    inputAdapter.attach()

    expect(simulation.readProjection().paused).toBe(false)

    // Dispatch Space on global window
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    simulation.advanceTick()

    expect(simulation.readProjection().paused).toBe(true)
  })

  it('rejects input and resolves no ground point when acceptsGameplayInput is false', async () => {
    const { simulation, runtime, presenter, canvas } = await createTestRig()

    const resolveGroundSpy = vi.spyOn(presenter, 'resolveGroundPosition')

    const inputAdapter = createInputAdapter({
      simulation,
      runtime,
      presenter,
      target: canvas,
      keyboardTarget: window,
    })

    inputAdapter.attach()

    // 1. Before Ready (runtime not started -> acceptsGameplayInput is false)
    expect(runtime.acceptsGameplayInput()).toBe(false)

    canvas.dispatchEvent(
      new MouseEvent('click', { clientX: 960, clientY: 540, button: 0, bubbles: true }),
    )
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))

    expect(resolveGroundSpy).not.toHaveBeenCalled()
    expect(simulation.readProjection().destination).toBeNull()

    // 2. During ordinary stop
    runtime.start()
    expect(runtime.acceptsGameplayInput()).toBe(true)
    runtime.stop()
    expect(runtime.acceptsGameplayInput()).toBe(false)

    canvas.dispatchEvent(
      new MouseEvent('click', { clientX: 960, clientY: 540, button: 0, bubbles: true }),
    )
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))

    expect(resolveGroundSpy).not.toHaveBeenCalled()
    expect(simulation.readProjection().destination).toBeNull()

    // 3. After terminal stop
    runtime.start()
    runtime.terminalStop()
    expect(runtime.acceptsGameplayInput()).toBe(false)

    canvas.dispatchEvent(
      new MouseEvent('click', { clientX: 960, clientY: 540, button: 0, bubbles: true }),
    )
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))

    expect(resolveGroundSpy).not.toHaveBeenCalled()
    expect(simulation.readProjection().destination).toBeNull()
  })

  it('is idempotent on repeated attach and does not create duplicate command paths', async () => {
    const { simulation, runtime, presenter, canvas } = await createTestRig()

    const inputAdapter = createInputAdapter({
      simulation,
      runtime,
      presenter,
      target: canvas,
      keyboardTarget: window,
    })

    runtime.start()

    // Attach multiple times
    inputAdapter.attach()
    inputAdapter.attach()
    inputAdapter.attach()
    expect(inputAdapter.isAttached()).toBe(true)

    // Single click should submit exactly ONE command
    canvas.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 960, clientY: 540, button: 0, bubbles: true }),
    )

    simulation.advanceTick()
    // Exactly one command executed
    expect(simulation.readProjection().destination).not.toBeNull()

    // Detach and verify no further commands are submitted
    inputAdapter.detach()
    expect(inputAdapter.isAttached()).toBe(false)

    canvas.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 960, clientY: 540, button: 0, bubbles: true }),
    )
    // Advance tick: destination remains what it was, no new command
    simulation.advanceTick()
    expect(simulation.drainFeedbackEvents()).toHaveLength(0)
  })

  it('handles contextmenu event prevention and keyboard repeat suppression', async () => {
    const { simulation, runtime, presenter, canvas } = await createTestRig()

    const inputAdapter = createInputAdapter({
      simulation,
      runtime,
      presenter,
      target: canvas,
      keyboardTarget: window,
    })

    runtime.start()
    inputAdapter.attach()

    let contextPrevented = false
    const contextEvent = new MouseEvent('contextmenu', { bubbles: true })
    contextEvent.preventDefault = () => {
      contextPrevented = true
    }
    canvas.dispatchEvent(contextEvent)
    expect(contextPrevented).toBe(true)

    // Keyboard repeat event is ignored
    const repeatEvent = new KeyboardEvent('keydown', { code: 'Space', repeat: true, bubbles: true })
    window.dispatchEvent(repeatEvent)
    simulation.advanceTick()
    expect(simulation.readProjection().paused).toBe(false)
  })

  it('captures pointer on secondary drag and cleans up on pointerup, pointercancel, and blur', async () => {
    const { simulation, runtime, presenter, canvas } = await createTestRig()

    let capturedPointerId: number | null = null
    let releasedPointerId: number | null = null
    canvas.setPointerCapture = (id: number) => {
      capturedPointerId = id
    }
    canvas.releasePointerCapture = (id: number) => {
      releasedPointerId = id
    }

    const inputAdapter = createInputAdapter({
      simulation,
      runtime,
      presenter,
      target: canvas,
    })

    runtime.start()
    inputAdapter.attach()

    // 1. Pointerdown with secondary button captures pointer
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 500, clientY: 500, button: 2, pointerId: 42, bubbles: true }),
    )
    expect(capturedPointerId).toBe(42)

    // 2. Pointerup releases pointer capture
    canvas.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 550, clientY: 500, button: 2, pointerId: 42, bubbles: true }),
    )
    expect(releasedPointerId).toBe(42)

    // 3. Pointercancel resets drag state and releases capture
    capturedPointerId = null
    releasedPointerId = null
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 500, clientY: 500, button: 2, pointerId: 43, bubbles: true }),
    )
    expect(capturedPointerId).toBe(43)

    canvas.dispatchEvent(
      new PointerEvent('pointercancel', { pointerId: 43, bubbles: true }),
    )
    expect(releasedPointerId).toBe(43)

    // Subsequent pointermove without drag does not rotate camera
    const yawAfterCancel = presenter.readCameraState?.()?.yaw
    canvas.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 600, clientY: 500, bubbles: true }),
    )
    expect(presenter.readCameraState?.()?.yaw).toBe(yawAfterCancel)

    // 4. Blur resets drag state
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 500, clientY: 500, button: 2, pointerId: 44, bubbles: true }),
    )
    window.dispatchEvent(new Event('blur'))

    const yawAfterBlur = presenter.readCameraState?.()?.yaw
    canvas.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 700, clientY: 500, bubbles: true }),
    )
    expect(presenter.readCameraState?.()?.yaw).toBe(yawAfterBlur)

    // 5. Pointermove with buttons = 1 (only primary held, secondary released) ends drag
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 500, clientY: 500, button: 2, pointerId: 45, bubbles: true }),
    )
    canvas.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 520, clientY: 500, buttons: 1, bubbles: true }),
    )
    const yawAfterButtonCheck = presenter.readCameraState?.()?.yaw
    canvas.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 700, clientY: 500, buttons: 1, bubbles: true }),
    )
    expect(presenter.readCameraState?.()?.yaw).toBe(yawAfterButtonCheck)
  })

  it('tracks submittedCommandsCount across mouse clicks and keyboard commands', async () => {
    const { simulation, runtime, presenter, canvas } = await createTestRig()
    const inputAdapter = createInputAdapter({
      simulation,
      runtime,
      presenter,
      target: canvas,
      keyboardTarget: window,
    })

    expect(inputAdapter.getSubmittedCommandsCount()).toBe(0)
    runtime.start()
    inputAdapter.attach()

    // Primary click on traversable ground increments count
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 960, clientY: 540, button: 0, bubbles: true }),
    )
    canvas.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 960, clientY: 540, button: 0, bubbles: true }),
    )
    canvas.dispatchEvent(
      new MouseEvent('click', { clientX: 960, clientY: 540, button: 0, bubbles: true }),
    )
    expect(inputAdapter.getSubmittedCommandsCount()).toBe(1)

    // Space key increments count
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    expect(inputAdapter.getSubmittedCommandsCount()).toBe(2)
  })

  it('detaches on ordinary stop, reattaches on ordinary restart, and stays detached on terminal stop', async () => {
    const { simulation, runtime, presenter, canvas } = await createTestRig()
    const inputAdapter = createInputAdapter({
      simulation,
      runtime,
      presenter,
      target: canvas,
      keyboardTarget: window,
    })

    runtime.start()
    inputAdapter.attach()
    expect(inputAdapter.isAttached()).toBe(true)

    // Ordinary stop automatically detaches the adapter
    runtime.stop()
    expect(inputAdapter.isAttached()).toBe(false)

    // Ordinary restart automatically reattaches the adapter
    runtime.start()
    expect(inputAdapter.isAttached()).toBe(true)

    // Explicit detach is respected across later stop and start cycles
    inputAdapter.detach()
    expect(inputAdapter.isAttached()).toBe(false)
    runtime.stop()
    runtime.start()
    expect(inputAdapter.isAttached()).toBe(false)

    // Re-attach explicitly
    inputAdapter.attach()
    expect(inputAdapter.isAttached()).toBe(true)
    // Terminal stop permanently detaches the adapter
    runtime.terminalStop()
    expect(inputAdapter.isAttached()).toBe(false)

    // Later start attempt does not reattach
    runtime.start()
    expect(inputAdapter.isAttached()).toBe(false)
  })
})
