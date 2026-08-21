/**
 * The startup delivery-state surface (ARCH-010, ARCH-023, ARCH-024,
 * REQ-134, REQ-136, REQ-137, PVS-WEB-001, PVS-WEB-003, PVS-WEB-004).
 *
 * This module presents the governed Browser Delivery State through semantic
 * DOM: the state element stays at `Startup` while the ordered startup
 * checks run, shows one specific semantic `Unsupported` alert for the first
 * failed check, enters `Loading Scene` only after every check passes,
 * reports the ordered Scene-load stages — download, decode, GPU upload,
 * and Scene readiness — enters `Load failed` with the readable error and
 * one semantic Retry action at the first failed asset stage without an
 * automatic retry, and enters `Ready` after the real load passes (REQ-136,
 * PVS-WEB-003, REQ-134, PVS-WEB-001). The state text, the progress stages,
 * the alert text, and the Retry action are the only product statements
 * about the delivery state; the startup orchestration drives them through
 * the `DeliveryStateSurface` seam, so tests can inject a recording surface
 * and the built product observes the same transitions.
 *
 * The module also owns the production Scene-loading handoff seam
 * (REQ-134, PVS-WEB-001, REQ-136): the composition root invokes the
 * handoff with the initialized WebGPU renderer only after every startup
 * gate passes. The handoff enters `Loading Scene`, runs the real startup
 * Scene load through the Scene loader (ARCH-022) with the authored startup
 * manifest from the core catalog (ARCH-016), writes the structured
 * Scene-load console diagnostics with the Scene and asset identifiers
 * (REQ-137, PVS-WEB-004), adds the renderer canvas to the existing product
 * surface, publishes the machine-readable Scene-load record, and enters
 * `Ready`. A failed gate invokes no handoff, so no asset loading can follow
 * a failure (REQ-134, PVS-WEB-001). The first failed load stage enters
 * `Load failed` and shows the readable error and the one Retry action; one
 * explicit Retry restarts the load from its first stage with the same
 * initialized renderer, and no automatic retry starts.
 */
import { STARTUP_SCENE } from '../../core/content'
import {
  createSceneLoadDiagnostics,
  loadStartupScene,
  productionSceneLoadConsole,
  productionSceneLoadDependencies,
  readableSceneLoadError,
  SCENE_LOAD_STAGE_LABELS,
} from '../scene'
import type {
  SceneLoadConsole,
  SceneLoadDependencies,
  SceneLoadProgress,
  SceneLoadReporter,
} from '../scene'
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
   * Enter `Load failed` at the first failed asset stage (REQ-134,
   * PVS-WEB-001).
   *
   * The surface shows the readable error of the first failed stage and
   * one semantic Retry action, and starts no automatic retry. The `retry`
   * callback restarts the failed Scene load from its first stage with the
   * same initialized renderer, re-entering `Loading Scene`.
   */
  showLoadFailed(message: string, retry: () => void): void
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
 * REQ-136, REQ-137, REQ-118).
 *
 * The production handoff enters the `Loading Scene` delivery state and runs
 * the real startup Scene load (ARCH-022): it reads the authored startup
 * manifest through the public core content catalog (ARCH-016), runs the
 * Scene loader with the initialized WebGPU renderer, writes the structured
 * Scene-load console diagnostics with the Scene and asset identifiers
 * (REQ-137, PVS-WEB-004), visibly reports the ordered download, decode,
 * GPU-upload, and Scene-readiness stages, adds the renderer canvas to the
 * existing product surface, publishes the machine-readable Scene-load
 * record, binds the Three.js frame presenter into the runtime's presenter
 * slot — so the runtime presents the current read-only Simulation output
 * on the one frame loop (ARCH-008, REQ-118) — and enters `Ready` after the
 * real load passes. The load sets no elapsed-time limit and owns no timer
 * (REQ-136, PVS-WEB-003).
 *
 * The first failed stage enters `Load failed`, runs no later stage, shows
 * the readable error and one semantic Retry action, and starts no
 * automatic retry (REQ-134, PVS-WEB-001). One explicit Retry restarts the
 * failed Scene load from its first stage with the same initialized WebGPU
 * renderer, returns to `Loading Scene`, and restarts visible progress at
 * download; the diagnostics log accumulates across attempts so the
 * machine-readable record carries the exact event order of the whole
 * journey — the first-error stop and the one explicit retry.
 * `dependencies`, `recorder`, and `consoleSeam` are injectable so tests
 * drive the real handoff with recording collaborators; production uses the
 * real Scene-load dependencies, the browser recorder, and the real browser
 * console.
 */
