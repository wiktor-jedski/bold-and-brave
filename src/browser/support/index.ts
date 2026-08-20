/**
 * The Browser Deployment support-promise module (ARCH-024).
 *
 * This entry is the module's public surface: the one deeply frozen authored
 * support-promise record and its types. The product surface and the
 * promised-row acceptance checks share this read-only record (REQ-012,
 * REQ-013, REQ-015); no other support promise is authored anywhere in the
 * product (REQ-012, PVS-SCP-007).
 */
export { SUPPORT_PROMISE } from './catalog'
export type { SupportPromise, SupportPromiseRow, SupportPromiseViewport } from './interface'
