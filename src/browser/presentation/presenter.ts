/**
 * The Three.js Presentation Adapter frame presenter (ARCH-008, ARCH-009,
 * ARCH-012, ARCH-016, REQ-018, REQ-089, REQ-118, REQ-170, PVS-FLW-002,
 * PVS-UI-001, PVS-ARC-008).
 *
 * The Browser Runtime calls the presenter exactly once per rendered frame,
 * after each fixed-tick batch, passing only the current immutable
 * projection and the interpolation timing — the fractional fixed-tick
 * remainder between the settled projection tick and the next tick
 * (ARCH-008). The presenter consumes the projection strictly for
 * presentation:
 *
 *   - it loads and updates the catalog's single Band-pawn node
 *     (`poc-band-pawn`), setting its visibility and interpolating its 3D
 *     position between authoritative ticks;
 *   - it switches idle and travel animation feedback from the projected
 *     `movementState` ('idle' vs 'moving') and advances mixer time;
 *   - it keeps all separate Band-member nodes absent so the single Band
 *     pawn represents the whole Band (REQ-170);
 *   - it adds the authored soft warm overcast frontier lighting to the
 *     Three.js Scene (REQ-089, PVS-UI-001);
 *   - it controls a top-down strategic camera that follows the Band pawn,
 *     exposing bounded rotation, zoom, and CSS-pixel ground selection
 *     (REQ-018, PVS-FLW-002);
 *   - it renders one frame through the initialized WebGPU renderer on the
 *     one Browser Runtime frame loop.
 *
 * Adapter-owned state is limited to Three.js objects (the Scene, camera,
 * mixer, and the bound Band nodes), camera parameters (yaw, pitch, distance),
 * frame metrics, and interpolation history (positions, animation time, and
 * frame count). The presenter stores no projection, resource value, combat
 * result, relationship result, fate result, or outcome, and it never receives
 * or reaches the Simulation seam, so missing or delayed presentation output
 * has no write path to authoritative state (REQ-118, PVS-ARC-008, ARCH-012).
 */
