/**
 * Shared Scene-load evidence record and validation (ARCH-022, ARCH-024,
 * REQ-136, REQ-137, PVS-WEB-003, PVS-WEB-004).
 *
 * The local promised-row acceptance records the real startup Scene load of
 * the built product: the product reports one machine-readable Scene-load
 * record after the load passes, and the promised-row spec validates that
 * report against the authored startup manifest and the committed authored
 * glTF file before it writes the evidence file. This module owns the
 * evidence shape and the validation: the exact Scene ID, asset ID, ordered
 * stage names, initialized WebGPU backend, the authored animation clip
 * names read from the committed glTF, the exact ordered diagnostic event
 * log with the Scene and asset identifiers in every record, the
 * first-error stop, the explicit Retry count, and the final `Ready` state.
 * The vitest mismatch tests prove that every wrong value is rejected
 * before it can produce passing evidence.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STARTUP_SCENE } from '../src/core/content'
import type { SceneLoadDiagnosticEvent, SceneLoadRecord } from '../src/browser/scene'

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

/**
 * The exact ordered diagnostic event kinds of a first-attempt success
 * (REQ-137, PVS-WEB-004).
 *
 * Consecutive `progress` records collapse to one kind because the number
 * of download-progress updates depends on the response stream; every other
 * event appears exactly once in this order.
 */
export const SUCCESS_SCENE_LOAD_EVENT_KINDS: readonly string[] = Object.freeze([
  'scene-load',
  'download',
  'progress',
  'decode',
  'upload',
  'ready',
  'complete',
])

/**
 * The exact ordered diagnostic event kinds of one failed-then-retried
 * load journey (REQ-134, PVS-WEB-001, REQ-137).
 *
 * The first failed attempt stops at the first error (`failure` after
 * `scene-load`), runs no later stage, and the one explicit Retry restarts
 * the load from its first stage; the journey ends in `complete`.
 */
export const RETRIED_SCENE_LOAD_EVENT_KINDS: readonly string[] = Object.freeze([
  'scene-load',
  'failure',
  'scene-load',
  'download',
  'progress',
  'decode',
  'upload',
  'ready',
  'complete',
])

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
 * Collapse consecutive duplicate diagnostic event kinds.
 *
 * The number of `progress` records depends on how the asset response
 * streams, so the exact event-order check compares the collapsed kind
 * sequence, which is deterministic for a given journey.
 */
export function collapsedSceneLoadEventKinds(
  events: readonly SceneLoadDiagnosticEvent[],
): string[] {
  return events
    .map((event) => event.event)
    .filter((kind, index, kinds) => index === 0 || kind !== kinds[index - 1])
}

/**
 * Validate the diagnostic event log of one Scene-load journey (REQ-137,
 * PVS-WEB-004, REQ-134).
 *
 * Every record must carry both the authored Scene and asset identifiers;
 * the collapsed kind sequence must match the expected journey exactly, so
 * a missing stage, a later stage after the first error, or an automatic
 * retry changes the sequence and is rejected. When the journey must
 * contain the first error, exactly one `failure` record at the download
 * stage with a readable message is required.
 */
