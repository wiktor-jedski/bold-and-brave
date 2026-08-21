/**
 * Shared Scene-load evidence record and validation (ARCH-022, ARCH-024,
 * REQ-136, PVS-WEB-003).
 *
 * The local promised-row acceptance records the real startup Scene load of
 * the built product: the product reports one machine-readable Scene-load
 * record after the load passes, and the promised-row spec validates that
 * report against the authored startup manifest and the committed authored
 * glTF file before it writes the evidence file. This module owns the
 * evidence shape and the validation: the exact Scene ID, asset ID, ordered
 * stage names, initialized WebGPU backend, the authored animation clip
 * names read from the committed glTF, and the final `Ready` state. The
 * vitest mismatch tests prove that every wrong value is rejected before it
 * can produce passing evidence.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STARTUP_SCENE } from '../src/core/content'
import type { SceneLoadRecord } from '../src/browser/scene'

/** The ordered Scene-load stage names required by the contract (PVS-WEB-003). */
export const REQUIRED_SCENE_LOAD_STAGES: readonly string[] = [
  'download',
  'decode',
  'upload',
  'ready',
]

/** The only backend the load may report (REQ-011, REQ-136). */
export const REQUIRED_SCENE_LOAD_BACKEND = 'webgpu'

/** The final delivery state after the real load passes (REQ-136). */
export const REQUIRED_SCENE_LOAD_STATE = 'Ready'

/** The committed authored glTF file of the startup asset. */
export function authoredGltfPath(projectRoot: string): string {
  return join(projectRoot, 'public', STARTUP_SCENE.assets[0].source)
}

/**
 * The authored animation clip names of the committed glTF file (ARCH-016).
 *
 * The record validation compares the product-reported animation clip names
 * with the names actually authored in the committed asset, so the check
 * observes the authored animation and rejects a load that reports no or
 * wrong clips.
 */
export function readAuthoredAnimationNames(projectRoot: string): string[] {
  const gltf = JSON.parse(readFileSync(authoredGltfPath(projectRoot), 'utf8')) as {
    animations?: Array<{ name?: string }>
  }
  return (gltf.animations ?? []).map((animation) => animation.name ?? '')
}

/**
 * Validate one Scene-load evidence record (REQ-136, PVS-WEB-003).
 *
 * Returns the list of rejection reasons; an empty list means the product
 * loaded exactly the authored Scene `poc-overworld` and asset
 * `poc-overworld-environment`, reported the ordered download, decode,
 * GPU-upload, and readiness stages, selected the WebGPU backend, carried
 * the authored animation clip names, and entered `Ready`.
 */
export function validateSceneLoadEvidenceRecord(
  record: SceneLoadRecord,
  authoredAnimationNames: readonly string[],
): string[] {
  const rejections: string[] = []

  if (record.sceneId !== STARTUP_SCENE.id) {
    rejections.push(
      `Scene ID ${record.sceneId} does not match the authored ${STARTUP_SCENE.id}.`,
    )
  }

  const assetId = STARTUP_SCENE.assets[0].id
  if (record.assetId !== assetId) {
    rejections.push(`Asset ID ${record.assetId} does not match the authored ${assetId}.`)
  }

  if (record.stages.length !== REQUIRED_SCENE_LOAD_STAGES.length) {
    rejections.push(
      `Stage order ${record.stages.join(', ')} does not match the required ${REQUIRED_SCENE_LOAD_STAGES.join(', ')}.`,
    )
  } else {
    for (let index = 0; index < REQUIRED_SCENE_LOAD_STAGES.length; index += 1) {
      if (record.stages[index] !== REQUIRED_SCENE_LOAD_STAGES[index]) {
        rejections.push(
          `Stage order ${record.stages.join(', ')} does not match the required ${REQUIRED_SCENE_LOAD_STAGES.join(', ')}.`,
        )
        break
      }
    }
  }

  if (record.backend !== REQUIRED_SCENE_LOAD_BACKEND) {
    rejections.push(
      `The Scene load ran on the ${record.backend} backend; WebGPU is required.`,
    )
  }

  if (
    record.animationClips.length !== authoredAnimationNames.length ||
    record.animationClips.some((name, index) => name !== authoredAnimationNames[index])
  ) {
    rejections.push(
      `Animation clips ${record.animationClips.join(', ')} do not match the authored ${authoredAnimationNames.join(', ')}.`,
    )
  }

  if (record.deliveryState !== REQUIRED_SCENE_LOAD_STATE) {
    rejections.push(
      `Final delivery state ${record.deliveryState} does not match the required ${REQUIRED_SCENE_LOAD_STATE}.`,
    )
  }

  return rejections
}