export function createSceneLoadingHandoff(
  surface: DeliveryStateSurface,
  presenterSlot: PresenterSlot,
  dependencies: SceneLoadDependencies = productionSceneLoadDependencies,
  recorder: SceneLoadRecorder = productionSceneLoadRecorder,
  consoleSeam: SceneLoadConsole = productionSceneLoadConsole,
): SceneLoadingHandoff {
  return (renderer: PresentationRenderer): void => {
    // One diagnostics log per handoff invocation: the log accumulates
    // across explicit Retries, so the machine-readable record carries the
    // exact event order of the whole load journey (REQ-137, PVS-WEB-004).
    const diagnostics = createSceneLoadDiagnostics(consoleSeam)
    let retries = 0

    /** Run one Scene-load attempt; the one Retry action re-runs this. */
    function runLoad(): void {
      // Enter the `Loading Scene` delivery state before any asset work
      // (REQ-134, PVS-WEB-001); a Retry re-enters it and restarts the
      // visible progress at download.
      surface.showLoadingScene()

      const reporter: SceneLoadReporter = {
        report(progress: SceneLoadProgress): void {
          surface.showProgress(progress)
        },
      }

      void loadStartupScene(renderer, STARTUP_SCENE, dependencies, reporter, diagnostics)
        .then((result) => {
          // Add the renderer canvas to the existing product surface
          // (ARCH-024): the one WebGPU canvas of the product.
          surface.mountCanvas(renderer.domElement)
          // Publish the machine-readable record only after the real load
          // passes (REQ-136, REQ-137); the record carries the exact event
          // order, the first-error stop, and the explicit Retry count of
          // the whole journey.
          recorder.record(buildSceneLoadRecord(renderer, result, diagnostics, retries))
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
          // The first failed stage entered `Load failed` and ran no later
          // stage (REQ-134, PVS-WEB-001): show the readable error and one
          // semantic Retry action. The Retry uses the same initialized
          // WebGPU renderer, returns to `Loading Scene`, and restarts the
          // load from its first stage; no automatic retry starts.
          surface.showLoadFailed(readableSceneLoadError(error), () => {
            retries += 1
            runLoad()
          })
        })
    }

    runLoad()
  }
}

/**
 * Render the delivery-state surface into `host` as semantic DOM (ARCH-010,
 * REQ-134, PVS-WEB-001, PVS-WEB-003).
 *
 * The surface adds one live status region that carries the exact delivery
 * state text (`Startup`, `Unsupported`, `Loading Scene`, `Load failed`, or
 * `Ready`), one ordered progress list that visibly reports the download,
 * decode, GPU-upload, and Scene-readiness stages, and, on a failed check
 * or a failed Scene load, one semantic `alert` region containing the exact
 * readable message of that failure. A failed Scene load also shows one
 * semantic Retry action that restarts the load from its first stage; the
 * surface never retries automatically (REQ-134, PVS-WEB-001). The surface
 * also owns the mount point of the renderer canvas: the product adds
 * exactly one WebGPU canvas to the existing surface. The application name
 * and the single support table are owned by the startup entry; this
 * presentation adds no second Simulation, timing loop, or gameplay state
 * (REQ-113).
 */
export function renderDeliveryState(host: HTMLElement): DeliveryStateSurface {
  const state = document.createElement('div')
  state.id = 'delivery-state'
  state.setAttribute('role', 'status')
  state.textContent = 'Startup'
  host.append(state)

  let alert: HTMLElement | null = null
  let progress: HTMLElement | null = null
  let retryButton: HTMLButtonElement | null = null
  let retryAction: (() => void) | null = null
  const stageItems = new Map<string, HTMLLIElement>()

  /** Remove the failure alert and the one Retry action. */
  function removeFailure(): void {
    if (alert !== null) {
      alert.remove()
      alert = null
    }
    if (retryButton !== null) {
      retryButton.remove()
      retryButton = null
    }
    retryAction = null
  }

  /** Remove the visible progress list so a Retry restarts at download. */
  function removeProgress(): void {
    if (progress !== null) {
      progress.remove()
      progress = null
      stageItems.clear()
    }
  }

  return {
    showStartup(): void {
      state.textContent = 'Startup'
      removeFailure()
      removeProgress()
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
      removeFailure()
      // One explicit Retry restarts the failed Scene load from its first
      // stage: the visible progress restarts at download (REQ-134,
      // PVS-WEB-001).
      removeProgress()
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
    showLoadFailed(message: string, retry: () => void): void {
      state.textContent = 'Load failed'
      if (alert === null) {
        alert = document.createElement('div')
        alert.setAttribute('role', 'alert')
        host.append(alert)
      }
      alert.textContent = message
      retryAction = retry
      // One semantic Retry action; no automatic retry starts (REQ-134,
      // PVS-WEB-001).
      if (retryButton === null) {
        retryButton = document.createElement('button')
        retryButton.type = 'button'
        retryButton.textContent = 'Retry'
        retryButton.addEventListener('click', () => {
          retryAction?.()
        })
        host.append(retryButton)
      }
    },
    showReady(): void {
      state.textContent = SCENE_LOAD_READY_STATE
      removeFailure()
    },
    mountCanvas(canvas: HTMLCanvasElement): void {
      host.append(canvas)
    },
  }
}
