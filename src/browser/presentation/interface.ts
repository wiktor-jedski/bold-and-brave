/**
 * Public contract of the Three.js WebGPU backend gate (ARCH-009, ARCH-023,
 * ARCH-024, REQ-011, REQ-134, REQ-135).
 *
 * The gate creates the Three.js `WebGPURenderer` with the exact device
 * selected by the capability gate, waits for initialization, and accepts
 * the renderer only when its initialized backend identifies itself as
 * WebGPU. A renderer initialization failure or a non-WebGPU backend
 * returns the governed readable WebGPU-backend `Unsupported` result,
 * disposes the rejected renderer, and exposes no WebGL fallback path
 * (PVS-WEB-001, PVS-SCP-006).
 */
import type { SimulationProjection } from '../../core'

/**
 * The minimal renderer surface the backend gate reads.
 *
 * The real Three.js `WebGPURenderer` satisfies this structure; tests inject
 * a recording fake, so the gate proves its device handoff, initialization
 * order, backend inspection, and disposal without a GPU. The gate never
 * renders a frame and never loads a Scene: those operations belong to
 * later delivery states (REQ-134, PVS-WEB-001). The Scene loader (ARCH-022)
 * uses the render, GPU-upload, canvas, and sizing operations after every
 * gate passes.
 */
export interface PresentationRenderer {
  /** Wait for renderer initialization to complete. */
  init(): Promise<unknown>
  /** Release the renderer and its GPU resources. */
  dispose(): void
  /**
   * Render one frame of `scene` from `camera` (ARCH-009).
   *
   * The Scene loader renders exactly one frame after the load succeeds;
   * later frames belong to the one Browser Runtime frame loop (ARCH-008).
   */
  render(scene: unknown, camera: unknown): void
  /**
   * Prepare GPU resources (shaders and textures) for `scene` from `camera`
   * (ARCH-009, PVS-WEB-003).
   *
   * This is the GPU-upload stage of the Scene load: the promise settles
   * when the renderer finished compiling the decoded Scene.
   */
  compileAsync(scene: unknown, camera: unknown): Promise<unknown>
  /**
   * Resize the renderer's drawing buffer to `width` by `height` CSS pixels
   * (ARCH-024).
   */
  setSize(width: number, height: number): void
  /** The renderer's canvas, added to the product surface after the load. */
  readonly domElement: HTMLCanvasElement
  /** The initialized backend the renderer selected. */
  readonly backend: PresentationRendererBackend
}

/**
 * The initialized backend identity of a Three.js renderer.
 *
 * The WebGPU backend reports `isWebGPUBackend: true`; the WebGL fallback
 * backend reports `isWebGLBackend: true`. The gate accepts the renderer
 * only for the former and rejects the latter before gameplay (REQ-011,
 * PVS-WEB-001).
 */
export interface PresentationRendererBackend {
  /** True when the backend identifies itself as the Three.js WebGPU backend. */
  readonly isWebGPUBackend?: boolean
  /** True when the backend identifies itself as the Three.js WebGL fallback backend. */
  readonly isWebGLBackend?: boolean
}

/**
 * The injected renderer factory of the backend gate.
 *
 * Production creates `new WebGPURenderer({ device })` with the exact
 * device selected by the capability gate, so no second adapter or device
 * request can replace the selected device (REQ-135, PVS-WEB-002). Tests
 * inject a recording factory that captures the device handoff.
 */
export interface WebGPURendererFactory {
  /** Create one Three.js renderer bound to `device`. */
  create(device: GPUDevice): PresentationRenderer
}

/** The failure code of the Three.js WebGPU backend check (REQ-134). */
export type PresentationUnsupportedCode = 'webgpu-backend'

/**
 * One typed, readable `Unsupported` result at the failed backend check
 * (REQ-134).
 *
 * A failed gate returns exactly this result and performs no render or
 * Scene-loading operation, so the surface shows one specific WebGPU-backend
 * failure and no asset is requested (PVS-WEB-001).
 */
export interface PresentationUnsupported {
  /** Discriminates the failure result from the success result. */
  readonly ok: false
  /** The governed failure code of the backend check (PVS-WEB-001). */
  readonly code: PresentationUnsupportedCode
  /** A readable message for the semantic DOM alert (REQ-134). */
  readonly message: string
}

/**
 * The successful WebGPU-backend result (REQ-011, PVS-WEB-001).
 *
 * The initialized renderer is accepted only when its backend identified
 * itself as WebGPU; the Scene-loading handoff of the next delivery state
 * receives this renderer (REQ-134).
 */
export interface PresentationSuccess {
  /** Discriminates the success result from the failure result. */
  readonly ok: true
  /** The initialized Three.js renderer with a WebGPU backend. */
  readonly renderer: PresentationRenderer
}

/** The result of the Three.js WebGPU backend gate. */
export type PresentationResult = PresentationUnsupported | PresentationSuccess

/**
 * The presentation-only facts of the rendered frame loop (ARCH-008,
 * ARCH-009, REQ-118).
 *
 * The presenter reports exactly what it presented: the names of the Band
 * nodes it rendered, the count of presented frames since the Scene was
 * bound, and the animation time of the last presented frame. The record
 * contains presentation state only — Three.js node names, frame metrics,
 * and interpolation history — and never a projection, resource value,
 * combat result, relationship result, fate result, or outcome
 * (PVS-ARC-008). The promised-row acceptance reads this record from the
 * built product to prove that the two projected initial Band members are
 * rendered and that the authored animation advances from the current
 * projection tick and interpolation value on the existing frame loop.
 */
export interface FramePresentationRecord {
  /** The names of the presented Band-member nodes of the last presented frame. */
  readonly presentedNodes: readonly string[]
  /** The count of presented frames since the Scene was bound. */
  readonly presentedFrames: number
  /** The animation time of the last presented frame, in Simulation seconds. */
  readonly animationTime: number
}

/**
 * The Three.js Presentation Adapter frame presenter (ARCH-009, REQ-118,
 * PVS-ARC-008).
 *
 * The Browser Runtime calls `present` exactly once per rendered frame,
 * after each fixed-tick batch, passing only the current immutable
 * projection and the interpolation timing (ARCH-008, ARCH-012). The
 * presenter uses projected Band IDs to update presentation-only node
 * visibility, advances the authored animation from the projection tick and
 * interpolation value, and renders one frame through WebGPU. It owns only
 * Three.js objects, load state, and interpolation history, stores no
 * authoritative state, and has no write path to the Simulation: missing or
 * delayed presentation output cannot change an outcome.
 */
export interface ScenePresenter {
  /** Present one frame from the current immutable projection and interpolation timing. */
  present(projection: SimulationProjection, interpolation: number): void
  /** Read the presentation-only facts of the last presented frame. */
  readFramePresentation(): FramePresentationRecord
}
