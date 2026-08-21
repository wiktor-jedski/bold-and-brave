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
import type { SceneLoadDiagnosticEvent, SceneLoadDiagnosticEventType, SceneLoadRecord } from '../src/browser/scene'

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
 * Collapse only consecutive `progress` diagnostic event kinds.
 *
 * The number of `progress` records depends on how the asset response
 * streams, so the exact event-order check compares the collapsed kind
 * sequence, which is deterministic for a given journey. Every other kind
 * is kept as-is: a duplicate `scene-load`, `download`, `decode`, `upload`,
 * `ready`, `complete`, or `failure` record, a missing record, or a record
 * out of order changes the sequence and is rejected.
 */
export function collapsedSceneLoadEventKinds(
  events: readonly SceneLoadDiagnosticEvent[],
): string[] {
  return events
    .map((event) => event.event)
    .filter((kind, index, kinds) => {
      if (kind !== 'progress') {
        return true
      }
      return index === 0 || kinds[index - 1] !== 'progress'
    })
}

/** The Scene-load stage names an event may carry. */
const SCENE_LOAD_STAGE_NAMES: readonly string[] = ['download', 'decode', 'upload', 'ready']

/**
 * The exact allowed property names of each diagnostic event kind.
 *
 * A record with any other property — an unknown field, a typo, or a
 * smuggled value — is rejected, so the machine-readable evidence can never
 * be padded with unvalidated data.
 */
const SCENE_LOAD_EVENT_KEYS: Readonly<Record<SceneLoadDiagnosticEventType, readonly string[]>> = {
  'scene-load': ['event', 'sceneId', 'assetId'],
  download: ['event', 'sceneId', 'assetId', 'stage', 'receivedBytes', 'totalBytes'],
  progress: ['event', 'sceneId', 'assetId', 'stage', 'receivedBytes', 'totalBytes'],
  decode: ['event', 'sceneId', 'assetId', 'stage', 'receivedBytes', 'totalBytes'],
  upload: ['event', 'sceneId', 'assetId', 'stage', 'receivedBytes', 'totalBytes'],
  ready: ['event', 'sceneId', 'assetId', 'stage', 'receivedBytes', 'totalBytes'],
  complete: ['event', 'sceneId', 'assetId'],
  failure: ['event', 'sceneId', 'assetId', 'stage', 'message'],
}

/** Whether `value` is a finite number (JSON-safe and bounded). */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Whether `value` is a valid total: a finite positive number or `null`. */
function isValidTotalBytes(value: unknown): value is number | null {
  return value === null || (isFiniteNumber(value) && value > 0)
}

/**
 * Validate the applicable payload fields of one diagnostic record
 * (REQ-137, PVS-WEB-004).
 *
 * Every kind requires exactly its applicable fields: the load-boundary
 * records carry only the identifiers; the download stage carries its
 * start byte counts; every progress record carries a received byte count
 * within the declared total; the decode, GPU-upload, and readiness records
 * carry the finished-download byte counts (equal to the declared total);
 * and the failure record carries a non-empty readable message. A record
 * with a missing applicable field, an arbitrary unknown property, a wrong
 * stage, or an invalid byte relationship is rejected, so a malformed
 * diagnostic record can never produce passing Scene-load evidence.
 */
