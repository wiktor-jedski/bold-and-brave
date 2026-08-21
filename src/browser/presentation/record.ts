/**
 * Machine-readable frame-presentation evidence of the rendered frame loop
 * (ARCH-008, ARCH-009, ARCH-024, REQ-118, PVS-ARC-008).
 *
 * The promised-row acceptance reads the presentation-only facts of the
 * rendered frame loop from the built product: the product exposes a
 * getter that returns the presenter's current `FramePresentationRecord` —
 * the presented Band-member node names, the presented-frame count, and
 * the animation time — so the headed run proves that the two projected
 * initial Band members are rendered through Three.js WebGPU and that the
 * authored animation advances from the current projection tick and
 * interpolation value on the existing frame loop.
 *
 * The record is plain, deeply frozen data — only presentation state, no
 * projection, resource value, combat result, relationship result, fate
 * result, or outcome — so it serializes directly to JSON (REQ-118).
 */
import type { FramePresentationRecord, ScenePresenter } from './interface'

declare global {
  interface Window {
    /**
     * Read the presentation-only facts of the last presented frame of the
     * built product (ARCH-008, REQ-118).
     *
     * The promised-row acceptance calls this getter to prove that the two
     * projected initial Band members are rendered through Three.js WebGPU
     * and that the authored animation advances from the current projection
     * tick and interpolation value on the existing frame loop.
     */
    __boldAndBraveFramePresentation?: () => FramePresentationRecord
  }
}

/**
 * The production publisher wiring the frame-presentation getter on the
 * browser global object (ARCH-024).
 *
 * The Scene-loading handoff calls `publish` after the real load passes,
 * binding the getter to the presenter the runtime now drives. Outside a
 * browser document (unit tests run in Node) there is no product surface to
 * wire, so the publisher publishes nothing; the promised-row acceptance
 * always reads the built product in a real browser, where the global
 * object exists.
 */
export const productionFramePresentationPublisher: {
  /** Bind the frame-presentation getter to `presenter`. */
  publish(presenter: ScenePresenter): void
} = {
  publish(presenter: ScenePresenter): void {
    if (typeof window === 'undefined') {
      return
    }
    window.__boldAndBraveFramePresentation = (): FramePresentationRecord =>
      presenter.readFramePresentation()
  },
}
