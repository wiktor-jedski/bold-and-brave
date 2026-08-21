/**
 * The read-only device-loss observation of the terminal `Device lost`
 * state (ARCH-023, ARCH-024, REQ-134, REQ-138, PVS-WEB-005).
 *
 * The device-loss coordinator publishes one observation getter for the
 * promised-row acceptance: it carries the complete immutable projection
 * captured at the moment of loss and the current complete projection read
 * at query time — the current pre-Reload projection. Both projections come
 * from the public read-only `readProjection` seam of the core-owned
 * Simulation interface (ARCH-002), so the observation exposes no GPUDevice
 * and no state-changing command: the acceptance can observe the advancing
 * tick before loss, the exact loss tick, and the unchanged projection
 * after loss without any device or write access (REQ-138, PVS-WEB-005).
 *
 * The observation is plain, deeply frozen data — no runtime object, DOM
 * node, or device enters it — so it serializes directly to JSON.
 */
import type { SimulationProjection } from '../../core/simulation'

/**
 * The read-only device-loss observation the product publishes (ARCH-024,
 * REQ-138, PVS-WEB-005).
 *
 * Before any loss the `lossProjection` is `null` and the
 * `currentProjection` is the live complete projection, so the acceptance
 * observes the Simulation tick advancing through the complete projection.
 * After a resolved `GPUDevice.lost` the coordinator captures the complete
 * projection at loss; the runtime terminal-stop keeps every later
 * `currentProjection` read equal to the projection at loss, so the
 * acceptance samples the same complete projection until Reload.
 */
export interface DeviceLossObservation {
  /**
   * The complete projection captured at the moment of loss, or `null`
   * before any loss resolved (REQ-138).
   */
  readonly lossProjection: SimulationProjection | null
  /**
   * The complete projection read at query time: the current pre-Reload
   * projection (REQ-138, PVS-WEB-005).
   */
  readonly currentProjection: SimulationProjection
}

declare global {
  interface Window {
    /**
     * Read the device-loss observation of the built product (ARCH-024,
     * REQ-138, PVS-WEB-005).
     *
     * The promised-row acceptance calls this getter to observe the
     * complete projection advancing before it destroys the exact
     * production-selected device, and to prove that every sampled
     * complete projection after the loss equals the projection at loss.
     */
    __boldAndBraveDeviceLossObservation?: () => DeviceLossObservation
  }
}

/**
 * The production publisher wiring the device-loss observation getter on
 * the browser global object (ARCH-024).
 *
 * The device-loss coordinator calls `publish` as soon as it is wired —
 * before the Browser Runtime or the Scene-loading handoff starts — so the
 * acceptance can observe the complete projection from `Ready` onward.
 * Outside a browser document (unit tests run in Node) there is no product
 * surface to wire, so the publisher publishes nothing; the promised-row
 * acceptance always reads the built product in a real browser, where the
 * global object exists.
 */
export const productionDeviceLossObservationPublisher: {
  /** Bind the device-loss observation getter on the browser global object. */
  publish(getObservation: () => DeviceLossObservation): void
} = {
  publish(getObservation: () => DeviceLossObservation): void {
    if (typeof window === 'undefined') {
      return
    }
    window.__boldAndBraveDeviceLossObservation = getObservation
  },
}
