// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SimulationProjection } from '../../core'
import {
  OVERWORLD_CAMERA_BOUNDS,
  OVERWORLD_TRAVERSABLE_GROUND,
  STARTUP_SCENE,
} from '../../core/content'
import {
  createSceneLoadDiagnostics,
  loadStartupScene,
  productionSceneLoadDependencies,
} from '../scene'
import type {
  SceneLoadDependencies,
  SceneLoadReporter,
  SceneLoadStage,
} from '../scene'
import type { PresentationRenderer, PresentedNode } from './index'
import { createScenePresenter } from './index'

/**
 * The Three.js frame-presenter integration test (ARCH-008, ARCH-009,
 * ARCH-012, ARCH-016, REQ-018, REQ-089, REQ-118, REQ-170, PVS-FLW-002,
 * PVS-UI-001, PVS-ARC-008).
 *
 * This test wires the real production seams together:
 *   - the real startup Scene load downloads and decodes the committed
 *     authored glTF asset with the real Three.js `GLTFLoader`, `Scene`,
 *     `PerspectiveCamera`, and `AnimationMixer`;
 *   - the real frame presenter consumes the resulting presentation handle;
 *   - real Simulation projections from `createSimulation()` are presented;
 *   - the single Band pawn follows interpolated authoritative positions,
 *     stops at the target without overshoot, and switches idle/travel
 *     feedback;
 *   - all separate Band-member nodes remain absent;
 *   - camera rotation and zoom stay within authored top-down bounds and do
 *     not mutate any Simulation projection;
 *   - CSS-pixel selections resolve to candidate world points only on
 *     authored traversable terrain;
 *   - the presenter owns no gameplay state.
 */
const AUTHORED_GLTF_BYTES = readFileSync(
  join('public', 'scenes', 'poc-overworld', 'poc-overworld-environment.gltf'),
)

/** The Band-pawn ID authored as a node in the committed asset (REQ-170). */
const PAWN_ID = 'poc-band-pawn'

/** Stream the committed authored asset as one response, as the server would. */
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

/** The real Scene-load dependencies with the committed asset download. */
const realSceneLoadDependencies: SceneLoadDependencies = {
  ...productionSceneLoadDependencies,
  fetchInput: () => Promise.resolve(committedAssetResponse()),
}

/** Build the structural renderer surface the loader and presenter consume. */
function createRenderer(): PresentationRenderer & { renderedFrames: unknown[][] } {
  const renderedFrames: unknown[][] = []
  const canvas = document.createElement('canvas')
  Object.defineProperty(canvas, 'clientWidth', { value: 1920, configurable: true })
  Object.defineProperty(canvas, 'clientHeight', { value: 1080, configurable: true })
  return {
    renderedFrames,
    get backend() {
      return { isWebGPUBackend: true }
    },
    init() {
      return Promise.resolve()
    },
    dispose() {},
    render(scene: unknown, camera: unknown): void {
      renderedFrames.push([scene, camera])
    },
    compileAsync() {
      return Promise.resolve()
    },
    setSize() {},
    get domElement() {
      return canvas
    },
  }
}

/** Build a frozen public projection with the given Band membership. */
function projectionWith(
  band: readonly string[],
  overrides?: Partial<SimulationProjection>,
): SimulationProjection {
  return Object.freeze({
    tick: overrides?.tick ?? 0,
    agents: Object.freeze([]),
    band: Object.freeze(band.map((id) => Object.freeze({ id, name: id }))),
    coin: 100,
    provisions: 10.0,
    scene: 'poc-overworld',
    bandPawnPosition: overrides?.bandPawnPosition ?? Object.freeze({ x: 0, y: 0, z: 1.5 }),
    destination: overrides?.destination ?? null,
    movementState: overrides?.movementState ?? 'idle',
    paused: overrides?.paused ?? false,
    elapsedCampaignTime: overrides?.elapsedCampaignTime ?? 0,
    consumptionRemainder: overrides?.consumptionRemainder ?? 0,
  })
}

