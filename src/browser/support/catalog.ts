import type { SupportPromise } from './interface'

/**
 * The one authored support promise (ARCH-024, REQ-012, REQ-013, REQ-015).
 *
 * This record is the only authored support row in the product: the promised
 * browser, operating-system architecture, GPU, driver, viewport, maximum
 * device-pixel ratio, and combined keyboard-and-mouse input mode exist in
 * exactly one place. The product surface and the promised-row acceptance
 * checks read this record instead of re-authoring its values (REQ-012). The
 * record is deeply frozen at every level, so the authored promise is
 * immutable at runtime and callers receive only read-only Browser
 * Deployment data (ARCH-024). The row names no Linux distribution version
 * (PVS-SCP-007) and promises no alternate browser, input mode, GPU, or
 * driver (REQ-015, PVS-SCP-010).
 */
export const SUPPORT_PROMISE: SupportPromise = Object.freeze({
  rows: Object.freeze([
    Object.freeze({
      browser: 'Chromium',
      browserVersion: '151.0.7922.137',
      platform: 'Linux x64',
      gpu: 'NVIDIA RTX 2070 SUPER',
      driver: '610.57.04',
      viewport: Object.freeze({
        width: 1920,
        height: 1080,
        unit: 'CSS px',
      }),
      maxDevicePixelRatio: 1.0,
      inputMode: 'keyboard and mouse',
    }),
  ]),
})
