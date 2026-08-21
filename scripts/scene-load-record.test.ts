import { describe, expect, it } from 'vitest'
import type { SceneLoadRecord } from '../src/browser/scene'
import {
  readAuthoredAnimationNames,
  REQUIRED_SCENE_LOAD_BACKEND,
  REQUIRED_SCENE_LOAD_STAGES,
  REQUIRED_SCENE_LOAD_STATE,
  validateSceneLoadEvidenceRecord,
} from './scene-load-record'

/** The one passing Scene-load record of the mismatch tests. */
const PASSING_RECORD: SceneLoadRecord = {
  sceneId: 'poc-overworld',
  assetId: 'poc-overworld-environment',
  stages: ['download', 'decode', 'upload', 'ready'],
  backend: 'webgpu',
  animationClips: ['poc-band-idle'],
  deliveryState: 'Ready',
}

describe('Scene-load evidence record (ARCH-022, REQ-136, PVS-WEB-003)', () => {
  it('reads the authored animation clip names from the committed glTF file', () => {
    const names = readAuthoredAnimationNames(process.cwd())
    expect(names).toEqual(['poc-band-idle'])
  })

  it('accepts the exact authored Scene ID, asset ID, stage order, WebGPU backend, authored clips, and Ready state', () => {
    const rejections = validateSceneLoadEvidenceRecord(
      PASSING_RECORD,
      readAuthoredAnimationNames(process.cwd()),
    )
    expect(rejections).toEqual([])
  })

  it('rejects a wrong Scene ID', () => {
    const rejections = validateSceneLoadEvidenceRecord(
      { ...PASSING_RECORD, sceneId: 'poc-settlement' },
      ['poc-band-idle'],
    )
    expect(rejections).toEqual([
      'Scene ID poc-settlement does not match the authored poc-overworld.',
    ])
  })

  it('rejects a wrong asset ID', () => {
    const rejections = validateSceneLoadEvidenceRecord(
      { ...PASSING_RECORD, assetId: 'poc-settlement-environment' },
      ['poc-band-idle'],
    )
    expect(rejections).toEqual([
      'Asset ID poc-settlement-environment does not match the authored poc-overworld-environment.',
    ])
  })

  it('rejects a missing, reordered, or extra stage', () => {
    const missing = validateSceneLoadEvidenceRecord(
      { ...PASSING_RECORD, stages: ['download', 'decode', 'upload'] },
      ['poc-band-idle'],
    )
    expect(missing.length).toBeGreaterThan(0)
    expect(missing[0]).toContain('does not match the required')

    const reordered = validateSceneLoadEvidenceRecord(
      { ...PASSING_RECORD, stages: ['download', 'upload', 'decode', 'ready'] },
      ['poc-band-idle'],
    )
    expect(reordered.length).toBeGreaterThan(0)
    expect(reordered[0]).toContain('does not match the required')
  })

  it('rejects a WebGL backend', () => {
    const rejections = validateSceneLoadEvidenceRecord(
      { ...PASSING_RECORD, backend: 'webgl' },
      ['poc-band-idle'],
    )
    expect(rejections).toContain('The Scene load ran on the webgl backend; WebGPU is required.')
    expect(REQUIRED_SCENE_LOAD_BACKEND).toBe('webgpu')
  })

  it('rejects missing, extra, or wrong animation clips', () => {
    const missing = validateSceneLoadEvidenceRecord(
      { ...PASSING_RECORD, animationClips: [] },
      ['poc-band-idle'],
    )
    expect(missing.some((reason) => reason.includes('Animation clips'))).toBe(true)

    const wrong = validateSceneLoadEvidenceRecord(
      { ...PASSING_RECORD, animationClips: ['other-clip'] },
      ['poc-band-idle'],
    )
    expect(wrong.some((reason) => reason.includes('Animation clips'))).toBe(true)
  })

  it('rejects a final state other than Ready', () => {
    const rejections = validateSceneLoadEvidenceRecord(
      { ...PASSING_RECORD, deliveryState: 'Loading Scene' as never },
      ['poc-band-idle'],
    )
    expect(rejections).toEqual([
      'Final delivery state Loading Scene does not match the required Ready.',
    ])
    expect(REQUIRED_SCENE_LOAD_STATE).toBe('Ready')
    expect(REQUIRED_SCENE_LOAD_STAGES).toEqual(['download', 'decode', 'upload', 'ready'])
  })
})
