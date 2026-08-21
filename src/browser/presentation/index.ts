/**
 * The Three.js Presentation Adapter WebGPU backend gate module (ARCH-009,
 * ARCH-023, ARCH-024).
 *
 * This entry is the module's public surface: the `runWebGPUBackendGate`
 * backend gate and its result, renderer, and factory types. The
 * implementation stays private so the external seam remains deep, mirroring
 * the Browser Runtime module (ARCH-006) and the startup capability gate
 * (ARCH-023): startup runs the backend gate with the exact device selected
 * by the capability gate, and the gate returns one typed, readable
 * `Unsupported` result or the initialized WebGPU renderer (REQ-011,
 * REQ-134, REQ-135).
 */
export { runWebGPUBackendGate } from './implementation'
export type {
  PresentationRenderer,
  PresentationRendererBackend,
  PresentationResult,
  PresentationSuccess,
  PresentationUnsupported,
  PresentationUnsupportedCode,
  WebGPURendererFactory,
} from './interface'
