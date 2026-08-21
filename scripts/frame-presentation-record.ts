/**
 * Shared frame-presentation evidence and validation (ARCH-008, ARCH-009,
 * ARCH-024, REQ-118, PVS-ARC-008).
 *
 * The local promised-row acceptance observes the real frame presentation
 * of the built product: after the startup Scene load passes, the product
 * exposes a getter that returns the presentation-only facts of the frame
 * loop — the presented Band-member node names, the presented-frame count,
 * and the animation time. This module owns the evidence shape and the
 * validation that compares a record with the Band nodes actually authored
 * in the committed glTF file, so the check observes the authored nodes
 * and never a second copy. The vitest mismatch tests prove that every
 * wrong value is rejected before it can produce passing evidence.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FramePresentationRecord } from '../src/browser/presentation'
import { STARTUP_SCENE } from '../src/core/content'

/**
 * The minimum presented-frame count the acceptance requires (ARCH-008).
 *
 * The promised-row spec waits one real second after `Ready` before it
 * reads the record; on the promised machine's display that yields well
 * over this many presented frames, so the count proves the runtime
 * presented repeatedly on the one existing frame loop instead of a single
 * one-off frame.
 */
export const REQUIRED_MIN_PRESENTED_FRAMES = 20

/** The committed authored glTF file of the startup asset. */
export function authoredGltfPath(projectRoot: string): string {
  return join(projectRoot, 'public', STARTUP_SCENE.assets[0].source)
}

/**
 * The authored Band-node names of the committed glTF file (ARCH-016).
 *
 * The record validation compares the product-presented node names with the
 * node names actually authored in the committed asset — the nodes of the
 * initial Band — so the check observes the authored nodes and rejects a
 * product that presents no, wrong, or extra nodes.
 */
export function readAuthoredBandNodeNames(projectRoot: string): string[] {
  const gltf = JSON.parse(readFileSync(authoredGltfPath(projectRoot), 'utf8')) as {
    nodes?: Array<{ name?: string }>
  }
  return (gltf.nodes ?? []).map((node) => node.name ?? '')
}

/**
 * Validate one frame-presentation evidence record (REQ-118, PVS-ARC-008).
 *
 * Returns the list of rejection reasons; an empty list means the product
 * presented exactly the two authored Band-member nodes of the initial Band
 * through the frame loop, presented repeatedly (at least
 * `REQUIRED_MIN_PRESENTED_FRAMES` times), and advanced the authored
 * animation beyond time zero from the current projection tick and
 * interpolation value. The record itself carries only presentation facts —
 * node names, frame count, and animation time — never a projection,
 * resource value, combat result, relationship result, fate result, or
 * outcome.
 */
export function validateFramePresentationEvidenceRecord(
  record: FramePresentationRecord,
  authoredBandNodeNames: readonly string[],
): string[] {
  const rejections: string[] = []

  if (
    record.presentedNodes.length !== authoredBandNodeNames.length ||
    record.presentedNodes.some((name, index) => name !== authoredBandNodeNames[index])
  ) {
    rejections.push(
      `Presented nodes ${record.presentedNodes.join(', ')} do not match the authored ${authoredBandNodeNames.join(', ')}.`,
    )
  }

  if (record.presentedFrames < REQUIRED_MIN_PRESENTED_FRAMES) {
    rejections.push(
      `The frame loop presented ${record.presentedFrames} frame(s); at least ${REQUIRED_MIN_PRESENTED_FRAMES} are required.`,
    )
  }

  if (!(record.animationTime > 0)) {
    rejections.push(
      `The authored animation did not advance: animation time ${record.animationTime}.`,
    )
  }

  return rejections
}
