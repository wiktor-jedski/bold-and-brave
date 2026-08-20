/**
 * Read-only Browser Deployment types of the support promise (ARCH-024,
 * REQ-012, REQ-013, REQ-015).
 *
 * The module authors exactly one support-promise row — the only support
 * promise in the product. The product surface and the promised-row
 * acceptance checks share this read-only record instead of re-authoring
 * its values (REQ-012). Every field carries a literal type so the authored
 * promise cannot drift from its declared contract at compile time.
 */

/**
 * The CSS-pixel viewport promised for promised-row acceptance testing
 * (REQ-013, PVS-SCP-008).
 */
export interface SupportPromiseViewport {
  /** The viewport width in CSS pixels. */
  readonly width: 1920
  /** The viewport height in CSS pixels. */
  readonly height: 1080
  /** The unit of `width` and `height`. */
  readonly unit: 'CSS px'
}

/**
 * One authored support-promise row (ARCH-024).
 *
 * The row promises exactly the browser, operating-system architecture,
 * GPU, driver, viewport, maximum device-pixel ratio, and combined input
 * mode of the Playable Vertical Slice (REQ-012, REQ-013, REQ-015). It
 * contains no Linux distribution version: the promise covers Linux x64
 * without naming a distribution (PVS-SCP-007).
 */
export interface SupportPromiseRow {
  /** The promised browser name. */
  readonly browser: 'Chromium'
  /** The exact promised Chromium version (REQ-012). */
  readonly browserVersion: '151.0.7922.137'
  /** The promised operating-system architecture, without a distribution version. */
  readonly platform: 'Linux x64'
  /** The promised GPU. */
  readonly gpu: 'NVIDIA RTX 2070 SUPER'
  /** The promised GPU driver version. */
  readonly driver: '610.57.04'
  /** The promised CSS-pixel viewport (REQ-013). */
  readonly viewport: SupportPromiseViewport
  /** The maximum promised device-pixel ratio (REQ-013). */
  readonly maxDevicePixelRatio: 1.0
  /** The one combined normal keyboard-and-mouse input mode (REQ-015, PVS-SCP-010). */
  readonly inputMode: 'keyboard and mouse'
}

/**
 * The support promise: the single authored set of promised support rows
 * (ARCH-024, REQ-012).
 *
 * The record owns exactly one row — the only authored support row in the
 * product. No alternate browser, input mode, GPU, or driver is promised
 * (REQ-015).
 */
export interface SupportPromise {
  /** Exactly one promised support row. */
  readonly rows: readonly SupportPromiseRow[]
}
