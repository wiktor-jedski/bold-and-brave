import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PerspectiveCamera, Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { STARTUP_SCENE } from '../../core/content'
import { loadStartupScene, productionSceneLoadDependencies } from './index'
import type {
  SceneAnimationClip,
  SceneAnimationMixer,
  SceneGltfLoader,
  SceneGltfResult,
  SceneLoadDependencies,
  SceneLoadProgress,
  SceneLoadReporter,
  SceneObject3D,
} from './interface'
import type { PresentationRenderer } from '../presentation'

/**
 * The Node test environment has no `ProgressEvent` (a browser API the
 * Three.js `GLTFLoader` dispatches while loading embedded buffers); the
 * committed glTF is self-contained, so this minimal shim lets the real
 * loader decode it under vitest. The browser provides the real class.
 */
class ProgressEvent {
  type: string
  lengthComputable: boolean
  loaded: number
  total: number
  constructor(
    type: string,
    init: { lengthComputable?: boolean; loaded?: number; total?: number } = {},
  ) {
    this.type = type
    this.lengthComputable = init.lengthComputable ?? false
    this.loaded = init.loaded ?? 0
    this.total = init.total ?? 0
  }
}
;(globalThis as Record<string, unknown>).ProgressEvent = ProgressEvent

/** The committed authored glTF of the startup manifest. */
const AUTHORED_GLTF_PATH = join(
  'public',
  'scenes',
  'poc-overworld',
  'poc-overworld-environment.gltf',
)

/** The committed authored glTF bytes the production loader downloads. */
const AUTHORED_GLTF_BYTES = readFileSync(AUTHORED_GLTF_PATH)

/** Build a fetch response that streams `bytes` in `chunkCount` chunks. */
function streamedResponse(bytes: Uint8Array, chunkCount: number): Response {
  const chunkSize = Math.ceil(bytes.length / chunkCount)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        controller.enqueue(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)))
      }
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { 'content-length': String(bytes.length) },
  })
}

/** One recorded renderer operation of the Scene load. */
type RendererOperation = 'setSize' | 'compileAsync' | 'render'

/** The recording renderer surface of the Scene-load tests. */
interface RecordingRenderer extends PresentationRenderer {
  /** Every renderer operation in call order. */
  readonly operations: RendererOperation[]
  /** The scene passed to `compileAsync` and `render`. */
  readonly scene: unknown
  /** The camera passed to `compileAsync` and `render`. */
  readonly camera: unknown
  /** The size passed to `setSize`. */
  readonly size: { width: number; height: number }
}

/** Build the recording WebGPU renderer of the Scene-load tests. */
function createRecordingRenderer(): RecordingRenderer {
  const operations: RendererOperation[] = []
  let scene: unknown
  let camera: unknown
  let size = { width: 0, height: 0 }
  return {
    operations,
    get scene() {
      return scene
    },
    get camera() {
      return camera
    },
    get size() {
      return size
    },
    init() {
      return Promise.resolve()
    },
    dispose() {},
    setSize(width: number, height: number) {
      operations.push('setSize')
      size = { width, height }
    },
    compileAsync(nextScene: unknown, nextCamera: unknown) {
      operations.push('compileAsync')
      scene = nextScene
      camera = nextCamera
      return Promise.resolve()
    },
    render(nextScene: unknown, nextCamera: unknown) {
      operations.push('render')
      scene = nextScene
      camera = nextCamera
    },
    get backend() {
      return { isWebGPUBackend: true }
    },
    get domElement() {
      return {} as HTMLCanvasElement
    },
  }
}

/** The recording progress reporter of the Scene-load tests. */
function createRecordingReporter(): { reports: SceneLoadProgress[]; reporter: SceneLoadReporter } {
  const reports: SceneLoadProgress[] = []
  return {
    reports,
    reporter: {
      report(progress: SceneLoadProgress) {
        reports.push(progress)
      },
    },
  }
}

/** The recording mixer factory recording construction, play, and update. */
function createRecordingMixerFactory(): {
  roots: unknown[]
  playedClips: string[]
  updates: number[]
  AnimationMixer: new (root: SceneObject3D) => SceneAnimationMixer
} {
  const roots: unknown[] = []
  const playedClips: string[] = []
  const updates: number[] = []
  return {
    roots,
    playedClips,
    updates,
    AnimationMixer: class RecordingMixer implements SceneAnimationMixer {
      constructor(root: SceneObject3D) {
        roots.push(root)
      }
      clipAction(clip: SceneAnimationClip) {
        playedClips.push(clip.name)
        return { play() {} }
      }
      update(time: number) {
        updates.push(time)
      }
    },
  }
}

