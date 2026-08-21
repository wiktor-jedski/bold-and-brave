/**
 * The startup delivery-state surface (ARCH-010, ARCH-023, ARCH-024,
 * REQ-134, REQ-136, PVS-WEB-001, PVS-WEB-003).
 *
 * This module presents the governed Browser Delivery State through semantic
 * DOM: the state element stays at `Startup` while the ordered startup
 * checks run, shows one specific semantic `Unsupported` alert for the first
 * failed check, enters `Loading Scene` only after every check passes, and
 * reports the ordered Scene-load stages — download, decode, GPU upload,
 * and Scene readiness — before entering `Ready` after the real load passes
 * (REQ-136, PVS-WEB-003). The state text, the progress stages, and the
 * alert text are the only product statements about the delivery state; the
 * startup orchestration drives them through the `DeliveryStateSurface`
 * seam, so tests can inject a recording surface and the built product
 * observes the same transitions.
 *
 * The module also owns the production Scene-loading handoff seam
 * (REQ-134, PVS-WEB-001, REQ-136): the composition root invokes the
 * handoff with the initialized WebGPU renderer only after every startup
 * gate passes. The handoff enters `Loading Scene`, runs the real startup
 * Scene load through the Scene loader (ARCH-022) with the authored startup
 * manifest from the core catalog (ARCH-016), adds the renderer canvas to
 * the existing product surface, publishes the machine-readable Scene-load
 * record, and enters `Ready`. A failed gate invokes no handoff, so no
 * asset loading can follow a failure (REQ-134, PVS-WEB-001).
 */
import { STARTUP_SCENE } from '../../core/content'
import { loadStartupScene, productionSceneLoadDependencies, SCENE_LOAD_STAGE_LABELS } from '../scene'
import type { SceneLoadDependencies, SceneLoadProgress, SceneLoadReporter } from '../scene'
import { buildSceneLoadRecord, productionSceneLoadRecorder, SCENE_LOAD_READY_STATE } from '../scene/record'
import type { SceneLoadRecorder } from '../scene/record'
import { createScenePresenter, productionFramePresentationPublisher } from '../presentation'
import type { PresentationRenderer } from '../presentation'
import type { PresenterSlot } from '../runtime'

/**
 * The delivery-state presentation driven by startup (REQ-134, PVS-WEB-001,
 * PVS-WEB-003).
 *
 * The surface is the only DOM seam of the ordered Browser Delivery State:
 * it shows `Startup` while checks run, shows one specific semantic
 * `Unsupported` alert for the first failed check, shows `Loading Scene`
 * only after every check passes, visibly reports the ordered download,
 * decode, GPU-upload, and Scene-readiness stages, and enters `Ready` only
 * after the real load passes. Production binds these transitions to real
 * semantic DOM; tests inject a recording surface to prove the exact ordered
 * state trace.
 */
export interface DeliveryStateSurface {
  /** Keep the delivery state at `Startup` while the checks run (REQ-134). */
  showStartup(): void
  /**
   * Show one specific semantic `Unsupported` alert for the first failed
   * check, with the exact readable message of that check (REQ-134,
   * PVS-WEB-001).
   */
  showUnsupported(message: string): void
  /** Enter `Loading Scene` only after every check passes (REQ-134, PVS-WEB-001). */
  showLoadingScene(): void
  /**
   * Visibly report one ordered Scene-load progress stage (REQ-136,
   * PVS-WEB-003).
   *
   * The surface accumulates the stage labels so the product visibly
   * reports download, decode, GPU upload, and Scene readiness in order
   * while the delivery state stays at `Loading Scene`.
   */
  showProgress(progress: SceneLoadProgress): void
  /**
   * Enter `Ready` only after the real load passes (REQ-136, PVS-WEB-001).
   */
  showReady(): void
  /**
   * Add the renderer canvas to the existing product surface (ARCH-024).
   *
   * The canvas is the one WebGPU canvas of the product; no second renderer
   * or canvas exists.
   */
  mountCanvas(canvas: HTMLCanvasElement): void
}

/**
 * The Scene-loading handoff of the next delivery state (REQ-134,
 * PVS-WEB-001, REQ-136).
 *
 * Startup invokes the handoff with the initialized Three.js WebGPU renderer
 * only after every gate passes and never after a failure, so a failed gate
 * cannot run a later delivery operation. The production handoff enters
 * `Loading Scene`, runs the real startup Scene load, adds the renderer
 * canvas to the product surface, and enters `Ready`.
 */
export interface SceneLoadingHandoff {
  /** Begin the Scene load with the initialized renderer. */
  (renderer: PresentationRenderer): void
}

/**
 * Build the production Scene-loading handoff (REQ-134, PVS-WEB-001,
 * REQ-136, REQ-118).
 *
 * The production handoff enters the `Loading Scene` delivery state and runs
 * the real startup Scene load (ARCH-022): it reads the authored startup
 * manifest through the public core content catalog (ARCH-016), runs the
 * Scene loader with the initialized WebGPU renderer, visibly reports the
 * ordered download, decode, GPU-upload, and Scene-readiness stages, adds
 * the renderer canvas to the existing product surface, publishes the
 * machine-readable Scene-load record, binds the Three.js frame presenter
 * into the runtime's presenter slot — so the runtime presents the current
 * read-only Simulation output on the one frame loop (ARCH-008, REQ-118) —
 * and enters `Ready` after the real load passes. The load sets no
 * elapsed-time limit and owns no timer (REQ-136, PVS-WEB-003).
 * `dependencies` and `recorder` are injectable so tests drive the real
 * handoff with recording collaborators; production uses the real Scene-load
 * dependencies and the browser recorder.
 */