import {
  Camera,
  DirectionalLight,
  HemisphereLight,
  Object3D,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import type { SimulationProjection } from '../../core'
import { OVERWORLD } from '../../core/content'
import type { WorldPosition } from '../../core/content'
import { isPositionInTraversableGround } from '../../core/navigation'
import type {
  FramePresentationRecord,
  PresentedCameraState,
  ScenePresenter,
} from './interface'

/** One Simulation second per 60 fixed ticks (ARCH-005, REQ-113). */
const TICKS_PER_SIMULATION_SECOND = 60

/** The structural Band node the presenter updates (ARCH-009). */
export interface PresentedNode {
  /** The authored glTF node name, which equals the projected Band member ID. */
  readonly name: string
  /** Presentation-only visibility of the node. */
  visible: boolean
  /** Presentation position of the node in production world units. */
  readonly position?: {
    x: number
    y: number
    z: number
    set?(x: number, y: number, z: number): void
  }
  /** Presentation rotation of the node. */
  readonly rotation?: {
    x: number
    y: number
    z: number
    set?(x: number, y: number, z: number): void
  }
}

/** The structural Scene surface the presenter searches for Band nodes. */
export interface PresentedScene {
  /** Find a descendant node by its name, or `undefined`. */
  getObjectByName(name: string): PresentedNode | undefined
  /** Add a child object to the Scene. */
  add?(object: unknown): void
  /** Read child objects in the Scene. */
  readonly children?: readonly unknown[]
}

/** The structural camera surface the presenter renders from. */
export interface PresentedCamera {
  /** The view position of the camera in production world units. */
  readonly position: {
    x: number
    y: number
    z: number
    set?(x: number, y: number, z: number): void
  }
  /** Direct the camera to look at a target position. */
  lookAt?(x: number, y: number, z: number): void
  /** Update camera projection matrix. */
  updateProjectionMatrix?(): void
  /** Update camera world matrix. */
  updateMatrixWorld?(force?: boolean): void
}

/** The structural animation action the mixer plays. */
export interface PresentedAnimationAction {
  play(): unknown
  stop(): unknown
}

/** The structural animation clip. */
export interface PresentedAnimationClip {
  readonly name: string
}

/** The structural AnimationMixer surface the presenter advances. */
export interface PresentedAnimationMixer {
  /** Set the absolute mixer time in seconds (ARCH-009). */
  setTime(time: number): void
  /** Advance the mixer time by delta seconds. */
  update?(delta: number): void
  /** Get or create an action for the given clip or clip name. */
  clipAction?(clip: PresentedAnimationClip | string): PresentedAnimationAction
}

/** The structural renderer surface the presenter renders each frame with. */
export interface PresentedRenderer {
  /** Render one frame of `scene` from `camera`. */
  render(scene: unknown, camera: unknown): void
  /** The renderer's canvas element when available. */
  readonly domElement?: HTMLCanvasElement
}

/**
 * The presentation handle handed from the Scene load to the presenter
 * (ARCH-022, ARCH-009).
 */
export interface ScenePresenterHandle {
  /** The one Three.js Scene the decoded asset was attached to. */
  readonly scene: PresentedScene
  /** The one camera of the Scene. */
  readonly camera: PresentedCamera
  /** The one AnimationMixer playing authored clips. */
  readonly mixer: PresentedAnimationMixer
  /** Authored animation clips of the loaded Scene. */
  readonly animations?: readonly PresentedAnimationClip[]
}

/**
 * Create the Three.js frame presenter for the loaded Overworld Scene
 * (ARCH-009, ARCH-012, REQ-018, REQ-089, REQ-118, REQ-170).
 *
 * The presenter owns only Three.js objects — the Scene, camera, mixer,
 * and the single Band-pawn node — plus presentation-only frame metrics,
 * camera controls, and interpolation history. It stores no projection or
 * gameplay result and receives no Simulation seam, so it can never write
 * authoritative state (PVS-ARC-008).
 */
export function createScenePresenter(
  presentation: ScenePresenterHandle,
  renderer: PresentedRenderer,
): ScenePresenter {
  // Authored frontier lighting (ARCH-009, REQ-089, PVS-UI-001):
  // Add soft warm overcast frontier lighting to the Three.js Scene if supported.
  if (typeof presentation.scene.add === 'function') {
    const existingLight = presentation.scene.getObjectByName?.('poc-frontier-directional-light')
    if (existingLight === undefined) {
      const ambient = new HemisphereLight(0xddeeff, 0x886644, 0.8)
      ambient.name = 'poc-frontier-ambient-light'
      const directional = new DirectionalLight(0xfffaed, 1.2)
      directional.name = 'poc-frontier-directional-light'
      directional.position.set(5, 12, 8)
      presentation.scene.add(ambient)
      presentation.scene.add(directional)
    }
  }

  // Animation setup (ARCH-009, REQ-170, PVS-FLW-002):
  // Resolve authored idle and travel animation actions.
  let idleAction: PresentedAnimationAction | null = null
  let travelAction: PresentedAnimationAction | null = null
  let currentActionKind: 'idle' | 'travel' = 'idle'

  if (typeof presentation.mixer.clipAction === 'function') {
    if (presentation.animations && presentation.animations.length > 0) {
      const idleClip = presentation.animations.find(
        (c) => c.name === OVERWORLD.presentationNodes.idleAnimationClip,
      )
      const travelClip = presentation.animations.find(
        (c) => c.name === OVERWORLD.presentationNodes.travelAnimationClip,
      )
      if (idleClip !== undefined) {
        idleAction = presentation.mixer.clipAction(idleClip)
      }
      if (travelClip !== undefined) {
        travelAction = presentation.mixer.clipAction(travelClip)
      }
    }
    if (idleAction === null) {
      try {
        idleAction = presentation.mixer.clipAction(OVERWORLD.presentationNodes.idleAnimationClip)
      } catch {
        // Ignored
      }
    }
    if (travelAction === null) {
      try {
        travelAction = presentation.mixer.clipAction(OVERWORLD.presentationNodes.travelAnimationClip)
      } catch {
        // Ignored
      }
    }
  }

  // Start with idle animation active
  idleAction?.play()

  // Camera parameters and bounds (ARCH-009, ARCH-016, REQ-018, PVS-FLW-002)
  const cameraBounds = OVERWORLD.cameraBounds
  let distance = cameraBounds.defaultDistance
  let pitch = cameraBounds.defaultPitch
  let yaw = 0

  // Authoritative and interpolated Band pawn positions (presentation-only tracking)
  let currentPawnPosition: WorldPosition = { ...OVERWORLD.startPosition }
  let previousPawnPosition: WorldPosition = { ...OVERWORLD.startPosition }
  let lastProjectionTick = -1
  let currentInterpolatedPosition: WorldPosition = { ...OVERWORLD.startPosition }

  /** Update camera position from target and spherical coordinates (pitch, yaw, distance). */
  function updateCameraPosition(): void {
    const target = currentInterpolatedPosition
    const cosPitch = Math.cos(pitch)
    const sinPitch = Math.sin(pitch)
    const sinYaw = Math.sin(yaw)
    const cosYaw = Math.cos(yaw)

    const camX = target.x + distance * cosPitch * sinYaw
    const camY = target.y + distance * sinPitch
    const camZ = target.z + distance * cosPitch * cosYaw

    if (typeof presentation.camera.position.set === 'function') {
      presentation.camera.position.set(camX, camY, camZ)
    } else {
      presentation.camera.position.x = camX
      presentation.camera.position.y = camY
      presentation.camera.position.z = camZ
    }

    if (typeof presentation.camera.lookAt === 'function') {
      presentation.camera.lookAt(target.x, target.y, target.z)
    }
    if (typeof presentation.camera.updateMatrixWorld === 'function') {
      presentation.camera.updateMatrixWorld()
    }
  }

  // Initial camera placement
  updateCameraPosition()

  // Node cache and frame presentation records
  const bandNodes = new Map<string, PresentedNode>()
  let presentedFrames = 0
  let animationTime = 0
  let presentedNodeIds: string[] = []

  return {
    present(projection: SimulationProjection, interpolation: number): void {
      // 1. Track authoritative projection position and compute visual interpolation (ARCH-009)
      if (projection.tick !== lastProjectionTick) {
        if (lastProjectionTick !== -1) {
          previousPawnPosition = currentPawnPosition
        } else {
          previousPawnPosition = projection.bandPawnPosition
        }
        currentPawnPosition = projection.bandPawnPosition
        lastProjectionTick = projection.tick
      }

      let interpX: number
      let interpY: number
      let interpZ: number

      if (
        projection.movementState === 'idle' ||
        (currentPawnPosition.x === previousPawnPosition.x &&
          currentPawnPosition.y === previousPawnPosition.y &&
          currentPawnPosition.z === previousPawnPosition.z)
      ) {
        interpX = currentPawnPosition.x
        interpY = currentPawnPosition.y
        interpZ = currentPawnPosition.z
      } else {
        const alpha = Math.max(0, Math.min(1, interpolation))
        interpX = previousPawnPosition.x + (currentPawnPosition.x - previousPawnPosition.x) * alpha
        interpY = previousPawnPosition.y + (currentPawnPosition.y - previousPawnPosition.y) * alpha
        interpZ = previousPawnPosition.z + (currentPawnPosition.z - previousPawnPosition.z) * alpha
      }

      currentInterpolatedPosition = Object.freeze({
        x: Math.round(interpX * 1e12) / 1e12,
        y: Math.round(interpY * 1e12) / 1e12,
        z: Math.round(interpZ * 1e12) / 1e12,
      })


      // 2. Switch idle / travel animation feedback based on projected movementState
      const desiredAction = projection.movementState === 'travel' ? 'travel' : 'idle'
      if (desiredAction !== currentActionKind) {
        currentActionKind = desiredAction
        if (desiredAction === 'travel') {
          idleAction?.stop()
          travelAction?.play()
        } else {
          travelAction?.stop()
          idleAction?.play()
        }
      }

      // 3. Advance authored animation: (tick + interpolation) / 60 Simulation seconds
      animationTime = (projection.tick + interpolation) / TICKS_PER_SIMULATION_SECOND
      presentation.mixer.setTime(animationTime)

      // 4. Bind and update the single Band pawn node from authoritative position (REQ-170, PVS-FLW-002)
      const pawnId = OVERWORLD.presentationNodes.bandPawnNodeId
      let pawnNode = bandNodes.get(pawnId)
      if (pawnNode === undefined) {
        const found = presentation.scene.getObjectByName(pawnId)
        if (found !== undefined) {
          pawnNode = found
          bandNodes.set(pawnId, pawnNode)
        }
      }

      const isBandPresent = projection.band.length > 0
      if (pawnNode !== undefined) {
        pawnNode.visible = isBandPresent

        // Set pawn 3D position in production world units from interpolated authoritative position
        if (pawnNode.position !== undefined) {
          if (typeof pawnNode.position.set === 'function') {
            pawnNode.position.set(
              currentInterpolatedPosition.x,
              currentInterpolatedPosition.y,
              currentInterpolatedPosition.z,
            )
          } else {
            pawnNode.position.x = currentInterpolatedPosition.x
            pawnNode.position.y = currentInterpolatedPosition.y
            pawnNode.position.z = currentInterpolatedPosition.z
          }
        }

        // Orient pawn to face travel direction when moving
        const dx = currentPawnPosition.x - previousPawnPosition.x
        const dz = currentPawnPosition.z - previousPawnPosition.z
        if (
          projection.movementState === 'travel' &&
          Math.hypot(dx, dz) > 1e-7 &&
          pawnNode.rotation !== undefined
        ) {
          const yawAngle = Math.atan2(dx, dz)
          if (typeof pawnNode.rotation.set === 'function') {
            pawnNode.rotation.set(0, yawAngle, 0)
          } else {
            pawnNode.rotation.y = yawAngle
          }
        }
      }

      // Hide any separate member nodes: only the single Band pawn represents the Band (REQ-170)
      for (const [id, node] of bandNodes) {
        if (id !== pawnId) {
          node.visible = false
        }
      }

      // 5. Update camera position to follow the Band pawn
      updateCameraPosition()

      // 6. Record presented nodes: exactly ['poc-band-pawn'] if pawn is present and visible
      presentedNodeIds = isBandPresent && pawnNode !== undefined ? [pawnId] : []

      // 7. Render presented frame through WebGPU on Browser Runtime frame loop
      renderer.render(presentation.scene, presentation.camera)
      presentedFrames += 1
    },

    readFramePresentation(): FramePresentationRecord {
      const hasDir =
        presentation.scene.getObjectByName('poc-frontier-directional-light') !== undefined
      const hasAmb =
        presentation.scene.getObjectByName('poc-frontier-ambient-light') !== undefined
      return Object.freeze({
        presentedNodes: Object.freeze([...presentedNodeIds]),
        presentedFrames,
        animationTime,
        hasLighting: hasDir && hasAmb,
        activeAnimation: currentActionKind,
      })
    },

    rotateCamera(deltaYaw: number, deltaPitch = 0): void {
      if (Number.isFinite(deltaYaw)) {
        yaw = (yaw + deltaYaw) % (Math.PI * 2)
      }
      if (Number.isFinite(deltaPitch)) {
        pitch = Math.max(cameraBounds.minPitch, Math.min(cameraBounds.maxPitch, pitch + deltaPitch))
      }
      updateCameraPosition()
    },

    zoomCamera(deltaDistance: number): void {
      if (Number.isFinite(deltaDistance)) {
        distance = Math.max(
          cameraBounds.minDistance,
          Math.min(cameraBounds.maxDistance, distance + deltaDistance),
        )
      }
      updateCameraPosition()
    },

    resolveGroundPosition(
      cssX: number,
      cssY: number,
      viewportWidth?: number,
      viewportHeight?: number,
    ): WorldPosition | null {
      if (!Number.isFinite(cssX) || !Number.isFinite(cssY)) {
        return null
      }

      const domElement = renderer?.domElement
      const width =
        viewportWidth ??
        (domElement?.clientWidth ||
          (typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1920) ||
          1920)
      const height =
        viewportHeight ??
        (domElement?.clientHeight ||
          (typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 1080) ||
          1080)

      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null
      }

      const ndcX = (cssX / width) * 2 - 1
      const ndcY = -(cssY / height) * 2 + 1

      const raycaster = new Raycaster()
      const cameraObj = presentation.camera as unknown as Camera
      try {
        raycaster.setFromCamera(new Vector2(ndcX, ndcY), cameraObj)
      } catch {
        return null
      }

      let hitPoint: Vector3 | null = null

      // Raycast ONLY against the authored terrain mesh (ARCH-009, REQ-018)
      const terrainNode = presentation.scene.getObjectByName(
        OVERWORLD.presentationNodes.terrainNodeId,
      )
      if (
        terrainNode !== undefined &&
        typeof (terrainNode as unknown as Object3D).traverse === 'function'
      ) {
        try {
          const intersects = raycaster.intersectObject(terrainNode as unknown as Object3D, true)
          if (intersects.length > 0) {
            hitPoint = intersects[0].point
          }
        } catch {
          return null
        }
      }

      // Only a real hit on the authored terrain is accepted (no plane fallback)
      if (hitPoint === null) {
        return null
      }

      const candidate: WorldPosition = {
        x: hitPoint.x,
        y: hitPoint.y,
        z: hitPoint.z,
      }

      if (!isPositionInTraversableGround(candidate, OVERWORLD.traversableGround)) {
        return null
      }

      return Object.freeze({
        x: Math.round(candidate.x * 1e6) / 1e6,
        y: Math.round(candidate.y * 1e6) / 1e6,
        z: Math.round(candidate.z * 1e6) / 1e6,
      })
    },

    readCameraState(): PresentedCameraState {
      return Object.freeze({
        yaw,
        pitch,
        distance,
        position: Object.freeze({
          x: presentation.camera.position.x,
          y: presentation.camera.position.y,
          z: presentation.camera.position.z,
        }),
        target: Object.freeze({
          x: currentInterpolatedPosition.x,
          y: currentInterpolatedPosition.y,
          z: currentInterpolatedPosition.z,
        }),
      })
    },
  }
}
