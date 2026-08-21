/**
 * The Three.js Presentation Adapter module (ARCH-009, ARCH-023, ARCH-024).
 *
 * This entry is the module's public surface: the `runWebGPUBackendGate`
 * backend gate with its result, renderer, and factory types, and the
 * Three.js frame presenter that renders read-only Simulation output
 * through WebGPU on the one Browser Runtime frame loop (ARCH-008,
 * REQ-118). The implementations stay private so the external seams remain
 * deep, mirroring the Browser Runtime module (ARCH-006) and the startup
 * capability gate (ARCH-023): startup runs the backend gate with the exact
 * device selected by the capability gate, and the gate returns one typed,
 * readable `Unsupported` result or the initialized WebGPU renderer
 * (REQ-011, REQ-134, REQ-135); after the startup Scene load passes, the
 * Scene-loading handoff binds the frame presenter into the runtime's
 * presenter slot (ARCH-022, ARCH-008).
 */
export { runWebGPUBackendGate } from './implementation'
export { createScenePresenter } from './presenter'
export type {
  PresentedAnimationMixer,
  PresentedCamera,
  PresentedNode,
  PresentedRenderer,
  PresentedScene,
  ScenePresenterHandle,
} from './presenter'
export { productionFramePresentationPublisher } from './record'
export type {
  FramePresentationRecord,
  PresentationRenderer,
  PresentationRendererBackend,
  PresentationResult,
  PresentationSuccess,
  PresentationUnsupported,
  PresentationUnsupportedCode,
  ScenePresenter,
  WebGPURendererFactory,
} from './interface'
