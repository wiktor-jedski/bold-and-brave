/**
 * The Three.js Presentation Adapter frame presenter (ARCH-009, ARCH-012,
 * REQ-118, PVS-ARC-008).
 *
 * The Browser Runtime calls the presenter exactly once per rendered frame,
 * after each fixed-tick batch, passing only the current immutable
 * projection and the interpolation timing — the fractional fixed-tick
 * remainder between the settled projection tick and the next tick
 * (ARCH-008). The presenter consumes the projection strictly for
 * presentation:
 *
 *   - it uses the projected Band member IDs to update presentation-only
 *     node visibility: the node of every projected Band member is shown,
 *     and a bound node whose member is no longer projected is hidden;
 *   - it advances the authored animation from the current projection tick
 *     and interpolation value: the mixer time is
 *     `(tick + interpolation) / 60` Simulation seconds;
 *   - it renders one frame through the initialized WebGPU renderer on the
 *     one Browser Runtime frame loop.
 *
 * Adapter-owned state is limited to Three.js objects (the Scene, camera,
 * mixer, and the bound Band nodes), load state, and interpolation history
 * (the last animation time and the presented-frame count). The presenter
 * stores no projection, resource value, combat result, relationship
 * result, fate result, or outcome, and it never receives or reaches the
 * Simulation seam, so missing or delayed presentation output has no write
 * path to authoritative state (REQ-118, PVS-ARC-008, ARCH-012).
 *
 * Every collaborator is consumed through a minimal structural surface so
 * the focused tests prove the visibility, animation, and render behavior
 * without a GPU; the real Three.js objects and the initialized renderer
 * satisfy the same surfaces structurally.
 */
import type { SimulationProjection } from '../../core'
import type { FramePresentationRecord, ScenePresenter } from './interface'

/** One Simulation second per 60 fixed ticks (ARCH-005, REQ-113). */
const TICKS_PER_SIMULATION_SECOND = 60

/** The structural Band node the presenter updates (ARCH-009). */
export interface PresentedNode {
  /** The authored glTF node name, which equals the projected Band member ID. */
  readonly name: string
  /** Presentation-only visibility of the node. */
  visible: boolean
}

/** The structural Scene surface the presenter searches for Band nodes. */
export interface PresentedScene {
  /** Find a descendant node by its name, or `undefined`. */
  getObjectByName(name: string): PresentedNode | undefined
}

/** The structural camera surface the presenter renders from. */
export interface PresentedCamera {
  /** The view position of the camera. */
  readonly position: { readonly x: number; readonly y: number; readonly z: number }
}

/** The structural AnimationMixer surface the presenter advances. */
export interface PresentedAnimationMixer {
  /** Set the absolute mixer time in seconds (ARCH-009). */
  setTime(time: number): void
}

/** The structural renderer surface the presenter renders each frame with. */
export interface PresentedRenderer {
  /** Render one frame of `scene` from `camera`. */
  render(scene: unknown, camera: unknown): void
}

/**
 * The presentation handle handed from the Scene load to the presenter
 * (ARCH-022, ARCH-009).
 *
 * The startup Scene loader attaches the decoded glTF to one Three.js
 * Scene, creates one third-person camera and one AnimationMixer with the
 * first authored clip, and returns this handle; the Scene-loading handoff
 * binds the presenter with it after the real load passes.
 */
export interface ScenePresenterHandle {
  /** The one Three.js Scene the decoded asset was attached to. */
  readonly scene: PresentedScene
  /** The one third-person camera of the Scene. */
  readonly camera: PresentedCamera
  /** The one AnimationMixer playing the authored clip. */
  readonly mixer: PresentedAnimationMixer
}

/**
 * Create the Three.js frame presenter for the loaded startup Scene
 * (ARCH-009, REQ-118).
 *
 * The presenter owns only Three.js objects — the Scene, camera, mixer,
 * and the Band nodes it binds by projected member ID — plus
 * presentation-only frame metrics and interpolation history. It stores no
 * projection or gameplay result and receives no Simulation seam, so it can
 * never write authoritative state (PVS-ARC-008).
 */
export function createScenePresenter(
  presentation: ScenePresenterHandle,
  renderer: PresentedRenderer,
): ScenePresenter {
  // Adapter-owned state (ARCH-009, REQ-118): the bound Band nodes are
  // Three.js objects; the presented-frame count is frame metrics; the
  // animation time and the last-presented node IDs are interpolation
  // history. No projection, resource value, combat result, relationship
  // result, fate result, or outcome is stored.
  const bandNodes = new Map<string, PresentedNode>()
  let presentedFrames = 0
  let animationTime = 0
  /** The Band-member node IDs shown by the last presented projection. */
  let presentedNodeIds: string[] = []

  return {
    present(projection: SimulationProjection, interpolation: number): void {
      // Use projected Band IDs to update presentation-only node visibility:
      // show the node of every projected Band member, hiding a bound node
      // whose member is no longer projected (ARCH-009).
      const projectedIds = new Set<string>()
      for (const member of projection.band) {
        projectedIds.add(member.id)
        let node = bandNodes.get(member.id)
        if (node === undefined) {
          const found = presentation.scene.getObjectByName(member.id)
          if (found !== undefined) {
            node = found
            bandNodes.set(member.id, node)
          }
        }
        if (node !== undefined) {
          node.visible = true
        }
      }
      for (const [id, node] of bandNodes) {
        if (!projectedIds.has(id)) {
          node.visible = false
        }
      }

      // Record the Band-member node IDs presented by this frame: exactly
      // the projected members whose nodes exist in the loaded Scene. A
      // bound node hidden because its member is no longer projected is
      // not reported, so the record always matches the last presented
      // projection (ARCH-009).
      presentedNodeIds = []
      for (const member of projection.band) {
        if (bandNodes.has(member.id)) {
          presentedNodeIds.push(member.id)
        }
      }

      // Advance the authored animation from the current projection tick
      // and interpolation value: one Simulation second per 60 fixed ticks
      // (ARCH-005, ARCH-008, REQ-118).
      animationTime = (projection.tick + interpolation) / TICKS_PER_SIMULATION_SECOND
      presentation.mixer.setTime(animationTime)

      // Render the presented frame through WebGPU on the one Browser
      // Runtime frame loop (ARCH-009, ARCH-008).
      renderer.render(presentation.scene, presentation.camera)
      presentedFrames += 1
    },
    readFramePresentation(): FramePresentationRecord {
      // The record carries presentation-only facts: the presented node
      // IDs of the last presented projection, the frame count, and the
      // animation time (interpolation history). No gameplay value enters
      // it (REQ-118).
      return Object.freeze({
        presentedNodes: Object.freeze([...presentedNodeIds]),
        presentedFrames,
        animationTime,
      })
    },
  }
}
