/**
 * Scene-manifest content-contract check (ARCH-016, ARCH-022, REQ-136,
 * PVS-WEB-003).
 *
 * `bun run check:scene-manifest` reads the real public content catalog
 * (`src/core/content`) and proves the authored startup Scene manifest
 * contract:
 *   - the manifest and every nested record and list are frozen;
 *   - the startup Scene `poc-overworld` contains the glTF asset
 *     `poc-overworld-environment`;
 *   - every Scene and asset ID in the catalog is unique;
 *   - every authored asset reference resolves to the committed authored
 *     glTF file that the production Scene loader downloads.
 *
 * The command uses no injected or recording test collaborator: it imports
 * the real catalog and resolves the same asset source the production
 * loader fetches (REQ-136). The command exits 0 when the contract holds
 * and 1 otherwise, listing each rejection. `scripts/ci-check.py` runs it
 * in general CI.
 */
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { SCENES } from '../src/core/content'
import type { SceneContent } from '../src/core/content'

/** The repo directory that serves the authored asset sources to the built product. */
export const PUBLIC_ASSETS_DIR = 'public'

/**
 * Validate the authored Scene catalog contract (ARCH-016, REQ-136).
 *
 * Returns the list of rejection reasons; an empty list means every Scene
 * and asset record and list is frozen, every Scene and asset ID is unique,
 * the startup Scene `poc-overworld` contains the glTF asset
 * `poc-overworld-environment`, and every asset source resolves to a
 * committed authored glTF file under `public/`. The same source the
 * production loader fetches is resolved, so the authored asset and the
 * loaded asset are never two copies.
 */
export function validateSceneManifest(
  scenes: readonly SceneContent[],
  resolveAsset: (source: string) => string,
): string[] {
  const rejections: string[] = []

  const sceneIds = new Set<string>()
  const assetIds = new Set<string>()

  for (const scene of scenes) {
    if (!Object.isFrozen(scene)) {
      rejections.push(`Scene ${scene.id} is not frozen.`)
    }
    if (!Object.isFrozen(scene.assets)) {
      rejections.push(`Scene ${scene.id} asset list is not frozen.`)
    }
    if (sceneIds.has(scene.id)) {
      rejections.push(`Duplicate Scene ID ${scene.id}.`)
    }
    sceneIds.add(scene.id)

    for (const asset of scene.assets) {
      if (!Object.isFrozen(asset)) {
        rejections.push(`Scene ${scene.id} asset ${asset.id} is not frozen.`)
      }
      if (assetIds.has(asset.id)) {
        rejections.push(`Duplicate asset ID ${asset.id}.`)
      }
      assetIds.add(asset.id)
      if (asset.kind !== 'gltf') {
        rejections.push(`Scene ${scene.id} asset ${asset.id} is not an authored glTF asset.`)
      }
      const assetFile = resolveAsset(asset.source)
      if (!existsSync(assetFile) || !statSync(assetFile).isFile()) {
        rejections.push(
          `Scene ${scene.id} asset ${asset.id} source ${asset.source} does not resolve to the committed authored glTF file ${assetFile}.`,
        )
      }
    }
  }

  // The startup Scene contract (REQ-136): `poc-overworld` contains
  // `poc-overworld-environment`.
  const startupScene = scenes.find((scene) => scene.id === 'poc-overworld')
  if (startupScene === undefined) {
    rejections.push('The catalog contains no startup Scene poc-overworld.')
  } else if (!startupScene.assets.some((asset) => asset.id === 'poc-overworld-environment')) {
    rejections.push('The startup Scene poc-overworld does not contain poc-overworld-environment.')
  }

  return rejections
}

/** Resolve an authored asset source to its committed file under `public/`. */
export function resolvePublicAsset(projectRoot: string, source: string): string {
  return resolve(projectRoot, PUBLIC_ASSETS_DIR, source)
}

/** Run the Scene-manifest content-contract check against the real catalog. */
async function main(): Promise<void> {
  const projectRoot = process.cwd()
  const rejections = validateSceneManifest(SCENES, (source) =>
    resolvePublicAsset(projectRoot, source),
  )

  for (const rejection of rejections) {
    console.error(`Scene manifest rejected: ${rejection}`)
  }

  if (rejections.length > 0) {
    console.error(`Scene-manifest check failed: ${rejections.length} rejection(s).`)
    process.exit(1)
  }

  console.log(
    `Scene-manifest check OK: ${SCENES.length} Scene(s), frozen records, unique IDs, and committed authored assets.`,
  )
}

if (import.meta.main) {
  await main()
}
