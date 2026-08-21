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

/**
 * The stage names a failed load attempt may stop at (PVS-WEB-001,
 * REQ-134).
 *
 * The first asset-stage error can stop the download stage (before or
 * after progress), the decode stage, or the GPU-upload stage; the
 * readiness stage is the final success stage, so a failure there is not
 * an applicable failure.
 */
const FAILURE_STAGE_NAMES: readonly string[] = ['download', 'decode', 'upload']

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
      if (stage === undefined || !FAILURE_STAGE_NAMES.includes(stage)) {
        rejections.push(
          `The failure record must carry the download, decode, or upload stage; found ${stage ?? 'none'}.`,
        )
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

/** The exact collapsed stage kinds of one successful load attempt (PVS-WEB-003). */
const SUCCESS_ATTEMPT_KINDS: readonly string[] = Object.freeze([
  'download',
  'progress',
  'decode',
  'upload',
  'ready',
  'complete',
])

/**
 * The valid failed-attempt stage kinds and the stage the failure record
 * must report (PVS-WEB-001, REQ-134).
 *
 * The first asset-stage error can stop the download stage before any
 * progress, during progress, at the decode stage, or at the GPU-upload
 * stage; every pattern ends with the failure record, which must report
 * the stage where the attempt stopped. No later stage runs after the
 * failure.
 */
const FAILED_ATTEMPT_KINDS: ReadonlyArray<{ kinds: readonly string[]; failureStage: string }> =
  Object.freeze([
    { kinds: Object.freeze(['failure']), failureStage: 'download' },
    { kinds: Object.freeze(['download', 'failure']), failureStage: 'download' },
    { kinds: Object.freeze(['download', 'progress', 'failure']), failureStage: 'download' },
    { kinds: Object.freeze(['download', 'progress', 'decode', 'failure']), failureStage: 'decode' },
    {
      kinds: Object.freeze(['download', 'progress', 'decode', 'upload', 'failure']),
      failureStage: 'upload',
    },
  ])

/**
 * Split the event log into load attempts at every `scene-load` record.
 *
 * One explicit Retry starts a new attempt with a new `scene-load` record,
 * so each attempt is validated independently (REQ-134, PVS-WEB-001).
 */
function splitSceneLoadAttempts(
  events: readonly SceneLoadDiagnosticEvent[],
): SceneLoadDiagnosticEvent[][] {
  const attempts: SceneLoadDiagnosticEvent[][] = []
  let current: SceneLoadDiagnosticEvent[] = []
  for (const event of events) {
    if (event.event === 'scene-load') {
      if (current.length > 0) {
        attempts.push(current)
      }
      current = [event]
    } else {
      current.push(event)
    }
  }
  if (current.length > 0) {
    attempts.push(current)
  }
  return attempts
}

/**
 * Validate the byte invariants within one load attempt (PVS-WEB-003,
 * REQ-137).
 *
 * The byte state resets at every attempt boundary: a retried download
 * restarts at zero after any partial first-attempt progress. Within the
 * attempt, the first byte-carrying record declares the attempt total — a
 * number or `null` — and every later byte record must declare exactly the
 * same total, so mixing `null` with a numeric total in either order is
 * rejected. Received bytes must be monotonic non-decreasing within the
 * attempt.
 */
function validateSceneLoadAttemptBytes(
  attempt: readonly SceneLoadDiagnosticEvent[],
  attemptIndex: number,
): string[] {
  const rejections: string[] = []
  let firstTotalDeclared = false
  let firstTotal: number | null = null
  let previousBytes = -1
  let byteIndex = 0

  for (const event of attempt) {
    if (
      event.event !== 'download' &&
      event.event !== 'progress' &&
      event.event !== 'decode' &&
      event.event !== 'upload' &&
      event.event !== 'ready'
    ) {
      continue
    }
    const total = event.totalBytes === undefined ? null : event.totalBytes
    if (!firstTotalDeclared) {
      // Track the first declared total even when it is null: a later
      // numeric total must not replace it silently.
      firstTotal = total
      firstTotalDeclared = true
    } else if (total !== firstTotal) {
      rejections.push(
        `Byte record ${byteIndex} of load attempt ${attemptIndex} declares total ${total === null ? 'none' : total}; the attempt declares ${firstTotal === null ? 'none' : firstTotal}. One consistent declared total is required within the attempt.`,
      )
    }
    if (typeof event.receivedBytes === 'number') {
      if (event.receivedBytes < previousBytes) {
        rejections.push(
          `Byte record ${byteIndex} of load attempt ${attemptIndex} reports ${event.receivedBytes} received bytes after ${previousBytes}; received bytes must not decrease within the attempt.`,
        )
      }
      previousBytes = event.receivedBytes
    }
    byteIndex += 1
  }

  return rejections
}

/**
 * Validate the structure and byte invariants of one load attempt.
 *
 * A failed attempt follows one of the governed failed patterns and stops
 * at its failure record with the matching stage; a successful attempt
 * follows the download, progress, decode, GPU-upload, readiness, and
 * completion pattern.
 */
function validateSceneLoadAttempt(
  attempt: readonly SceneLoadDiagnosticEvent[],
  attemptIndex: number,
): string[] {
  const rejections: string[] = []
  if (attempt[0]?.event !== 'scene-load') {
    rejections.push(`Load attempt ${attemptIndex} does not start with a scene-load record.`)
    return rejections
  }

  const kinds = collapsedSceneLoadEventKinds(attempt).slice(1)
  const failure = attempt.find((event) => event.event === 'failure')

  if (failure !== undefined) {
    // The first error stops the attempt: no later stage may run
    // (REQ-134, PVS-WEB-001).
    if (attempt[attempt.length - 1]?.event !== 'failure') {
      rejections.push(`Load attempt ${attemptIndex} runs a stage after its failure record.`)
    }
    const match = FAILED_ATTEMPT_KINDS.find(
      (pattern) =>
        pattern.kinds.length === kinds.length &&
        pattern.kinds.every((kind, index) => kind === kinds[index]),
    )
    if (match === undefined) {
      rejections.push(
        `Failed load attempt ${attemptIndex} stage order ${kinds.join(', ')} is not a valid download, decode, or GPU-upload failure.`,
      )
    } else if (failure.stage !== match.failureStage) {
      rejections.push(
        `The failure record of load attempt ${attemptIndex} reports stage ${failure.stage ?? 'none'}; the attempt stopped at ${match.failureStage}.`,
      )
    }
  } else {
    if (
      kinds.length !== SUCCESS_ATTEMPT_KINDS.length ||
      kinds.some((kind, index) => kind !== SUCCESS_ATTEMPT_KINDS[index])
    ) {
      rejections.push(
        `Load attempt ${attemptIndex} stage order ${kinds.join(', ')} does not match the required download, progress, decode, upload, ready, complete.`,
      )
    }
  }

  rejections.push(...validateSceneLoadAttemptBytes(attempt, attemptIndex))
  return rejections
}

/**
 * Validate the attempt structure of one Scene-load journey (REQ-137,
 * PVS-WEB-004, REQ-134, PVS-WEB-001).
 *
 * A first-attempt success contains exactly one successful attempt and no
 * failure record. A retried journey contains exactly two attempts: the
 * first stops at exactly one failure record at an applicable
 * download/decode/upload stage, and the one explicit Retry starts a new
 * attempt at download and ends with the successful attempt.
 */
function validateSceneLoadAttempts(
  events: readonly SceneLoadDiagnosticEvent[],
  expectFailure: boolean,
): string[] {
  const rejections: string[] = []
  const attempts = splitSceneLoadAttempts(events)
  const failures = events.filter((event) => event.event === 'failure')

  if (expectFailure) {
    if (attempts.length !== 2) {
      rejections.push(
        `A retried journey must contain exactly two load attempts — one failed and one retried; found ${attempts.length}.`,
      )
    }
    if (failures.length !== 1) {
      rejections.push(`Expected exactly one failure event; found ${failures.length}.`)
    }
  } else {
    if (attempts.length !== 1) {
      rejections.push(
        `A first-attempt success must contain exactly one load attempt; found ${attempts.length}.`,
      )
    }
    if (failures.length !== 0) {
      rejections.push(
        `A first-attempt success must contain no failure event; found ${failures.length}.`,
      )
    }
  }

  for (const [attemptIndex, attempt] of attempts.entries()) {
    rejections.push(...validateSceneLoadAttempt(attempt, attemptIndex))
  }

  // The one explicit Retry must end with the successful attempt: the
  // machine-readable record is published only after the load passes.
  if (expectFailure && attempts.length === 2 && attempts[1].some((event) => event.event === 'failure')) {
    rejections.push('The retried journey must end with a successful load attempt.')
  }

  return rejections
}

/**
 * Validate the diagnostic event log of one Scene-load journey (REQ-137,
 * PVS-WEB-004, REQ-134).
 *
 * Every record must carry both the authored Scene and asset identifiers
 * and exactly its applicable payload fields. The log is split into load
 * attempts at every `scene-load` boundary: a first-attempt success
 * contains exactly one successful attempt, and a retried journey contains
 * exactly one failed attempt that stops at an applicable
 * download/decode/upload stage followed by one explicit Retry that starts
 * a new attempt at download and ends in the successful attempt. Within
 * each attempt the byte-carrying records declare one consistent total
 * with monotonic received-byte progress; the byte state resets at every
 * attempt boundary.
 */
export function validateSceneLoadEventLog(
  events: readonly SceneLoadDiagnosticEvent[],
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

  rejections.push(...validateSceneLoadAttempts(events, expectFailure))

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

  rejections.push(...validateSceneLoadEventLog(record.events, false))
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
 * made the first asset request, stopped at the first error at an
 * applicable download/decode/upload stage with both identifiers and the
 * readable message, ran no later stage of the failed attempt, started no
 * automatic retry, reached `Ready` after exactly one explicit Retry that
 * started a new attempt at download, selected the WebGPU backend, and
 * entered `Ready` with the exact attempt structure of the whole journey.
 */
export function validateRetriedSceneLoadEvidenceRecord(
  record: SceneLoadRecord,
  authoredAnimationNames: readonly string[],
): string[] {
  const rejections = validateSceneLoadEvidenceBase(record, authoredAnimationNames)

  rejections.push(...validateSceneLoadEventLog(record.events, true))
  if (record.retries !== 1) {
    rejections.push(
      `Retry count ${record.retries} does not match the required 1 for one explicit retry.`,
    )
  }
  if (record.failure === null) {
    rejections.push('A retried load must record its first error.')
  } else {
    if (record.failure.stage === null || !FAILURE_STAGE_NAMES.includes(record.failure.stage)) {
      rejections.push(
        `The first error stopped at stage ${record.failure.stage ?? 'unknown'}; an applicable download, decode, or upload stage is required.`,
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
