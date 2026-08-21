// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SimulationProjection } from '../../core'
import { STARTUP_SCENE } from '../../core/content'
import { loadStartupScene, productionSceneLoadDependencies } from '../scene'
import type { SceneLoadDependencies, SceneLoadReporter, SceneLoadStage } from '../scene'
import type { PresentationRenderer } from './interface'
import { createScenePresenter } from './index'

/**
 * The Three.js frame-presenter integration test (ARCH-009, ARCH-022,
 * ARCH-012, REQ-118, PVS-ARC-008).
 *
 * This test wires the real production seams together — the real startup
 * Scene load downloads and decodes the committed authored glTF asset with
 * the real Three.js `GLTFLoader`, `Scene`, `PerspectiveCamera`, and
 * `AnimationMixer`, and the real frame presenter consumes the resulting
 * presentation handle — so it proves the exact contract the reviewer
 * requires: after the `[a, b]` then `[a]` Band transition, the real bound
 * node of the removed member is hidden and the presentation record
 * reports only the Band-member node IDs of the last presented projection
 * (`[a]`), never the ever-bound set. Only the renderer and the download
 * transport are harness seams (the WebGPU renderer cannot run in Vitest;
 * the committed asset bytes are streamed instead of served over HTTP).
 */
const AUTHORED_GLTF_BYTES = readFileSync(
  join('public', 'scenes', 'poc-overworld', 'poc-overworld-environment.gltf'),
)

/** The two Band-member IDs authored as nodes in the committed asset. */
const PLAYER_ID = 'poc-player-character'
const COMPANION_ID = 'poc-companion'

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
      return document.createElement('canvas')
    },
  }
}

/** Build a frozen public projection with the given Band membership. */
function projectionWith(band: readonly string[]): SimulationProjection {
  return Object.freeze({
    tick: 0,
    agents: Object.freeze([]),
    band: Object.freeze(band.map((id) => Object.freeze({ id, name: id }))),
    coin: 100,
    provisions: 10.0,
  })
}

describe('Three.js frame presenter integration with the real startup Scene (ARCH-009, ARCH-022, REQ-118)', () => {
  it('reports only the Band-member nodes of the last presented projection and hides a removed member node', async () => {
    // The real startup Scene load through the production dependencies and
    // the committed authored asset (REQ-136): download, decode, GPU
    // upload, and readiness all complete through the real Three.js
    // pipeline.
    const recordedStages: SceneLoadStage[] = []
    const reporter: SceneLoadReporter = {
      report(progress) {
        recordedStages.push(progress.stage)
      },
    }
    const renderer = createRenderer()
    const result = await loadStartupScene(renderer, STARTUP_SCENE, realSceneLoadDependencies, reporter)

    expect(recordedStages).toEqual(['download', 'download', 'decode', 'upload', 'ready'])
    expect(result.sceneId).toBe('poc-overworld')
    expect(result.assetId).toBe('poc-overworld-environment')
    expect(result.backend).toBe('webgpu')
    expect(result.animationClips).toEqual(['poc-band-idle'])

    // The real presenter consumes the real presentation handle.
    const presenter = createScenePresenter(result.presentation, renderer)
    const scene = result.presentation.scene

    // The initial projection projects both Band members — the player
    // character and Miro (`poc-companion`) — exactly like a new campaign
    // (REQ-077): both authored nodes are bound and shown, and the record
    // reports both, in projection order.
    presenter.present(projectionWith([PLAYER_ID, COMPANION_ID]), 0)
    expect(presenter.readFramePresentation().presentedNodes).toEqual([PLAYER_ID, COMPANION_ID])
    expect(scene.getObjectByName(PLAYER_ID)?.visible).toBe(true)
    expect(scene.getObjectByName(COMPANION_ID)?.visible).toBe(true)

    // The `[a, b]` then `[a]` transition: the companion leaves the Band.
    // The real bound companion node is hidden, and the record reports
    // exactly the last presented projection — only the player — never the
    // ever-bound set.
    presenter.present(projectionWith([PLAYER_ID]), 0)
    expect(presenter.readFramePresentation().presentedNodes).toEqual([PLAYER_ID])
    expect(scene.getObjectByName(PLAYER_ID)?.visible).toBe(true)
    expect(scene.getObjectByName(COMPANION_ID)?.visible).toBe(false)

    // The record carries only presentation facts: the presented node IDs,
    // the frame count, and the animation time — no projection, resource
    // value, combat result, relationship result, fate result, or outcome
    // (PVS-ARC-008).
    const record = presenter.readFramePresentation()
    expect(Object.keys(record)).toEqual(['presentedNodes', 'presentedFrames', 'animationTime'])
    expect(Object.isFrozen(record)).toBe(true)
    expect(Object.isFrozen(record.presentedNodes)).toBe(true)
  })

  it('reports no presented node for a projected member without an authored node', async () => {
    const renderer = createRenderer()
    const reporter: SceneLoadReporter = { report() {} }
    const result = await loadStartupScene(renderer, STARTUP_SCENE, realSceneLoadDependencies, reporter)

    const presenter = createScenePresenter(result.presentation, renderer)
    presenter.present(projectionWith([PLAYER_ID, 'poc-troop-1']), 0)
    expect(presenter.readFramePresentation().presentedNodes).toEqual([PLAYER_ID])
  })
})
