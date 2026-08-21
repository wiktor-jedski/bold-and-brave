/**
 * Focused startup-record tests (ARCH-023, ARCH-024, REQ-011, REQ-014,
 * REQ-134, REQ-135).
 *
 * These tests prove that `buildStartupRecord` composes the machine-readable
 * startup record exactly from the two gate successes: the secure-context
 * value and exact `high-performance` power-preference hint and empty
 * core-only device descriptor of the capability gate, the full reported
 * adapter information and every reported limit inspected before device
 * use, the selected Three.js WebGPU backend, the absence of a WebGL
 * fallback, and the final `Loading Scene` delivery state. They run in
 * general CI (`test:startup`, `test:architecture`) because they exercise
 * pure record composition with injected values and require no promised
 * workstation; the promised-row evidence command
 * (`check:support-row`) is the only command that launches the system
 * Chromium and writes `test-results/support-row/startup.json`.
 */
import { describe, expect, it } from 'vitest'
import type { PresentationRenderer, PresentationSuccess } from '../presentation'
import type { StartupSuccess } from './interface'
import { buildStartupRecord, STARTUP_GATE_ORDER } from './record'
import type { StartupRecord } from './record'

/** The one reported adapter-info fixture of the success case, frozen like the gate's inspection. */
const ADAPTER_INFO = Object.freeze({
  vendor: 'nvidia',
  architecture: 'turing',
  device: 'NVIDIA GeForce RTX 2070 SUPER',
  description: '',
  subgroupMinSize: 32,
  subgroupMaxSize: 32,
  isFallbackAdapter: false,
})

/** The one reported limits fixture of the success case, frozen like the gate's inspection. */
const ADAPTER_LIMITS = Object.freeze({
  maxTextureDimension2D: 16384,
  maxBufferSize: 1073741824,
  maxBindGroups: 4,
})

/** The one capability-gate success fixture matching the promised row. */
function makeCapabilitySuccess(
  descriptor: GPUDeviceDescriptor = {},
): StartupSuccess {
  return {
    ok: true,
    adapter: {} as unknown as GPUAdapter,
    device: {} as unknown as GPUDevice,
    inspection: {
      info: ADAPTER_INFO,
      limits: ADAPTER_LIMITS,
    },
    secureContext: true,
    powerPreference: 'high-performance',
    deviceDescriptor: descriptor,
  }
}

/** Build a renderer whose backend reports the given identity flags. */
function makeRenderer(
  backend: PresentationRenderer['backend'],
): PresentationRenderer {
  return {
    backend,
    init() {
      return Promise.resolve()
    },
    dispose() {},
    render() {
      throw new Error('the startup record tests never render a frame')
    },
    compileAsync() {
      throw new Error('the startup record tests never prepare GPU resources')
    },
    setSize() {
      throw new Error('the startup record tests never resize a canvas')
    },
    get domElement(): HTMLCanvasElement {
      throw new Error('the startup record tests never touch the canvas')
    },
  }
}

/** The one backend-gate success fixture with a WebGPU backend. */
function makeBackendSuccess(
  renderer: PresentationRenderer = makeRenderer({ isWebGPUBackend: true }),
): PresentationSuccess {
  return { ok: true, renderer }
}

describe('composed startup record (ARCH-023, REQ-011, REQ-014, REQ-134, REQ-135)', () => {
  it('composes the exact machine-readable record from the two gate successes', () => {
    const record = buildStartupRecord(makeCapabilitySuccess(), makeBackendSuccess())

    expect(record.secureContext).toBe(true)
    // The exact gate order of the five performed checks (PVS-WEB-001).
    expect(record.gates).toEqual(STARTUP_GATE_ORDER)
    expect(record.gates).toEqual([
      'secure-context',
      'webgpu-presence',
      'physical-adapter',
      'core-device',
      'webgpu-backend',
    ])
    expect(record.powerPreference).toBe('high-performance')
    // The browser adapter reports NVIDIA vendor information and the
    // browser's own nonfallback signal (REQ-014, PVS-WEB-002).
    expect(record.adapter.vendor).toBe('nvidia')
    expect(record.adapter.isFallbackAdapter).toBe(false)
    // The full reported information and every reported limit recorded
    // before device use (REQ-135, PVS-WEB-002).
    expect(record.adapter.info).toEqual(ADAPTER_INFO)
    expect(record.adapter.limits).toEqual(ADAPTER_LIMITS)
    // The empty core-only device request with no optional feature and no
    // raised limit (REQ-135, PVS-WEB-002).
    expect(record.device.descriptor).toEqual({})
    expect(record.device.optionalFeatures).toEqual([])
    expect(record.device.requiredLimits).toEqual({})
    // The Three.js WebGPU backend and the absence of a WebGL fallback
    // (REQ-011, PVS-SCP-006).
    expect(record.backend.selected).toBe('webgpu')
    expect(record.backend.webglFallback).toBe(false)
    // The final delivery state entered after every gate passes (REQ-134).
    expect(record.deliveryState).toBe('Loading Scene')
  })

  it('derives the optional-feature and raised-limit emptiness from the exact device descriptor', () => {
    const record = buildStartupRecord(
      makeCapabilitySuccess({
        requiredFeatures: ['timestamp-query'],
        requiredLimits: { maxBindGroups: 8 },
      }),
      makeBackendSuccess(),
    )

    expect(record.device.descriptor).toEqual({
      requiredFeatures: ['timestamp-query'],
      requiredLimits: { maxBindGroups: 8 },
    })
    // The non-empty request surfaces here and would fail acceptance.
    expect(record.device.optionalFeatures).toEqual(['timestamp-query'])
    expect(record.device.requiredLimits).toEqual({ maxBindGroups: 8 })
  })

  it('reports a WebGL fallback backend as non-WebGPU when the renderer backend is the WebGL fallback', () => {
    const record = buildStartupRecord(
      makeCapabilitySuccess(),
      makeBackendSuccess(makeRenderer({ isWebGLBackend: true })),
    )

    expect(record.backend.selected).toBe('webgl')
    expect(record.backend.webglFallback).toBe(true)
  })

  it('returns a deeply frozen plain record that serializes to JSON', () => {
    const record = buildStartupRecord(makeCapabilitySuccess(), makeBackendSuccess())

    expect(Object.isFrozen(record)).toBe(true)
    expect(Object.isFrozen(record.adapter)).toBe(true)
    expect(Object.isFrozen(record.adapter.info)).toBe(true)
    expect(Object.isFrozen(record.adapter.limits)).toBe(true)
    expect(Object.isFrozen(record.device)).toBe(true)
    expect(Object.isFrozen(record.backend)).toBe(true)

    const parsed: StartupRecord = JSON.parse(JSON.stringify(record))
    expect(parsed.secureContext).toBe(true)
    expect(parsed.gates).toEqual(STARTUP_GATE_ORDER)
    expect(parsed.adapter.vendor).toBe('nvidia')
    expect(parsed.adapter.isFallbackAdapter).toBe(false)
    expect(parsed.device.optionalFeatures).toEqual([])
    expect(parsed.backend.selected).toBe('webgpu')
    expect(parsed.deliveryState).toBe('Loading Scene')
  })
})
