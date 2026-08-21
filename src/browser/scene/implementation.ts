/**
 * Implementation of the startup Scene load (ARCH-022, ARCH-009, ARCH-010,
 * ARCH-016, ARCH-023, PVS-WEB-003, PVS-WEB-004, REQ-136, REQ-137).
 *
 * The loader performs the ordered Scene-load stages with the initialized
 * WebGPU renderer: it fetches the authored glTF asset as a stream and
 * reports download progress, decodes the complete bytes with `GLTFLoader`,
 * attaches the decoded glTF to one Three.js Scene, creates one third-person
 * `PerspectiveCamera` and the required `AnimationMixer` with the first
 * authored clip, prepares GPU resources through the renderer, renders
 * exactly one frame, and reports Scene readiness. The load sets no
 * elapsed-time limit and owns no timer (REQ-136, PVS-WEB-003); the one
 * Browser Runtime frame loop stays the only frame source (ARCH-008).
 *
 * The loader also writes the structured Scene-load console diagnostics —
 * the Scene load, each asset download and decode, the GPU upload, every
 * download-progress update, the completion, and the failure — each record
 * carrying the authored Scene and asset identifiers (REQ-137,
 * PVS-WEB-004). The first failed stage stops the load: no later stage
 * runs, and the failure record carries the failing stage and the readable
 * error for the `Load failed` surface and the one Retry action (REQ-134,
 * PVS-WEB-001).
 *
 * Every collaborator is injectable so the focused tests prove the exact
 * stage order, the streamed download progress, the decode handoff, the
 * camera and mixer creation, and the single rendered frame without a GPU.
 */
import { AnimationMixer, PerspectiveCamera, Scene } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { SceneContent } from '../../core/content'
import type { PresentationRenderer } from '../presentation'
import type { SceneLoadDiagnosticEvent, SceneLoadDiagnostics } from './diagnostics'
import { readableSceneLoadError } from './diagnostics'
import type {
  SceneCamera,
  SceneGltfLoader,
  SceneGltfResult,
  SceneGraph,
  SceneLoadDependencies,
  SceneLoadReporter,
  SceneLoadStage,
  SceneLoadSuccess,
} from './interface'

/** The third-person camera default vertical field of view in degrees. */
const CAMERA_FOV = 50
/** The third-person camera default near plane. */
const CAMERA_NEAR = 0.1
/** The third-person camera default far plane. */
const CAMERA_FAR = 1000
/** The third-person camera distance behind and above the Band. */
const CAMERA_DISTANCE = 8
/** The third-person camera height above the Band. */
const CAMERA_HEIGHT = 3.5

/**
 * The promised 1920 × 1080 CSS-pixel viewport (ARCH-024, REQ-013).
 *
 * The renderer canvas is sized to the active viewport when one exists; in
 * a headless test environment the canvas falls back to the promised
 * viewport of the supported row.
 */
const PROMISED_VIEWPORT = { width: 1920, height: 1080 }

/**
 * The production Scene-load dependencies (ARCH-022, ARCH-009).
 *
 * Production downloads with the real `fetch`, decodes with the real
 * Three.js `GLTFLoader`, and creates the real Three.js `Scene`,
 * `PerspectiveCamera`, and `AnimationMixer`. The loader receives the same
 * manifest the content-contract check validates, so the committed authored
 * asset and the loaded asset are the same file (REQ-136).
 */
export const productionSceneLoadDependencies: SceneLoadDependencies = {
  // The wrapper calls the global `fetch` with no receiver: the loader
  // invokes `fetchInput` as a method of the dependencies object, and the
  // browser's native `fetch` rejects a foreign `this` with
  // `Illegal invocation`.
  fetchInput: (input, init) => fetch(input, init),
  GLTFLoader,
  createScene: () => new Scene(),
  PerspectiveCamera,
  // The real `AnimationMixer` constructor accepts a Three.js `Object3D`,
  // which structurally satisfies the loader's minimal root surface; the
  // cast narrows the class to that surface, mirroring the renderer
  // factory cast in the backend gate.
  AnimationMixer: AnimationMixer as unknown as SceneLoadDependencies['AnimationMixer'],
}

