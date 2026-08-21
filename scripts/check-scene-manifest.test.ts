import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SCENES } from '../src/core/content'
import type { SceneContent } from '../src/core/content'
import { resolvePublicAsset, validateSceneManifest } from './check-scene-manifest'

/** A committed authored glTF fixture in a controlled directory. */
function makeAssetFixture(): { root: string; source: string } {
  const root = mkdtempSync(join(tmpdir(), 'bold-and-brave-manifest-'))
  const source = 'scenes/poc-overworld/poc-overworld-environment.gltf'
  mkdirSync(join(root, 'public', 'scenes', 'poc-overworld'), { recursive: true })
  writeFileSync(join(root, 'public', source), '{}')
  return { root, source }
}

/** Resolve an asset source against a fixture project root. */
function resolverFor(root: string): (source: string) => string {
  return (source) => resolvePublicAsset(root, source)
}

describe('Scene-manifest content contract (ARCH-016, REQ-136)', () => {
  it('accepts a frozen manifest whose startup Scene contains its glTF asset with unique IDs and a committed authored file', () => {
    const { root, source } = makeAssetFixture()
    try {
      const scene: SceneContent = Object.freeze({
        id: 'poc-overworld',
        name: 'Overworld',
        assets: Object.freeze([
          Object.freeze({ id: 'poc-overworld-environment', kind: 'gltf', source }),
        ]),
      })
      expect(validateSceneManifest([scene], resolverFor(root))).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects an unfrozen manifest, unfrozen asset list, or unfrozen asset record', () => {
    const { root } = makeAssetFixture()
    try {
      // The manifest itself is not frozen.
      const unfrozenScene: SceneContent = {
        id: 'poc-overworld',
        name: 'Overworld',
        assets: Object.freeze([
          Object.freeze({
            id: 'poc-overworld-environment',
            kind: 'gltf' as const,
            source: 'scenes/poc-overworld/poc-overworld-environment.gltf',
          }),
        ]),
      }
      expect(validateSceneManifest([unfrozenScene], resolverFor(root))).toContain(
        'Scene poc-overworld is not frozen.',
      )

      // The asset list is not frozen.
      const unfrozenList: SceneContent = Object.freeze({
        id: 'poc-overworld',
        name: 'Overworld',
        assets: [
          Object.freeze({
            id: 'poc-overworld-environment',
            kind: 'gltf' as const,
            source: 'scenes/poc-overworld/poc-overworld-environment.gltf',
          }),
        ],
      })
      expect(validateSceneManifest([unfrozenList], resolverFor(root))).toContain(
        'Scene poc-overworld asset list is not frozen.',
      )

      // The asset record is not frozen.
      const unfrozenAsset: SceneContent = Object.freeze({
        id: 'poc-overworld',
        name: 'Overworld',
        assets: Object.freeze([
          {
            id: 'poc-overworld-environment',
            kind: 'gltf' as const,
            source: 'scenes/poc-overworld/poc-overworld-environment.gltf',
          },
        ]),
      })
      expect(validateSceneManifest([unfrozenAsset], resolverFor(root))).toContain(
        'Scene poc-overworld asset poc-overworld-environment is not frozen.',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a missing startup Scene, a missing asset, and a non-glTF asset', () => {
    const { root } = makeAssetFixture()
    try {
      expect(validateSceneManifest([], resolverFor(root))).toContain(
        'The catalog contains no startup Scene poc-overworld.',
      )

      const noAsset: SceneContent = Object.freeze({
        id: 'poc-overworld',
        name: 'Overworld',
        assets: Object.freeze([]),
      })
      expect(validateSceneManifest([noAsset], resolverFor(root))).toContain(
        'The startup Scene poc-overworld does not contain poc-overworld-environment.',
      )

      const nonGltf: SceneContent = Object.freeze({
        id: 'poc-overworld',
        name: 'Overworld',
        assets: Object.freeze([
          Object.freeze({
            id: 'poc-overworld-environment',
            kind: 'png' as never,
            source: 'scenes/poc-overworld/poc-overworld-environment.gltf',
          }),
        ]),
      })
      expect(validateSceneManifest([nonGltf], resolverFor(root))).toContain(
        'Scene poc-overworld asset poc-overworld-environment is not an authored glTF asset.',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects duplicate Scene and asset IDs', () => {
    const { root, source } = makeAssetFixture()
    try {
      const scene: SceneContent = Object.freeze({
        id: 'poc-overworld',
        name: 'Overworld',
        assets: Object.freeze([
          Object.freeze({ id: 'poc-overworld-environment', kind: 'gltf', source }),
        ]),
      })
      const duplicateScene: SceneContent = Object.freeze({
        id: 'poc-overworld',
        name: 'Settlement',
        assets: Object.freeze([
          Object.freeze({ id: 'settlement-environment', kind: 'gltf', source }),
        ]),
      })
      expect(validateSceneManifest([scene, duplicateScene], resolverFor(root))).toContain(
        'Duplicate Scene ID poc-overworld.',
      )

      const duplicateAsset: SceneContent = Object.freeze({
        id: 'poc-overworld',
        name: 'Overworld',
        assets: Object.freeze([
          Object.freeze({ id: 'poc-overworld-environment', kind: 'gltf', source }),
          Object.freeze({ id: 'poc-overworld-environment', kind: 'gltf', source }),
        ]),
      })
      expect(validateSceneManifest([duplicateAsset], resolverFor(root))).toContain(
        'Duplicate asset ID poc-overworld-environment.',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects an asset source that does not resolve to a committed authored glTF file', () => {
    const { root } = makeAssetFixture()
    try {
      const missing: SceneContent = Object.freeze({
        id: 'poc-overworld',
        name: 'Overworld',
        assets: Object.freeze([
          Object.freeze({
            id: 'poc-overworld-environment',
            kind: 'gltf',
            source: 'scenes/poc-overworld/missing.gltf',
          }),
        ]),
      })
      const rejections = validateSceneManifest([missing], resolverFor(root))
      expect(rejections.some((reason) => reason.includes('missing.gltf'))).toBe(true)
      expect(
        rejections.some((reason) => reason.includes('does not resolve to the committed authored glTF file')),
      ).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts the real public catalog with its committed asset file', () => {
    // The command reads the real catalog and resolves the same asset the
    // production loader fetches (REQ-136).
    const rejections = validateSceneManifest(SCENES, (source) => resolvePublicAsset(process.cwd(), source))
    expect(rejections).toEqual([])
  })
})