export function createSceneLoadingHandoff(
  surface: DeliveryStateSurface,
  presenterSlot: PresenterSlot,
  dependencies: SceneLoadDependencies = productionSceneLoadDependencies,
  recorder: SceneLoadRecorder = productionSceneLoadRecorder,
): SceneLoadingHandoff {
  return (renderer: PresentationRenderer): void => {
    // Enter the `Loading Scene` delivery state before any asset work
    // (REQ-134, PVS-WEB-001).
    surface.showLoadingScene()

    const reporter: SceneLoadReporter = {
      report(progress: SceneLoadProgress): void {
        surface.showProgress(progress)
      },
    }

    void loadStartupScene(renderer, STARTUP_SCENE, dependencies, reporter)
      .then((result) => {
        // Add the renderer canvas to the existing product surface
        // (ARCH-024): the one WebGPU canvas of the product.
        surface.mountCanvas(renderer.domElement)
        // Publish the machine-readable record only after the real load
        // passes (REQ-136).
        recorder.record(buildSceneLoadRecord(renderer, result))
        // Bind the Three.js frame presenter into the runtime's presenter
        // slot: from the next rendered frame the one Browser Runtime loop
        // reads the current immutable projection after each fixed-tick
        // batch and presents it once with the interpolation timing
        // (ARCH-008, ARCH-012, REQ-118). The presenter owns only Three.js
        // objects, load state, and interpolation history, and has no write
        // path to the Simulation (PVS-ARC-008).
        const presenter = createScenePresenter(result.presentation, renderer)
        presenterSlot.presenter = presenter
        // Expose the presentation-only facts of the frame loop for the
        // promised-row acceptance (ARCH-024, REQ-118).
        productionFramePresentationPublisher.publish(presenter)
        // Enter `Ready` only after the real load passes (REQ-136,
        // PVS-WEB-001).
        surface.showReady()
      })
      .catch((error: unknown) => {
        // The load-failure surface and Retry belong to the next phase
        // (REQ-137); until then a failed load is recorded on the console
        // instead of surfacing as an unhandled rejection.
        console.error('Scene load failed.', error)
      })
  }
}

/**
 * Render the delivery-state surface into `host` as semantic DOM (ARCH-010,
 * REQ-134, PVS-WEB-001, PVS-WEB-003).
 *
 * The surface adds one live status region that carries the exact delivery
 * state text (`Startup`, `Unsupported`, `Loading Scene`, or `Ready`), one
 * ordered progress list that visibly reports the download, decode,
 * GPU-upload, and Scene-readiness stages, and, on a failed check, one
 * semantic `alert` region containing the exact readable message of that
 * check. The surface also owns the mount point of the renderer canvas: the
 * product adds exactly one WebGPU canvas to the existing surface. The
 * application name and the single support table are owned by the startup
 * entry; this presentation adds no second Simulation, timing loop, or
 * gameplay state (REQ-113).
 */
export function renderDeliveryState(host: HTMLElement): DeliveryStateSurface {
  const state = document.createElement('div')
  state.id = 'delivery-state'
  state.setAttribute('role', 'status')
  state.textContent = 'Startup'
  host.append(state)

  let alert: HTMLElement | null = null
  let progress: HTMLElement | null = null
  const stageItems = new Map<string, HTMLLIElement>()

  return {
    showStartup(): void {
      state.textContent = 'Startup'
      if (alert !== null) {
        alert.remove()
        alert = null
      }
      if (progress !== null) {
        progress.remove()
        progress = null
        stageItems.clear()
      }
    },
    showUnsupported(message: string): void {
      state.textContent = 'Unsupported'
      if (alert === null) {
        alert = document.createElement('div')
        alert.setAttribute('role', 'alert')
        host.append(alert)
      }
      alert.textContent = message
    },
    showLoadingScene(): void {
      state.textContent = 'Loading Scene'
      if (alert !== null) {
        alert.remove()
        alert = null
      }
    },
    showProgress(report: SceneLoadProgress): void {
      // Keep the delivery state at `Loading Scene` while the ordered
      // stages run (REQ-134, PVS-WEB-003).
      state.textContent = 'Loading Scene'
      if (progress === null) {
        progress = document.createElement('ol')
        progress.id = 'scene-progress'
        host.append(progress)
      }
      const label = SCENE_LOAD_STAGE_LABELS[report.stage]
      let item = stageItems.get(report.stage)
      if (item === undefined) {
        item = document.createElement('li')
        progress.append(item)
        stageItems.set(report.stage, item)
      }
      item.textContent =
        report.stage === 'download' && report.totalBytes !== null
          ? `${label} ${report.receivedBytes} of ${report.totalBytes} bytes`
          : label
    },
    showReady(): void {
      state.textContent = SCENE_LOAD_READY_STATE
    },
    mountCanvas(canvas: HTMLCanvasElement): void {
      host.append(canvas)
    },
  }
}