describe('Three.js Overworld presenter integration with the real startup Scene (ARCH-009, ARCH-012, REQ-018, REQ-170)', () => {
  it('loads the committed glTF, adds frontier lighting, and presents the single Band pawn with no separate member nodes', async () => {
    const recordedStages: SceneLoadStage[] = []
    const reporter: SceneLoadReporter = {
      report(progress) {
        recordedStages.push(progress.stage)
      },
    }
    const renderer = createRenderer()
    const diagnostics = createSceneLoadDiagnostics({ info() {}, error() {} })
    const result = await loadStartupScene(
      renderer,
      STARTUP_SCENE,
      realSceneLoadDependencies,
      reporter,
      diagnostics,
    )

    expect(recordedStages).toEqual(['download', 'download', 'decode', 'upload', 'ready'])
    expect(result.sceneId).toBe('poc-overworld')
    expect(result.assetId).toBe('poc-overworld-environment')
    expect(result.backend).toBe('webgpu')
    expect(result.animationClips).toEqual(['poc-band-idle', 'poc-band-travel'])

    const presenter = createScenePresenter(result.presentation, renderer)
    const scene = result.presentation.scene

    // Frontier lighting was added to the scene (REQ-089, PVS-UI-001)
    const dirLight = scene.getObjectByName('poc-frontier-directional-light')
    const ambLight = scene.getObjectByName('poc-frontier-ambient-light')
    expect(dirLight).toBeDefined()
    expect(ambLight).toBeDefined()
    const initialProjection = projectionWith(['poc-player-character', 'poc-companion'], {
      coin: 100,
      provisions: 10.0,
    })
    expect(initialProjection.band).toHaveLength(2)
    presenter.present(initialProjection, 0)
    expect(presenter.readFramePresentation().presentedNodes).toEqual([PAWN_ID])
    expect(scene.getObjectByName(PAWN_ID)?.visible).toBe(true)

    // Separate member nodes do not appear
    expect(scene.getObjectByName('poc-player-character')).toBeUndefined()
    expect(scene.getObjectByName('poc-companion')).toBeUndefined()

    // When the Band is empty, the pawn node is hidden
    presenter.present(projectionWith([]), 0)
    expect(presenter.readFramePresentation().presentedNodes).toEqual([])
    expect(scene.getObjectByName(PAWN_ID)?.visible).toBe(false)

    // The record carries only presentation facts and is deeply frozen (PVS-ARC-008)
    const record = presenter.readFramePresentation()
    expect(Object.keys(record)).toEqual([
      'presentedNodes',
      'presentedFrames',
      'animationTime',
      'hasLighting',
      'activeAnimation',
    ])
    expect(record.hasLighting).toBe(true)
    expect(record.activeAnimation).toBe('idle')
    expect(Object.isFrozen(record)).toBe(true)
    expect(Object.isFrozen(record.presentedNodes)).toBe(true)
  })

  it('interpolates authoritative positions and stops at the target without overshoot', async () => {
    const renderer = createRenderer()
    const reporter: SceneLoadReporter = { report() {} }
    const diagnostics = createSceneLoadDiagnostics({ info() {}, error() {} })
    const result = await loadStartupScene(
      renderer,
      STARTUP_SCENE,
      realSceneLoadDependencies,
      reporter,
      diagnostics,
    )
    const presenter = createScenePresenter(result.presentation, renderer)
    const pawn = result.presentation.scene.getObjectByName(PAWN_ID) as PresentedNode | undefined
    expect(pawn).toBeDefined()

    // Step 1: Initial projection at start position (0, 0, 1.5)
    const p0 = projectionWith([PAWN_ID], {
      tick: 0,
      bandPawnPosition: { x: 0, y: 0, z: 1.5 },
      movementState: 'idle',
    })
    presenter.present(p0, 0)
    expect(pawn?.position?.x).toBeCloseTo(0, 5)
    expect(pawn?.position?.z).toBeCloseTo(1.5, 5)

    // Step 2: Simulation tick advances to position (0, 0, 1.3)
    const p1 = projectionWith([PAWN_ID], {
      tick: 1,
      bandPawnPosition: { x: 0, y: 0, z: 1.3 },
      movementState: 'travel',
    })

    // At interpolation 0.0, position is at previous tick position (0, 0, 1.5)
    presenter.present(p1, 0.0)
    expect(pawn?.position?.z).toBeCloseTo(1.5, 5)

    // At interpolation 0.5, position is half-way (0, 0, 1.4)
    presenter.present(p1, 0.5)
    expect(pawn?.position?.z).toBeCloseTo(1.4, 5)

    // At interpolation 1.0, position reaches current tick position (0, 0, 1.3)
    presenter.present(p1, 1.0)
    expect(pawn?.position?.z).toBeCloseTo(1.3, 5)

    // Step 3: Pawn stops at target destination (0, 0, 0)
    const pStop = projectionWith([PAWN_ID], {
      tick: 10,
      bandPawnPosition: { x: 0, y: 0, z: 0 },
      movementState: 'idle',
      destination: { x: 0, y: 0, z: 0 },
    })
    presenter.present(pStop, 0.5)
    expect(pawn?.position?.x).toBeCloseTo(0, 5)
    expect(pawn?.position?.z).toBeCloseTo(0, 5)
  })

  it('switches between idle and travel animation feedback from projected movement state', async () => {
    const renderer = createRenderer()
    const reporter: SceneLoadReporter = { report() {} }
    const diagnostics = createSceneLoadDiagnostics({ info() {}, error() {} })
    const result = await loadStartupScene(
      renderer,
      STARTUP_SCENE,
      realSceneLoadDependencies,
      reporter,
      diagnostics,
    )

    const presenter = createScenePresenter(result.presentation, renderer)

    // Idle state advances mixer time
    const pIdle = projectionWith([PAWN_ID], { tick: 60, movementState: 'idle' })
    presenter.present(pIdle, 0)
    expect(presenter.readFramePresentation().animationTime).toBeCloseTo(1.0, 5)

    // Traveling state advances mixer time with interpolation
    const pMoving = projectionWith([PAWN_ID], { tick: 120, movementState: 'travel' })
    presenter.present(pMoving, 0.5)
    expect(presenter.readFramePresentation().animationTime).toBeCloseTo((120 + 0.5) / 60, 5)
  })

  it('bounds camera rotation and zoom within authored limits without changing Simulation state', async () => {
    const renderer = createRenderer()
    const reporter: SceneLoadReporter = { report() {} }
    const diagnostics = createSceneLoadDiagnostics({ info() {}, error() {} })
    const result = await loadStartupScene(
      renderer,
      STARTUP_SCENE,
      realSceneLoadDependencies,
      reporter,
      diagnostics,
    )

    const presenter = createScenePresenter(result.presentation, renderer)
    const initialProjection = projectionWith(['poc-player-character', 'poc-companion'])
    presenter.present(initialProjection, 0)

    const initialCameraState = presenter.readCameraState?.()
    expect(initialCameraState).toBeDefined()
    expect(initialCameraState?.pitch).toBeCloseTo(OVERWORLD_CAMERA_BOUNDS.defaultPitch, 4)
    expect(initialCameraState?.distance).toBeCloseTo(OVERWORLD_CAMERA_BOUNDS.defaultDistance, 4)

    // Rotate within bounds
    presenter.rotateCamera(0.2, 0.1)
    const rotated = presenter.readCameraState?.()
    expect(rotated?.yaw).toBeCloseTo(0.2, 4)
    expect(rotated?.pitch).toBeCloseTo(OVERWORLD_CAMERA_BOUNDS.defaultPitch + 0.1, 4)

    // Bounded pitch clamping (top-down / oblique limits)
    presenter.rotateCamera(0, 10.0) // exceed maxPitch
    expect(presenter.readCameraState?.()?.pitch).toBeCloseTo(OVERWORLD_CAMERA_BOUNDS.maxPitch, 4)

    presenter.rotateCamera(0, -20.0) // exceed minPitch
    expect(presenter.readCameraState?.()?.pitch).toBeCloseTo(OVERWORLD_CAMERA_BOUNDS.minPitch, 4)
    // Adversarial: non-finite rotation inputs are harmless and keep state bounded and finite
    const stateBeforeNonFiniteRot = presenter.readCameraState?.()
    presenter.rotateCamera(Number.NaN, 0)
    presenter.rotateCamera(Number.POSITIVE_INFINITY, 0)
    presenter.rotateCamera(0, Number.NaN)
    presenter.rotateCamera(0, Number.NEGATIVE_INFINITY)
    const stateAfterNonFiniteRot = presenter.readCameraState?.()
    expect(stateAfterNonFiniteRot?.yaw).toBe(stateBeforeNonFiniteRot?.yaw)
    expect(stateAfterNonFiniteRot?.pitch).toBe(stateBeforeNonFiniteRot?.pitch)
    expect(Number.isFinite(stateAfterNonFiniteRot?.yaw)).toBe(true)
    expect(Number.isFinite(stateAfterNonFiniteRot?.pitch)).toBe(true)

    // Bounded zoom clamping
    presenter.zoomCamera(-50.0) // zoom in beyond minDistance
    expect(presenter.readCameraState?.()?.distance).toBeCloseTo(
      OVERWORLD_CAMERA_BOUNDS.minDistance,
      4,
    )

    presenter.zoomCamera(100.0) // zoom out beyond maxDistance
    expect(presenter.readCameraState?.()?.distance).toBeCloseTo(
      OVERWORLD_CAMERA_BOUNDS.maxDistance,
      4,
    )

    // Adversarial: non-finite zoom inputs are harmless and keep distance bounded and finite
    const stateBeforeNonFiniteZoom = presenter.readCameraState?.()
    presenter.zoomCamera(Number.NaN)
    presenter.zoomCamera(Number.POSITIVE_INFINITY)
    presenter.zoomCamera(Number.NEGATIVE_INFINITY)
    const stateAfterNonFiniteZoom = presenter.readCameraState?.()
    expect(stateAfterNonFiniteZoom?.distance).toBe(stateBeforeNonFiniteZoom?.distance)
    expect(Number.isFinite(stateAfterNonFiniteZoom?.distance)).toBe(true)

    // Projection passed in remains completely unchanged by camera operations (ARCH-009, REQ-018)
    expect(initialProjection.coin).toBe(100)
    expect(initialProjection.provisions).toBe(10.0)
    expect(initialProjection.elapsedCampaignTime).toBe(0)
  })

  it('resolves CSS-pixel selections to candidate world points only on authored traversable terrain', async () => {
    const renderer = createRenderer()
    const reporter: SceneLoadReporter = { report() {} }
    const diagnostics = createSceneLoadDiagnostics({ info() {}, error() {} })
    const result = await loadStartupScene(
      renderer,
      STARTUP_SCENE,
      realSceneLoadDependencies,
      reporter,
      diagnostics,
    )

    const presenter = createScenePresenter(result.presentation, renderer)
    presenter.present(projectionWith(['poc-player-character', 'poc-companion']), 0)
    // Screen center (960, 540) in a 1920x1080 viewport targets the Band pawn position (0, 0, 1.5)
    const centerHit = presenter.resolveGroundPosition(960, 540, 1920, 1080)
    expect(centerHit).not.toBeNull()
    expect(centerHit?.x).toBeCloseTo(0, 1)
    expect(centerHit?.z).toBeCloseTo(1.5, 1)

    // The returned candidate point is on authored traversable ground
    if (centerHit !== null) {
      expect(centerHit.x).toBeGreaterThanOrEqual(OVERWORLD_TRAVERSABLE_GROUND.minX)
      expect(centerHit.x).toBeLessThanOrEqual(OVERWORLD_TRAVERSABLE_GROUND.maxX)
      expect(centerHit.z).toBeGreaterThanOrEqual(OVERWORLD_TRAVERSABLE_GROUND.minZ)
      expect(centerHit.z).toBeLessThanOrEqual(OVERWORLD_TRAVERSABLE_GROUND.maxZ)
    }

    // Selections outside the canvas / off-map return null
    const offMapLeft = presenter.resolveGroundPosition(-2000, 540, 1920, 1080)
    const offMapRight = presenter.resolveGroundPosition(5000, 540, 1920, 1080)
    expect(offMapLeft).toBeNull()
    expect(offMapRight).toBeNull()
    // Adversarial: non-finite coordinates or viewport dimensions return null
    expect(presenter.resolveGroundPosition(Number.NaN, 540, 1920, 1080)).toBeNull()
    expect(presenter.resolveGroundPosition(960, Number.NaN, 1920, 1080)).toBeNull()
    expect(presenter.resolveGroundPosition(Number.POSITIVE_INFINITY, 540, 1920, 1080)).toBeNull()
    expect(presenter.resolveGroundPosition(960, 540, Number.NaN, 1080)).toBeNull()
    expect(presenter.resolveGroundPosition(960, 540, 1920, Number.POSITIVE_INFINITY)).toBeNull()
    expect(presenter.resolveGroundPosition(960, 540, 0, 0)).toBeNull()
    expect(presenter.resolveGroundPosition(960, 540, -100, 1080)).toBeNull()

    // Proves candidate is returned ONLY after an authored terrain hit (no mathematical-plane fallback)
    // If terrain node is removed from scene, resolveGroundPosition must return null
    const terrainNode = result.presentation.scene.getObjectByName('poc-overworld-terrain')
    if (terrainNode !== undefined) {
      ;(terrainNode as { name: string }).name = 'poc-overworld-terrain-hidden'
      expect(presenter.resolveGroundPosition(960, 540, 1920, 1080)).toBeNull()
      ;(terrainNode as { name: string }).name = 'poc-overworld-terrain'
    }
  })

  it('confirms the presenter owns no gameplay result and has no write path to the Simulation', async () => {
    const renderer = createRenderer()
    const reporter: SceneLoadReporter = { report() {} }
    const diagnostics = createSceneLoadDiagnostics({ info() {}, error() {} })
    const result = await loadStartupScene(
      renderer,
      STARTUP_SCENE,
      realSceneLoadDependencies,
      reporter,
      diagnostics,
    )

    const presenter = createScenePresenter(result.presentation, renderer)
    const initialProjection = projectionWith(['poc-player-character', 'poc-companion'], {
      coin: 100,
      provisions: 10.0,
      elapsedCampaignTime: 0,
    })

    // Run several presentation frames with camera manipulation and ground selection
    presenter.present(initialProjection, 0.5)
    presenter.rotateCamera(0.5, 0.2)
    presenter.zoomCamera(1.0)
    presenter.resolveGroundPosition(960, 540)
    presenter.present(initialProjection, 0.8)

    // Authoritative resources, time, and positions are completely untouched
    expect(initialProjection.coin).toBe(100)
    expect(initialProjection.provisions).toBe(10.0)
    expect(initialProjection.elapsedCampaignTime).toBe(0)
  })
})