export function validateSceneLoadEventLog(
  events: readonly SceneLoadDiagnosticEvent[],
  expectedKinds: readonly string[],
  expectFailure: boolean,
): string[] {
  const rejections: string[] = []
  const assetId = STARTUP_SCENE.assets[0].id

  for (const [index, event] of events.entries()) {
    if (event.sceneId !== STARTUP_SCENE.id) {
      rejections.push(
        `Diagnostic event ${index} carries Scene ID ${event.sceneId}; the authored ${STARTUP_SCENE.id} is required in every record.`,
      )
    }
    if (event.assetId !== assetId) {
      rejections.push(
        `Diagnostic event ${index} carries asset ID ${event.assetId}; the authored ${assetId} is required in every record.`,
      )
    }
  }

  const kinds = collapsedSceneLoadEventKinds(events)
  if (kinds.length !== expectedKinds.length || kinds.some((kind, index) => kind !== expectedKinds[index])) {
    rejections.push(
      `Diagnostic event order ${kinds.join(', ')} does not match the required ${expectedKinds.join(', ')}.`,
    )
  }

  const failures = events.filter((event) => event.event === 'failure')
  if (expectFailure) {
    if (failures.length !== 1) {
      rejections.push(`Expected exactly one failure event; found ${failures.length}.`)
    } else {
      const failure = failures[0]
      if (failure.stage !== 'download') {
        rejections.push(
          `The first error stopped at stage ${failure.stage ?? 'unknown'}; the download stage is required.`,
        )
      }
      if (typeof failure.message !== 'string' || failure.message === '') {
        rejections.push('The first error record carries no readable error message.')
      }
    }
  } else if (failures.length !== 0) {
    rejections.push(
      `A first-attempt success must contain no failure event; found ${failures.length}.`,
    )
  }

  return rejections
}

/**
 * Validate one Scene-load evidence record (REQ-136, REQ-137, PVS-WEB-003,
 * PVS-WEB-004).
 *
 * Returns the list of rejection reasons; an empty list means the product
 * loaded exactly the authored Scene `poc-overworld` and asset
 * `poc-overworld-environment` on the first attempt, reported the ordered
 * download, decode, GPU-upload, and readiness stages, selected the WebGPU
 * backend, carried the authored animation clip names, wrote the exact
 * diagnostic event log with both identifiers in every record, reported
 * zero retries and no failure, and entered `Ready`.
 */
export function validateSceneLoadEvidenceRecord(
  record: SceneLoadRecord,
  authoredAnimationNames: readonly string[],
): string[] {
  const rejections = validateSceneLoadEvidenceBase(record, authoredAnimationNames)

  rejections.push(
    ...validateSceneLoadEventLog(record.events, SUCCESS_SCENE_LOAD_EVENT_KINDS, false),
  )
  if (record.retries !== 0) {
    rejections.push(
      `Retry count ${record.retries} does not match the required 0 for a first-attempt success.`,
    )
  }
  if (record.failure !== null) {
    rejections.push('A first-attempt success must record no failure.')
  }

  return rejections
}

/**
 * Validate the Scene-load evidence record of the failed-then-retried
 * journey (REQ-134, REQ-136, REQ-137, PVS-WEB-001, PVS-WEB-004).
 *
 * Returns the list of rejection reasons; an empty list means the product
 * made the first asset request, stopped at the first error at the download
 * stage with both identifiers and the readable message, ran no later stage
 * of the failed attempt, started no automatic retry, reached `Ready` after
 * exactly one explicit Retry that restarted at download, selected the
 * WebGPU backend, and entered `Ready` with the exact diagnostic event
 * order of the whole journey.
 */
export function validateRetriedSceneLoadEvidenceRecord(
  record: SceneLoadRecord,
  authoredAnimationNames: readonly string[],
): string[] {
  const rejections = validateSceneLoadEvidenceBase(record, authoredAnimationNames)

  rejections.push(
    ...validateSceneLoadEventLog(record.events, RETRIED_SCENE_LOAD_EVENT_KINDS, true),
  )
  if (record.retries !== 1) {
    rejections.push(
      `Retry count ${record.retries} does not match the required 1 for one explicit retry.`,
    )
  }
  if (record.failure === null) {
    rejections.push('A retried load must record its first error.')
  } else {
    if (record.failure.stage !== 'download') {
      rejections.push(
        `The first error stopped at stage ${record.failure.stage ?? 'unknown'}; the download stage is required.`,
      )
    }
    if (record.failure.message === '') {
      rejections.push('The first error record carries no readable error message.')
    }
  }

  return rejections
}

/** The identifier, stage, backend, animation, and final-state checks shared by both validators. */
function validateSceneLoadEvidenceBase(
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
