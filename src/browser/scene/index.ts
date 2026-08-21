/**
 * The Scene Transition and Loading Collaboration module (ARCH-022,
 * ARCH-009, ARCH-010, ARCH-016, ARCH-023).
 *
 * This entry is the module's public surface: the startup Scene loader with
 * its production dependencies, the load progress and result types, the
 * structured Scene-load console diagnostics (REQ-137, PVS-WEB-004), and
 * the machine-readable Scene-load record. The implementation stays private
 * so the external seam remains deep, mirroring the Browser Runtime
 * (ARCH-006) and the startup gates (ARCH-023): the Scene-loading handoff
 * runs the loader with the initialized WebGPU renderer and the authored
 * startup manifest after every startup gate passes (REQ-136, PVS-WEB-003),
 * stops at the first failed stage with the readable error and the one
 * Retry action, and restarts the load from its first stage on one explicit
 * Retry with the same renderer (REQ-134, PVS-WEB-001).
 */
export { loadStartupScene, productionSceneLoadDependencies } from './implementation'
export {
  buildSceneLoadRecord,
  productionSceneLoadRecorder,
  SCENE_LOAD_READY_STATE,
} from './record'
export type { SceneLoadRecorder, SceneLoadRecord } from './record'
export {
  createSceneLoadDiagnostics,
  productionSceneLoadConsole,
  readableSceneLoadError,
} from './diagnostics'
export type {
  SceneLoadConsole,
  SceneLoadDiagnosticEvent,
  SceneLoadDiagnosticEventType,
  SceneLoadDiagnostics,
} from './diagnostics'
export { SCENE_LOAD_STAGE_LABELS } from './interface'
export type {
  SceneAnimationClip,
  SceneAnimationMixer,
  SceneCamera,
  SceneGltfLoader,
  SceneGltfResult,
  SceneGraph,
  SceneLoadDependencies,
  SceneLoadProgress,
  SceneLoadReporter,
  SceneLoadStage,
  SceneLoadSuccess,
  SceneObject3D,
  ScenePresentation,
} from './interface'
