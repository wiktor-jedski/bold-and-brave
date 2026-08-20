/**
 * Implementation of the Three.js WebGPU backend gate (ARCH-009, ARCH-023,
 * ARCH-024, REQ-011, REQ-134, REQ-135).
 *
 * The gate creates the Three.js `WebGPURenderer` with the exact device
 * selected by the capability gate (REQ-135), waits for initialization, and
 * accepts the renderer only when its initialized backend identifies itself
 * as WebGPU. Three.js can silently select its WebGL2 fallback backend when
 * the WebGPU backend cannot initialize; the gate detects that backend and
 * rejects it before gameplay, so no WebGL fallback path exists (REQ-011,
 * PVS-WEB-001, PVS-SCP-006).
 *
 * A rejected renderer is disposed before the gate returns, and the gate
 * never renders a frame or loads a Scene: those operations belong to the
 * `Loading Scene` and later delivery states (REQ-134).
 */
import { WebGPURenderer } from 'three/webgpu'
import type {
  PresentationRenderer,
  PresentationResult,
  PresentationUnsupported,
  WebGPURendererFactory,
} from './interface'

/**
 * The production renderer factory creating the Three.js WebGPU renderer
 * (ARCH-009).
 *
 * The renderer receives the capability gate's exact device through the
 * constructor parameter, so `WebGPUBackend.init` uses that device instead
 * of requesting another adapter or device (REQ-135, PVS-WEB-002). The cast
 * narrows the renderer to the gate's structural surface: Three.js types
 * the `backend` property as the abstract `Backend` base, which does not
 * declare the identity flags its concrete WebGPU backend reports at
 * runtime.
 */
const productionRendererFactory: WebGPURendererFactory = {
  create(device: GPUDevice): PresentationRenderer {
    return new WebGPURenderer({ device }) as unknown as PresentationRenderer
  },
}

/** Build one typed, readable `Unsupported` result (REQ-134, PVS-WEB-001). */
function unsupported(message: string): PresentationUnsupported {
  return Object.freeze({ ok: false, code: 'webgpu-backend', message })
}

/**
 * Run the Three.js WebGPU backend gate (ARCH-023, REQ-011, REQ-134,
 * REQ-135).
 *
 * Production creates `new WebGPURenderer({ device })` with the exact device
 * selected by the capability gate; tests inject a recording factory. The
 * gate waits for initialization before it inspects the backend, and accepts
 * the renderer only when the initialized backend identifies itself as
 * WebGPU. An initialization failure or a non-WebGPU backend disposes the
 * rejected renderer and returns the governed readable WebGPU-backend
 * `Unsupported` result; no render or Scene-loading operation runs
 * (PVS-WEB-001, PVS-SCP-006).
 */
export async function runWebGPUBackendGate(
  device: GPUDevice,
  factory: WebGPURendererFactory = productionRendererFactory,
): Promise<PresentationResult> {
  // Create the renderer with the exact device selected by the capability
  // gate (REQ-135, PVS-WEB-002).
  const renderer = factory.create(device)

  // Wait for initialization before inspecting the backend (REQ-011,
  // PVS-WEB-001).
  try {
    await renderer.init()
  } catch {
    renderer.dispose()
    return unsupported(
      'The Three.js renderer could not be initialized on the selected WebGPU device.',
    )
  }

  // Accept the renderer only when its initialized backend identifies
  // itself as WebGPU; a Three.js WebGL fallback is rejected before
  // gameplay and leaves no fallback path (REQ-011, PVS-WEB-001).
  if (renderer.backend.isWebGPUBackend !== true) {
    renderer.dispose()
    return unsupported(
      'The Three.js renderer selected a non-WebGPU backend; WebGL fallback is rejected.',
    )
  }

  return Object.freeze({ ok: true, renderer })
}
