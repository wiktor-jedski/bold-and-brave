/**
 * Public contract of the Scene Transition and Loading Collaboration
 * (ARCH-022, ARCH-009, ARCH-010, ARCH-016, ARCH-023, PVS-WEB-003,
 * REQ-136).
 *
 * After every startup gate passes, the production Scene-loading handoff
 * loads the startup Scene manifest through this module: it fetches the
 * authored glTF asset as a stream with download progress, decodes it with
 * `GLTFLoader`, attaches it to one Three.js Scene, creates one third-person
 * `PerspectiveCamera` and the required `AnimationMixer`, prepares GPU
 * resources, renders one frame, and reports Scene readiness (REQ-136).
 * The load sets no elapsed-time limit and owns no timer, second renderer,
 * second device, or second Simulation.
 *
 * The loader is a pure orchestration seam: every collaborator — the
 * download `fetch`, the `GLTFLoader` constructor, the Three.js object
 * constructors, and the renderer — is injectable, so the unit tests prove
 * the exact stage order, the download progress, the decode handoff, the
 * camera and mixer creation, and the one rendered frame without a GPU. The
 * production defaults construct the real Three.js classes.
 */

/**
 * The ordered Scene-load progress stages (PVS-WEB-003, REQ-136).
 *
 * The product visibly reports asset download, decode, GPU upload, and
 * Scene readiness in this exact order while the delivery state stays at
 * `Loading Scene`, and enters `Ready` only after every stage succeeds.
 */
export type SceneLoadStage = 'download' | 'decode' | 'upload' | 'ready'

/** The visible label of each Scene-load stage (PVS-WEB-003, REQ-136). */
export const SCENE_LOAD_STAGE_LABELS: Readonly<Record<SceneLoadStage, string>> = Object.freeze({
  download: 'Download',
  decode: 'Decode',
  upload: 'GPU upload',
  ready: 'Scene readiness',
})

/**
 * One Scene-load progress update (PVS-WEB-003, REQ-136).
 *
 * The download stage reports the received byte count against the total
 * when the response declares a content length; the decode, GPU-upload, and
 * readiness stages report their stage with the byte counts of the finished
 * download.
 */
export interface SceneLoadProgress {
  /** The stage that produced this update. */
  readonly stage: SceneLoadStage
  /** Bytes received from the asset response so far. */
  readonly receivedBytes: number
  /** The declared total asset size, or `null` when the response gives none. */
  readonly totalBytes: number | null
}

/**
 * The progress reporter of the Scene load (ARCH-010, PVS-WEB-003).
 *
 * The production reporter drives the delivery-state surface; tests inject
 * a recording reporter to prove the exact stage and progress sequence.
 */
export interface SceneLoadReporter {
  /** Report one Scene-load progress update. */
  report(progress: SceneLoadProgress): void
}

/**
 * The completed startup Scene load (ARCH-022, REQ-136).
 *
 * The loader returns the grounded facts of the successful load — the
 * authored identifiers, the exact stage order, the initialized backend,
 * and the authored animation clip names — so the machine-readable
 * Scene-load record and the delivery surface derive from what the load
 * actually did.
 */
export interface SceneLoadSuccess {
  /** The loaded Scene ID from the authored manifest. */
  readonly sceneId: string
  /** The loaded asset ID from the authored manifest. */
  readonly assetId: string
  /** The exact ordered stages the load performed. */
  readonly stages: readonly SceneLoadStage[]
  /** The initialized backend of the renderer that rendered the frame. */
  readonly backend: 'webgpu' | 'webgl'
  /** The names of the authored animation clips of the loaded asset. */
  readonly animationClips: readonly string[]
}

/**
 * The structural glTF loader surface the Scene loader decodes with
 * (ARCH-009, REQ-136).
 *
 * The real `GLTFLoader` of `three/addons` satisfies this structure; tests
 * inject a recording loader to prove the decode handoff. The loader feeds
 * the complete downloaded bytes, so decode always follows the full
 * download (PVS-WEB-003).
 */
export interface SceneGltfLoader {
  /** Decode glTF bytes into a Scene graph and its animation clips. */
  parse(
    data: ArrayBuffer,
    path: string,
    onLoad: (gltf: SceneGltfResult) => void,
    onError: (error: unknown) => void,
  ): void
}

/** The decoded glTF result the loader consumes (ARCH-009). */
export interface SceneGltfResult {
  /** The root object attached to the one Three.js Scene. */
  readonly scene: SceneObject3D
  /** The authored animation clips of the asset. */
  readonly animations: readonly SceneAnimationClip[]
}

/** The structural object surface the loader attaches and animates. */
export interface SceneObject3D {
  /** Add a child object to this object. */
  add(object: unknown): void
}

/** The structural animation-clip surface the mixer consumes. */
export interface SceneAnimationClip {
  /** The authored clip name. */
  readonly name: string
}

/**
 * The structural animation mixer surface (ARCH-009).
 *
 * The loader creates exactly one `AnimationMixer` for the loaded glTF and
 * starts the first authored clip; later phases advance it from the current
 * projection tick on the one frame loop (ARCH-008).
 */
export interface SceneAnimationMixer {
  /** Start the authored clip named `name`. */
  clipAction(clip: SceneAnimationClip): { play(): void }
  /** Advance the mixer to `time`. */
  update(time: number): void
}

/** The structural third-person camera surface the loader creates. */
export interface SceneCamera {
  /** The vertical field of view in degrees. */
  readonly fov: number
  /** The view position of the camera. */
  readonly position: { x: number; y: number; z: number }
}

/** The structural Scene the loader attaches the decoded glTF to. */
export interface SceneGraph {
  /** Add a child object to the Scene. */
  add(object: unknown): void
}

/**
 * The injectable collaborators of the Scene load (ARCH-022).
 *
 * Production binds the real `fetch`, the real `GLTFLoader`, and the real
 * Three.js `Scene`, `PerspectiveCamera`, and `AnimationMixer` constructors;
 * tests inject recording collaborators so the loader proves its exact
 * orchestration without a browser or GPU.
 */
export interface SceneLoadDependencies {
  /** The download function of the asset stream (production: `fetch`). */
  readonly fetchInput: typeof fetch
  /** The glTF decoder constructor (production: Three.js `GLTFLoader`). */
  readonly GLTFLoader: new () => SceneGltfLoader
  /** The Three.js Scene constructor the loader attaches the asset to. */
  readonly createScene: () => SceneGraph
  /** The third-person `PerspectiveCamera` constructor. */
  readonly PerspectiveCamera: new (
    fov: number,
    aspect: number,
    near: number,
    far: number,
  ) => SceneCamera
  /** The `AnimationMixer` constructor bound to the decoded glTF root. */
  readonly AnimationMixer: new (root: SceneObject3D) => SceneAnimationMixer
}
