/**
 * The Browser Delivery State capability gate module (ARCH-023, ARCH-024).
 *
 * This entry is the module's public surface: the ordered startup gate
 * `runStartupGate` and its result and environment types, the
 * machine-readable startup record, and the device-loss coordinator of the
 * terminal `Device lost` state (REQ-134, REQ-138, PVS-WEB-005). The
 * implementations stay private so the external seams remain deep, mirroring
 * the Browser Runtime module (ARCH-006): the composition root runs the gate
 * with the production capability environment, the Three.js backend check
 * consumes the selected adapter, device, and immutable inspection record
 * (REQ-135), and the coordinator wires the exact device before the runtime
 * or Scene-loading handoff starts.
 */
export { runStartupGate } from './implementation'
export { buildStartupRecord, productionStartupRecorder, STARTUP_GATE_ORDER } from './record'
export type { StartupRecord, StartupRecorder } from './record'
export {
  createDeviceLossCoordinator,
  DEVICE_LOST_MESSAGE,
  productionDeviceReload,
} from './deviceLoss'
export type { DeviceLossCoordinator, DeviceLossOptions } from './deviceLoss'
export { productionDeviceLossObservationPublisher } from './deviceLossObservation'
export type { DeviceLossObservation } from './deviceLossObservation'
export type {
  StartupCapabilityEnvironment,
  StartupInspectionRecord,
  StartupResult,
  StartupSuccess,
  StartupUnsupported,
  StartupUnsupportedCode,
} from './interface'