/** Read the one authored asset of the startup Scene manifest. */
function startupAsset(scene: SceneContent): { id: string; source: string } {
  if (scene.assets.length === 0) {
    throw new Error(`Scene ${scene.id} has no authored asset.`)
  }
  const asset = scene.assets[0]
  if (asset.kind !== 'gltf') {
    throw new Error(`Scene ${scene.id} asset ${asset.id} is not an authored glTF asset.`)
  }
  return { id: asset.id, source: asset.source }
}

/** The active CSS-pixel viewport, or the promised viewport outside a browser. */
function viewportSize(): { width: number; height: number } {
  if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0) {
    return { width: window.innerWidth, height: window.innerHeight }
  }
  return PROMISED_VIEWPORT
}

/**
 * Read a fetch response body as a stream, reporting each received chunk
 * (PVS-WEB-003).
 *
 * When the response exposes a readable stream, every chunk is counted and
 * reported before the next read, so the download stage shows progress as
 * bytes arrive; a response without a stream body falls back to one atomic
 * `arrayBuffer` read and reports the whole download once.
 */
async function readResponseBody(
  response: Response,
  onChunk: (receivedBytes: number) => void,
): Promise<ArrayBuffer> {
  if (response.body === null) {
    const buffer = await response.arrayBuffer()
    onChunk(buffer.byteLength)
    return buffer
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (value !== undefined && value.byteLength > 0) {
      chunks.push(value)
      received += value.byteLength
      onChunk(value.byteLength)
    }
  }

  const buffer = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return buffer.buffer
}

/** Decode the complete downloaded bytes with the glTF loader. */
function decodeGltf(
  loader: SceneGltfLoader,
  buffer: ArrayBuffer,
): Promise<SceneGltfResult> {
  const { promise, resolve, reject } = Promise.withResolvers<SceneGltfResult>()
  // The asset is self-contained (its buffer is embedded), so the decode
  // path is empty and no second network download can occur.
  loader.parse(buffer, '', resolve, reject)
  return promise
}

/**
 * Load the startup Scene with the initialized WebGPU renderer (ARCH-022,
 * ARCH-009, REQ-136, PVS-WEB-003, REQ-137, PVS-WEB-004).
 *
 * Stage order is fixed: download (stream with progress), decode, GPU
 * upload, and Scene readiness. The loader attaches the decoded glTF to one
 * Three.js Scene, creates one third-person `PerspectiveCamera` and the
 * required `AnimationMixer` with the first authored clip, sizes the
 * renderer canvas to the active viewport, prepares GPU resources, renders
 * exactly one frame, and reports readiness. No stage has an elapsed-time
 * limit and no timer exists (REQ-136).
 *
 * The loader writes a structured console record for the Scene load, each
 * asset download and decode, the GPU upload, every download-progress
 * update, the completion, and the failure, each carrying the authored
 * Scene and asset identifiers (REQ-137, PVS-WEB-004). The first failed
 * stage stops the load: no later stage runs, the failure record carries
 * the failing stage and the readable error, and the rejected promise
 * surfaces the error to the Scene-loading handoff, which enters `Load
 * failed` with the one Retry action and starts no automatic retry
 * (REQ-134, PVS-WEB-001).
 */