/** The real Scene-load dependencies with an injected download function. */
function dependenciesWith(fetchInput: typeof fetch): SceneLoadDependencies {
  return { ...productionSceneLoadDependencies, fetchInput }
}

describe('startup Scene load (ARCH-022, ARCH-009, REQ-136, PVS-WEB-003)', () => {
  it('downloads the committed authored asset as a stream, decodes it with the real GLTFLoader, and reports the ordered download, decode, GPU upload, and readiness stages', async () => {
    let fetchCalls = 0
    const renderer = createRecordingRenderer()
    const { reports, reporter } = createRecordingReporter()
    const mixer = createRecordingMixerFactory()
    const dependencies: SceneLoadDependencies = {
      ...dependenciesWith((input: string | URL | Request) => {
        fetchCalls += 1
        expect(String(input)).toBe(STARTUP_SCENE.assets[0].source)
        return Promise.resolve(streamedResponse(AUTHORED_GLTF_BYTES, 1))
      }),
      AnimationMixer: mixer.AnimationMixer,
    }

    const result = await loadStartupScene(renderer, STARTUP_SCENE, dependencies, reporter)

    // Exactly one network download: the authored glTF is self-contained,
    // so the decode produces no second asset request (REQ-136).
    expect(fetchCalls).toBe(1)

    // The exact ordered stage names of the load (PVS-WEB-003).
    expect(result.sceneId).toBe('poc-overworld')
    expect(result.assetId).toBe('poc-overworld-environment')
    expect(result.stages).toEqual(['download', 'decode', 'upload', 'ready'])
    expect(result.backend).toBe('webgpu')

    // The download stage reported stream progress against the declared
    // total, and every later stage carried the finished byte count.
    const total = AUTHORED_GLTF_BYTES.length
    expect(reports.map((report) => report.stage)).toEqual([
      'download',
      'download',
      'decode',
      'upload',
      'ready',
    ])
    expect(reports[0]).toEqual({ stage: 'download', receivedBytes: 0, totalBytes: total })
    expect(reports[1]).toEqual({ stage: 'download', receivedBytes: total, totalBytes: total })
    expect(reports[2]).toEqual({ stage: 'decode', receivedBytes: total, totalBytes: total })

    // The decoded asset contains the initial Band nodes and the one
    // authored animation clip (ARCH-016): the glTF root attached to the
    // one Three.js Scene carries the two Band member nodes.
    expect(result.animationClips).toEqual(['poc-band-idle'])
    const attached = (renderer.scene as Scene).children[0]
    expect(attached.children.map((child) => child.name)).toEqual([
      'poc-player-character',
      'poc-companion',
    ])

    // The loader prepared GPU resources and rendered exactly one frame
    // after sizing the canvas to the promised viewport (ARCH-009,
    // REQ-136); in the Node test environment the viewport falls back to
    // the promised 1920 × 1080 row (ARCH-024).
    expect(renderer.operations).toEqual(['setSize', 'compileAsync', 'render'])
    expect(renderer.size).toEqual({ width: 1920, height: 1080 })
  })

  it('creates one third-person PerspectiveCamera and the required AnimationMixer with the authored clip', async () => {
    const renderer = createRecordingRenderer()
    const { reporter } = createRecordingReporter()
    const mixer = createRecordingMixerFactory()
    const dependencies: SceneLoadDependencies = {
      ...dependenciesWith(() => Promise.resolve(streamedResponse(AUTHORED_GLTF_BYTES, 1))),
      AnimationMixer: mixer.AnimationMixer,
    }

    await loadStartupScene(renderer, STARTUP_SCENE, dependencies, reporter)

    // One third-person `PerspectiveCamera` behind and above the Band
    // (ARCH-009): the authored camera defaults are the only camera of the
    // product surface.
    expect(renderer.camera).toBeInstanceOf(PerspectiveCamera)
    const camera = renderer.camera as PerspectiveCamera
    expect(camera.fov).toBe(50)
    expect(camera.near).toBe(0.1)
    expect(camera.far).toBe(1000)
    expect(camera.position.y).toBe(3.5)
    expect(camera.position.z).toBe(8)

    // The required `AnimationMixer` was created exactly once, bound to the
    // decoded glTF root (the attached Band object), started the first
    // authored clip, and advanced to time 0 exactly once (ARCH-009).
    const attachedBand = (renderer.scene as Scene).children[0]
    expect(mixer.roots).toEqual([attachedBand])
    expect(mixer.playedClips).toEqual(['poc-band-idle'])
    expect(mixer.updates).toEqual([0])
  })

  it('reports incremental download progress while the asset streams in chunks', async () => {
    const renderer = createRecordingRenderer()
    const { reports, reporter } = createRecordingReporter()
    const dependencies = dependenciesWith(() =>
      Promise.resolve(streamedResponse(AUTHORED_GLTF_BYTES, 3)),
    )

    await loadStartupScene(renderer, STARTUP_SCENE, dependencies, reporter)

    const total = AUTHORED_GLTF_BYTES.length
    const downloads = reports.filter((report) => report.stage === 'download')
    // First the stage starts with zero received bytes, then each stream
    // chunk reports strictly increasing received bytes up to the total.
    expect(downloads[0]?.receivedBytes).toBe(0)
    for (let index = 1; index < downloads.length; index += 1) {
      const previous = downloads[index - 1] as SceneLoadProgress
      const current = downloads[index] as SceneLoadProgress
      expect(current.receivedBytes).toBeGreaterThan(previous.receivedBytes)
      expect(current.receivedBytes).toBeLessThanOrEqual(total)
    }
    const last = downloads[downloads.length - 1] as SceneLoadProgress
    expect(last.receivedBytes).toBe(total)
  })

  it('decodes with GLTFLoader only after the complete download, handing the exact bytes and an empty path', async () => {
    const renderer = createRecordingRenderer()
    const { reporter } = createRecordingReporter()
    const mixer = createRecordingMixerFactory()
    const parsedBuffers: ArrayBuffer[] = []
    const parsedPaths: string[] = []

    /** The recording GLTFLoader proving the decode handoff. */
    class RecordingGltfLoader implements SceneGltfLoader {
      parse(
        data: ArrayBuffer,
        path: string,
        onLoad: (gltf: SceneGltfResult) => void,
        _onError: (error: unknown) => void,
      ): void {
        parsedBuffers.push(data)
        parsedPaths.push(path)
        onLoad({ scene: { add() {} }, animations: [{ name: 'poc-band-idle' }] })
      }
    }

    const dependencies: SceneLoadDependencies = {
      ...productionSceneLoadDependencies,
      fetchInput: () => Promise.resolve(streamedResponse(AUTHORED_GLTF_BYTES, 1)),
      GLTFLoader: RecordingGltfLoader as unknown as SceneLoadDependencies['GLTFLoader'],
      createScene: () => new Scene(),
      PerspectiveCamera,
      AnimationMixer: mixer.AnimationMixer,
    }

    await loadStartupScene(renderer, STARTUP_SCENE, dependencies, reporter)

    expect(parsedBuffers).toHaveLength(1)
    expect(parsedPaths).toEqual([''])
    // The decode received the complete downloaded bytes, byte for byte.
    expect(Array.from(new Uint8Array(parsedBuffers[0] as ArrayBuffer))).toEqual(
      Array.from(AUTHORED_GLTF_BYTES),
    )
  })

  it('completes a delayed asset response without a load timeout, because no elapsed-time limit exists', async () => {
    const renderer = createRecordingRenderer()
    const { reporter } = createRecordingReporter()
    const { promise: delayed, resolve } = Promise.withResolvers<Response>()
    const dependencies = dependenciesWith(() => delayed)

    const pending = loadStartupScene(renderer, STARTUP_SCENE, dependencies, reporter)

    // Hold the response open; the load must still be pending with no
    // renderer work, not failed by any load deadline or timer (REQ-136,
    // PVS-WEB-003).
    let settled = false
    void pending.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(renderer.operations).toEqual([])

    resolve(streamedResponse(AUTHORED_GLTF_BYTES, 1))
    const result = await pending

    expect(result.stages).toEqual(['download', 'decode', 'upload', 'ready'])
    expect(renderer.operations).toEqual(['setSize', 'compileAsync', 'render'])
  })
})
