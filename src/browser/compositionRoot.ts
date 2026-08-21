/**
 * The browser composition root (ARCH-024).
 *
 * This module is the only production creation site for the core-owned
 * `Simulation` (ARCH-001, REQ-111). It builds the Simulation through the
 * public core-owned interface (ARCH-002) and reads the immutable initial
 * projection. The browser receives the public Simulation seam whose only
 * state-changing operation is the single fixed-tick `advanceTick`
 * (REQ-113); no scenario-only state mutator and no direct gameplay state
 * access exist (REQ-121).
 *
 * The composition root also creates the Browser Runtime (ARCH-006) bound to
 * that same single Simulation and to a `requestAnimationFrame`-style frame
 * scheduler. Production uses the `window.requestAnimationFrame` scheduler
 * (ARCH-024); tests inject a controlled scheduler. Startup starts the one
 * runtime frame loop (ARCH-008); no second Simulation, timing loop, or
 * gameplay state exists (REQ-113).
 *
 * The composition root also wires the Phase 6 startup sequence (ARCH-023):
 * `runApplicationStartup` runs the ordered capability gate — secure
 * context, `navigator.gpu` presence, physical adapter, and core-only device
 * request (REQ-014, REQ-134, REQ-135) — and then the Three.js WebGPU
 * backend gate, which creates the `WebGPURenderer` with the exact device
 * the capability gate selects, waits for initialization, and accepts the
 * renderer only when its backend identifies itself as WebGPU (REQ-011,
 * REQ-134, REQ-135). The delivery-state surface stays at `Startup` while
 * the checks run, shows one specific semantic `Unsupported` alert for the
 * first failed check, and enters `Loading Scene` only after every check
 * passes (REQ-134, PVS-WEB-001). Startup starts the one Browser Runtime
 * and invokes the Scene-loading handoff only on success; a failure starts
 * neither and cannot run a later gate. The production handoff then loads
 * the startup Scene with the initialized renderer through the authored
 * startup manifest (ARCH-022, REQ-136): the product visibly reports
 * download, decode, GPU upload, and Scene readiness, writes the structured
 * Scene-load console diagnostics with the Scene and asset identifiers
 * (REQ-137, PVS-WEB-004), binds the Three.js frame presenter into the
 * runtime's presenter slot, and enters `Ready`. The first failed load
 * stage enters `Load failed` with the readable error and one semantic
 * Retry action and starts no automatic retry; one explicit Retry restarts
 * the load from its first stage with the same initialized renderer
 * (REQ-134, PVS-WEB-001).
 * From then on the one frame loop reads the current immutable projection
 * after each fixed-tick batch and presents it once with the interpolation
 * timing (ARCH-008, ARCH-012, REQ-118); the presenter owns only Three.js
 * objects, load state, and interpolation history and has no write path to
 * the Simulation (PVS-ARC-008).
 * This wiring keeps the Three.js WebGPU renderer in the production bundle,
 * so the built product carries the WebGPU-only rendering dependency and no
 * WebGL fallback path (REQ-011, PVS-SCP-006).
 *
 * Browser bootstrap dependencies point toward the ports the core owns; the
 * composition root imports no private Simulation implementation file.
 */
import { APPLICATION_NAME } from '../core'
import { createSimulation } from '../core/simulation'
import type { Simulation, SimulationProjection } from '../core/simulation'
import { createBrowserRuntime } from './runtime'
import type { BrowserRuntime, FrameScheduler } from './runtime'
import { runStartupGate } from './startup'
import type { StartupCapabilityEnvironment } from './startup'
import { buildStartupRecord, productionStartupRecorder } from './startup/record'
import type { StartupRecorder } from './startup/record'
import { createSceneLoadingHandoff } from './startup/surface'
import type { DeliveryStateSurface, SceneLoadingHandoff } from './startup/surface'
import { runWebGPUBackendGate } from './presentation'
import type { WebGPURendererFactory } from './presentation'

/** The production scheduler bound to `window.requestAnimationFrame` (ARCH-024). */
const productionFrameScheduler: FrameScheduler = {
  requestFrame(callback) {
    return window.requestAnimationFrame(callback)
  },
  cancelFrame(handle) {
    window.cancelAnimationFrame(handle)
  },
}

/** The composed browser application surface. */
export interface BrowserApplication {
  /** The application name presented by the browser surface. */
  readonly name: string
  /** The authoritative Simulation created at startup (ARCH-001). */
  readonly simulation: Simulation
  /** The immutable initial projection read at startup (ARCH-003). */
  readonly initialProjection: SimulationProjection
  /**
   * The Browser Runtime timing loop bound to `simulation` (ARCH-006).
   *
   * Startup starts the loop only after every gate passes; tests drive it
   * through an injected controlled scheduler. Only the loop lifecycle is
   * exposed — nothing more.
   */
  readonly runtime: BrowserRuntime
}

/**
 * The injectable startup collaborators of the Phase 6 sequence (ARCH-009,
 * ARCH-023, ARCH-024).
 *
 * Each collaborator has a production default so `main.ts` runs the full
 * ordered sequence with the real capability environment, the real Three.js
 * renderer factory, and the real Scene-loading handoff; integration tests
 * inject recording collaborators to prove the ordered success trace and
 * each first-failing-operation stop (REQ-134, PVS-WEB-001).
 */
