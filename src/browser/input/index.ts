/**
 * The browser Input Adapter module (ARCH-007, ARCH-002, ARCH-006, ARCH-008,
 * ARCH-009, REQ-018, REQ-019, REQ-119).
 *
 * This entry is the module's public surface: the `createInputAdapter` factory
 * and its interface types. The implementation stays private so the external
 * seam remains deep, mirroring the core-owned Simulation module (ARCH-002) and
 * Browser Runtime module (ARCH-006).
 */
export { CAMERA_ROTATION_SPEED, CAMERA_ZOOM_SPEED, createInputAdapter } from './implementation'
export type { InputAdapter, InputAdapterOptions } from './interface'