export function validateSceneLoadEventPayload(
  event: SceneLoadDiagnosticEvent,
): string[] {
  const rejections: string[] = []
  const kind = event.event
  const { stage, receivedBytes, totalBytes, message } = event

  // Reject any arbitrary unknown property on the record: the machine
  // evidence may carry only the exact applicable fields of the kind, so
  // `{event: 'scene-load', ..., unexpected: 'x'}` fails acceptance.
  const allowedKeys = SCENE_LOAD_EVENT_KEYS[kind]
  for (const key of Object.keys(event)) {
    if (!allowedKeys.includes(key)) {
      rejections.push(`The ${kind} record carries unexpected property ${key}.`)
    }
  }

  switch (kind) {
    case 'scene-load':
    case 'complete': {
      if (stage !== undefined) {
        rejections.push(`The ${kind} record must not carry a stage; found ${stage}.`)
      }
      if (receivedBytes !== undefined) {
        rejections.push(`The ${kind} record must not carry received bytes; found ${receivedBytes}.`)
      }
      if (totalBytes !== undefined) {
        rejections.push(`The ${kind} record must not carry a total; found ${totalBytes}.`)
      }
      if (message !== undefined) {
        rejections.push(`The ${kind} record must not carry a message; found ${message}.`)
      }
      break
    }
    case 'download': {
      if (stage !== 'download') {
        rejections.push(`The download record carries stage ${stage ?? 'none'}; download is required.`)
      }
      if (receivedBytes !== 0) {
        rejections.push(
          `The download record carries ${receivedBytes ?? 'no'} received bytes; the stage-start value 0 is required.`,
        )
      }
      if (!isValidTotalBytes(totalBytes)) {
        rejections.push(
          `The download record carries an invalid total ${String(totalBytes)}; a positive number or null is required.`,
        )
      }
      if (message !== undefined) {
        rejections.push(`The download record must not carry a message; found ${message}.`)
      }
      break
    }
    case 'progress': {
      if (stage !== 'download') {
        rejections.push(`The progress record carries stage ${stage ?? 'none'}; download is required.`)
      }
      if (!isFiniteNumber(receivedBytes) || receivedBytes <= 0) {
        rejections.push(
          `The progress record carries invalid received bytes ${String(receivedBytes)}; a positive finite number is required.`,
        )
      }
      if (!isValidTotalBytes(totalBytes)) {
        rejections.push(
          `The progress record carries an invalid total ${String(totalBytes)}; a positive number or null is required.`,
        )
      }
      if (
        isFiniteNumber(receivedBytes) &&
        isFiniteNumber(totalBytes) &&
        receivedBytes > totalBytes
      ) {
        rejections.push(
          `The progress record reports ${receivedBytes} of ${totalBytes} bytes; the received count must not exceed the total.`,
        )
      }
      if (message !== undefined) {
        rejections.push(`The progress record must not carry a message; found ${message}.`)
      }
      break
    }
    case 'decode':
    case 'upload':
    case 'ready': {
      if (stage !== kind) {
        rejections.push(`The ${kind} record carries stage ${stage ?? 'none'}; ${kind} is required.`)
      }
      if (!isFiniteNumber(receivedBytes) || receivedBytes < 0) {
        rejections.push(
          `The ${kind} record carries invalid received bytes ${String(receivedBytes)}; a non-negative finite number is required.`,
        )
      }
      if (!isValidTotalBytes(totalBytes)) {
        rejections.push(
          `The ${kind} record carries an invalid total ${String(totalBytes)}; a positive number or null is required.`,
        )
      }
      if (
        isFiniteNumber(receivedBytes) &&
        isFiniteNumber(totalBytes) &&
        receivedBytes !== totalBytes
      ) {
        rejections.push(
          `The ${kind} record reports ${receivedBytes} of ${totalBytes} bytes; decode follows the complete download, so the finished-download count must equal the declared total.`,
        )
      }
      if (message !== undefined) {
        rejections.push(`The ${kind} record must not carry a message; found ${message}.`)
      }
      break
    }
    case 'failure': {
      if (typeof message !== 'string' || message === '') {
        rejections.push('The failure record carries no readable error message.')
      }
      if (stage !== undefined && !SCENE_LOAD_STAGE_NAMES.includes(stage)) {
        rejections.push(`The failure record carries unknown stage ${stage}.`)
      }
      if (receivedBytes !== undefined) {
        rejections.push(`The failure record must not carry received bytes; found ${receivedBytes}.`)
      }
      if (totalBytes !== undefined) {
        rejections.push(`The failure record must not carry a total; found ${totalBytes}.`)
      }
      break
    }
  }

  return rejections
}

/**
 * Validate the cross-event byte invariants of one Scene-load journey
 * (PVS-WEB-003, REQ-137).
 *
 * The byte-carrying records of a journey — download, progress, decode,
 * GPU upload, and readiness — must declare one consistent total across all
 * of them (a record that declares a number must match the journey total,
 * and no record may mix a declared total with a missing one), and the
 * received byte counts must be monotonic non-decreasing in event order:
 * the download stage starts at zero, each progress update grows toward the
 * declared total, and decode/upload/readiness carry the finished-download
 * count. A mismatched total or a decreasing received count is rejected.
 */
function validateSceneLoadByteInvariants(
  events: readonly SceneLoadDiagnosticEvent[],
): string[] {
  const rejections: string[] = []
  const byteKinds = new Set(['download', 'progress', 'decode', 'upload', 'ready'])
  let declaredTotal: number | null = null
  let hasDeclaredTotal = false
  let previousBytes = -1
  let byteIndex = 0

  for (const event of events) {
    if (!byteKinds.has(event.event)) {
      continue
    }
    if (typeof event.totalBytes === 'number') {
      if (!hasDeclaredTotal) {
        declaredTotal = event.totalBytes
        hasDeclaredTotal = true
      } else if (event.totalBytes !== declaredTotal) {
        rejections.push(
          `Diagnostic byte record ${byteIndex} declares total ${event.totalBytes}; the journey declares ${declaredTotal}. One consistent declared total is required.`,
        )
      }
    } else if (hasDeclaredTotal) {
      rejections.push(
        `Diagnostic byte record ${byteIndex} carries no declared total; the journey declares ${declaredTotal}.`,
      )
    }
    if (typeof event.receivedBytes === 'number') {
      if (event.receivedBytes < previousBytes) {
        rejections.push(
          `Diagnostic byte record ${byteIndex} reports ${event.receivedBytes} received bytes after ${previousBytes}; received bytes must not decrease.`,
        )
      }
      previousBytes = event.receivedBytes
    }
    byteIndex += 1
  }

  return rejections
}

/**
 * Validate the diagnostic event log of one Scene-load journey (REQ-137,
 * PVS-WEB-004, REQ-134).
 *
 * Every record must carry both the authored Scene and asset identifiers
 * and exactly its applicable payload fields; the kind sequence must match
 * the expected journey exactly (only consecutive `progress` records
 * collapse, because their count depends on the response stream), so a
 * missing stage, a duplicate non-progress record, a later stage after the
 * first error, or an automatic retry changes the sequence and is
 * rejected. The byte-carrying records must declare one consistent total
 * with monotonic received-byte progress. When the journey must contain
 * the first error, exactly one `failure` record at the download stage with
 * a readable message is required.
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
    rejections.push(...validateSceneLoadEventPayload(event))
  }

  rejections.push(...validateSceneLoadByteInvariants(events))

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