export interface StartupDependencies {
  /**
   * The capability environment of the ordered startup gate (ARCH-023).
   *
   * Production reads `window.isSecureContext` and `navigator.gpu`;
   * integration tests inject a recording environment.
   */
  readonly environment?: StartupCapabilityEnvironment
  /**
   * The renderer factory of the Three.js WebGPU backend gate (ARCH-009).
   *
   * Production creates the real `WebGPURenderer` with the capability gate's
   * exact device; integration tests inject a recording factory.
   */
  readonly factory?: WebGPURendererFactory
  /**
   * The Scene-loading handoff invoked only after every gate passes
   * (REQ-134, PVS-WEB-001).
   *
   * Production enters the `Loading Scene` delivery state with the
   * initialized renderer; integration tests inject a recording handoff to
   * prove a failure invokes no handoff.
   */
  readonly handoff?: SceneLoadingHandoff
  /**
   * The recorder of the machine-readable startup record (ARCH-023,
   * REQ-134).
   *
   * Production publishes the record on the browser global object after
   * every gate passes; integration tests inject a recording recorder to
   * prove the exact published content and that a failed startup publishes
   * nothing.
   */
  readonly recorder?: StartupRecorder
}

/**
 * Compose the browser application.
 *
 * `create` is injectable so the integration test can observe the real
 * core-owned factory call; production always uses the default factory, so
 * this function remains the only production creation site for `Simulation`.
 *
 * `scheduler` is injectable so the integration test can drive the one
 * runtime frame loop with controlled timestamps; production always uses the
 * default `window.requestAnimationFrame` scheduler (ARCH-024).
 */
export function createBrowserApplication(
  create: () => Simulation = createSimulation,
  scheduler: FrameScheduler = productionFrameScheduler,
): BrowserApplication {
  const simulation = create()
  const runtime = createBrowserRuntime(simulation, scheduler)

  return {
    name: APPLICATION_NAME,
    simulation,
    initialProjection: simulation.readProjection(),
    runtime,
  }
}

/**
 * Run the ordered Phase 6 startup sequence (ARCH-023, REQ-011, REQ-014,
 * REQ-134, REQ-135, PVS-WEB-001).
 *
 * The delivery-state surface stays at `Startup` while the checks run. The
 * capability gate checks, in order, the secure context, the presence of
 * `navigator.gpu`, a physical WebGPU adapter, and one usable core-only
 * device. The Three.js WebGPU backend gate then creates the renderer with
 * the exact selected device, waits for initialization, and accepts the
 * renderer only when its backend identifies itself as WebGPU. Each failed
 * check shows one specific semantic `Unsupported` alert with its exact
 * readable message, leaves the Browser Runtime stopped, invokes no
 * Scene-loading handoff, and runs no later gate (REQ-134, PVS-WEB-001).
 * Only after every check passes does startup start the one Browser Runtime
 * frame loop and invoke the Scene-loading handoff with the initialized
 * renderer, entering the `Loading Scene` delivery state (ARCH-006,
 * ARCH-008, REQ-134).
 */
export async function runApplicationStartup(
  application: BrowserApplication,
  surface: DeliveryStateSurface,
  dependencies: StartupDependencies = {},
): Promise<void> {
  // Keep the delivery state at `Startup` while the checks run (REQ-134,
  // PVS-WEB-001).
  surface.showStartup()

  // 1. The ordered capability gate: secure context, WebGPU presence,
  //    physical adapter, and core-only device (REQ-014, REQ-134, REQ-135).
  const capability = await runStartupGate(dependencies.environment)
  if (!capability.ok) {
    surface.showUnsupported(capability.message)
    return
  }

  // 2. The Three.js WebGPU backend gate with the exact selected device
  //    (REQ-011, REQ-134, REQ-135). A failure here runs after the
  //    capability gate but still starts neither the runtime nor the
  //    Scene-loading handoff.
  const backend = await runWebGPUBackendGate(capability.device, dependencies.factory)
  if (!backend.ok) {
    surface.showUnsupported(backend.message)
    return
  }

  // Every gate passed: publish the machine-readable startup record — the
  // product reports the ordered secure-context, physical-adapter,
  // core-device, and Three.js WebGPU-backend successes — then start the
  // one Browser Runtime frame loop and invoke the Scene-loading handoff
  // with the initialized renderer (REQ-134, PVS-WEB-001). A failed gate
  // above started neither, ran no later gate, and published no record.
  const recorder = dependencies.recorder ?? productionStartupRecorder
  recorder.record(buildStartupRecord(capability, backend))

  application.runtime.start()
  // The production handoff binds the Three.js frame presenter into the
  // runtime's presenter slot after the startup Scene load passes, so the
  // one frame loop presents the current read-only Simulation output with
  // the interpolation timing (ARCH-008, REQ-118).
  const handoff = dependencies.handoff ?? createSceneLoadingHandoff(surface, application.runtime.presenterSlot)
  handoff(backend.renderer)
}
