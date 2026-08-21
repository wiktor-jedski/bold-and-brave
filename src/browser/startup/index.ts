/**
 * The Browser Delivery State capability gate module (ARCH-023, ARCH-024).
 *
 * This entry is the module's public surface: the ordered startup gate
 * `runStartupGate` and its result and environment types. The implementation
 * stays private so the external seam remains deep, mirroring the Browser
 * Runtime module (ARCH-006): the composition root runs the gate with the
 * production capability environment, and the Three.js backend check
 * consumes the selected adapter, device, and immutable inspection record
 * (REQ-135).
 */
export { runStartupGate } from './implementation'
export { buildStartupRecord, productionStartupRecorder, STARTUP_GATE_ORDER } from './record'
export type { StartupRecord, StartupRecorder } from './record'
export type {
  StartupCapabilityEnvironment,
  StartupInspectionRecord,
  StartupResult,
  StartupSuccess,
  StartupUnsupported,
  StartupUnsupportedCode,
} from './interface'
