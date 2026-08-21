/**
 * Frame-presentation evidence mismatch tests (ARCH-008, ARCH-009,
 * REQ-118, PVS-ARC-008).
 *
 * These tests prove that the promised-row acceptance rejects each wrong
 * frame-presentation value — a missing, wrong, or extra presented Band
 * node, too few presented frames, or an animation that did not advance —
 * before it can produce passing evidence. They run in general CI
 * (`test:frame-presentation`) because they exercise pure validation logic
 * with injected values and require no promised workstation; the promised
 * workstation command (`check:support-row`) is the only command that
 * launches the system Chromium and observes the real frame presentation,
 * and it never runs in the GitHub-hosted workflow.
 */
import { describe, expect, it } from 'vitest'
import type { FramePresentationRecord } from '../src/browser/presentation'
import {
  REQUIRED_MIN_PRESENTED_FRAMES,
  validateFramePresentationEvidenceRecord,
} from './frame-presentation-record'

/** The two authored Band-node names of the committed startup asset. */
const AUTHORED_BAND_NODES: readonly string[] = ['poc-player-character', 'poc-companion']

/** A valid frame-presentation record matching the authored nodes. */
const VALID_RECORD: FramePresentationRecord = Object.freeze({
  presentedNodes: Object.freeze(['poc-player-character', 'poc-companion']),
  presentedFrames: REQUIRED_MIN_PRESENTED_FRAMES,
  animationTime: 1.0,
})

describe('frame-presentation evidence record validation (ARCH-008, REQ-118)', () => {
  it('accepts a record that presented the two authored Band nodes, presented repeatedly, and advanced the animation', () => {
    expect(validateFramePresentationEvidenceRecord(VALID_RECORD, AUTHORED_BAND_NODES)).toEqual([])
  })

  it('rejects a record that presented no Band node', () => {
    const rejections = validateFramePresentationEvidenceRecord(
      { ...VALID_RECORD, presentedNodes: [] },
      AUTHORED_BAND_NODES,
    )
    expect(rejections.join('\n')).toMatch(/do not match the authored/)
  })

  it('rejects a record that presented only one of the two Band nodes', () => {
    const rejections = validateFramePresentationEvidenceRecord(
      { ...VALID_RECORD, presentedNodes: ['poc-player-character'] },
      AUTHORED_BAND_NODES,
    )
    expect(rejections.join('\n')).toMatch(/do not match the authored/)
  })

  it('rejects a record that presented a wrong or extra node', () => {
    const wrong = validateFramePresentationEvidenceRecord(
      { ...VALID_RECORD, presentedNodes: ['poc-player-character', 'poc-enemy-agent'] },
      AUTHORED_BAND_NODES,
    )
    expect(wrong.join('\n')).toMatch(/do not match the authored/)

    const extra = validateFramePresentationEvidenceRecord(
      {
        ...VALID_RECORD,
        presentedNodes: ['poc-player-character', 'poc-companion', 'poc-troop-1'],
      },
      AUTHORED_BAND_NODES,
    )
    expect(extra.join('\n')).toMatch(/do not match the authored/)
  })

  it('rejects a record with too few presented frames', () => {
    const rejections = validateFramePresentationEvidenceRecord(
      { ...VALID_RECORD, presentedFrames: REQUIRED_MIN_PRESENTED_FRAMES - 1 },
      AUTHORED_BAND_NODES,
    )
    expect(rejections.join('\n')).toMatch(/presented \d+ frame\(s\)/)
  })

  it('rejects a record whose animation did not advance', () => {
    const rejections = validateFramePresentationEvidenceRecord(
      { ...VALID_RECORD, animationTime: 0 },
      AUTHORED_BAND_NODES,
    )
    expect(rejections.join('\n')).toMatch(/animation did not advance/)
  })
})