export async function loadStartupScene(
  renderer: PresentationRenderer,
  scene: SceneContent,
  dependencies: SceneLoadDependencies = productionSceneLoadDependencies,
  reporter: SceneLoadReporter,
  diagnostics: SceneLoadDiagnostics,
): Promise<SceneLoadSuccess> {
  const asset = startupAsset(scene)
  const stages: SceneLoadStage[] = []
  /** The stage that is running, used by the first-error failure record. */
  let currentStage: SceneLoadStage | undefined

  /** Record one stage, report it to the surface, and track it as current. */
  function report(stage: SceneLoadStage, receivedBytes: number, totalBytes: number | null): void {
    currentStage = stage
    stages.push(stage)
    reporter.report({ stage, receivedBytes, totalBytes })
  }

  /** Record one structured diagnostic event with both authored identifiers. */
  function recordEvent(
    event: Omit<SceneLoadDiagnosticEvent, 'sceneId' | 'assetId'>,
  ): void {
    diagnostics.record({ sceneId: scene.id, assetId: asset.id, ...event })
  }

  // The Scene-load diagnostics begin with the load itself (REQ-137,
  // PVS-WEB-004): every record carries the authored Scene and asset
  // identifiers.
  recordEvent({ event: 'scene-load' })

  try {
    // 1. Download the asset as a stream and report progress (PVS-WEB-003).
    //    A non-ok asset response is a failed download stage.
    currentStage = 'download'
    const response = await dependencies.fetchInput(asset.source)
    if (!response.ok) {
      throw new Error(`The asset request failed with status ${response.status}.`)
    }
    const declaredTotal = response.headers.get('content-length')
    const totalBytes = declaredTotal === null ? null : Number(declaredTotal)
    report('download', 0, totalBytes)
    recordEvent({ event: 'download', stage: 'download', receivedBytes: 0, totalBytes })
    let receivedBytes = 0
    const buffer = await readResponseBody(response, (chunkBytes) => {
      receivedBytes += chunkBytes
      const progress = { stage: 'download' as const, receivedBytes, totalBytes }
      recordEvent({ event: 'progress', ...progress })
      reporter.report(progress)
    })

    // 2. Decode the complete bytes with GLTFLoader (ARCH-009, REQ-136).
    currentStage = 'decode'
    report('decode', receivedBytes, totalBytes)
    recordEvent({ event: 'decode', stage: 'decode', receivedBytes, totalBytes })
    const gltf = await decodeGltf(new dependencies.GLTFLoader(), buffer)

    // 3. Attach the decoded glTF to one Three.js Scene (ARCH-009).
    const threeScene: SceneGraph = dependencies.createScene()
    threeScene.add(gltf.scene)

    // 4. Create one third-person PerspectiveCamera and the required
    //    AnimationMixer with the first authored clip (ARCH-009).
    const viewport = viewportSize()
    renderer.setSize(viewport.width, viewport.height)
    const camera: SceneCamera = new dependencies.PerspectiveCamera(
      CAMERA_FOV,
      viewport.width / viewport.height,
      CAMERA_NEAR,
      CAMERA_FAR,
    )
    camera.position.x = 0
    camera.position.y = CAMERA_HEIGHT
    camera.position.z = CAMERA_DISTANCE

    const mixer = new dependencies.AnimationMixer(gltf.scene)
    if (gltf.animations.length > 0) {
      mixer.clipAction(gltf.animations[0]).play()
    }
    mixer.update(0)

    // 5. Prepare GPU resources (shaders and textures) for the Scene
    //    (PVS-WEB-003).
    currentStage = 'upload'
    report('upload', receivedBytes, totalBytes)
    recordEvent({ event: 'upload', stage: 'upload', receivedBytes, totalBytes })
    await renderer.compileAsync(threeScene, camera)

    // 6. Render exactly one frame (ARCH-009, REQ-136); later frames belong
    //    to the one Browser Runtime frame loop (ARCH-008).
    renderer.render(threeScene, camera)

    // 7. Scene readiness and the load completion (PVS-WEB-003, REQ-137).
    currentStage = 'ready'
    report('ready', receivedBytes, totalBytes)
    recordEvent({ event: 'ready', stage: 'ready', receivedBytes, totalBytes })
    recordEvent({ event: 'complete' })

    return {
      sceneId: scene.id,
      assetId: asset.id,
      stages,
      backend: renderer.backend.isWebGPUBackend === true ? 'webgpu' : 'webgl',
      animationClips: gltf.animations.map((clip) => clip.name),
      // The presentation handle of the loaded Scene (ARCH-022, ARCH-009,
      // REQ-118): the Scene-loading handoff binds the Three.js frame
      // presenter with the one Scene, camera, and mixer after the load
      // passes, and the presenter renders the read-only Simulation output
      // on the one Browser Runtime frame loop (ARCH-008).
      presentation: { scene: threeScene, camera, mixer },
    }
  } catch (error) {
    // The first failed stage stops the load: record the failure with both
    // identifiers, the failing stage, and the readable error, then run no
    // later stage and rethrow so the handoff enters `Load failed`
    // (REQ-134, PVS-WEB-001, REQ-137).
    const failure = readableSceneLoadError(error)
    const failureEvent: SceneLoadDiagnosticEvent =
      currentStage === undefined
        ? { event: 'failure', sceneId: scene.id, assetId: asset.id, message: failure }
        : {
            event: 'failure',
            sceneId: scene.id,
            assetId: asset.id,
            stage: currentStage,
            message: failure,
          }
    diagnostics.record(failureEvent)
    throw error
  }
}
