import { describe, expect, it } from 'vitest'
import { buildSceneLoadRecord, SCENE_LOAD_READY_STATE } from './record'
import type { SceneLoadSuccess } from './interface'
import type { PresentationRenderer } from '../presentation'

/** The one WebGPU renderer of the record tests. */
const WEBGPU_RENDERER = {
  backend: { isWebGPUBackend: true },
} as unknown as PresentationRenderer

/** The one successful Scene-load result of the record tests. */
const RESULT: SceneLoadSuccess = {
  sceneId: 'poc-overworld',
  assetId: 'poc-overworld-environment',
  stages: ['download', 'decode', 'upload', 'ready'],
  backend: 'webgpu',
  animationClips: ['poc-band-idle'],
}

describe('Scene-load record (ARCH-022, REQ-136)', () => {
  it('builds a deeply frozen machine-readable record with the exact Scene ID, asset ID, stage order, backend, authored clips, and Ready state', () => {
    const record = buildSceneLoadRecord(WEBGPU_RENDERER, RESULT)

    expect(record.sceneId).toBe('poc-overworld')
    expect(record.assetId).toBe('poc-overworld-environment')
    expect(record.stages).toEqual(['download', 'decode', 'upload', 'ready'])
    expect(record.backend).toBe('webgpu')
    expect(record.animationClips).toEqual(['poc-band-idle'])
    expect(record.deliveryState).toBe(SCENE_LOAD_READY_STATE)
    expect(record.deliveryState).toBe('Ready')

    // The record is plain, deeply frozen data that serializes directly to
    // JSON: no Three.js object, runtime object, or DOM node enters it.
    expect(Object.isFrozen(record)).toBe(true)
    expect(Object.isFrozen(record.stages)).toBe(true)
    expect(Object.isFrozen(record.animationClips)).toBe(true)
    expect(JSON.parse(JSON.stringify(record))).toEqual(record)
  })

  it('reports the WebGL fallback backend when the renderer backend is not WebGPU', () => {
    const webglRenderer = {
      backend: { isWebGPUBackend: false, isWebGLBackend: true },
    } as unknown as PresentationRenderer
    const record = buildSceneLoadRecord(webglRenderer, RESULT)

    expect(record.backend).toBe('webgl')
    expect(record.deliveryState).toBe('Ready')
  })
})
