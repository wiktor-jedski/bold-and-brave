/**
 * Shared Phase 6 startup-record evidence and validation (ARCH-023,
 * ARCH-024, REQ-011, REQ-014, REQ-134, REQ-135).
 *
 * The local promised-row acceptance command records the real Phase 6
 * startup of the built product: the product reports one machine-readable
 * startup record after every ordered gate success, and the promised-row
 * spec validates that report — together with the verified host GPU and
 * driver row — before it writes the evidence file
 * `test-results/support-row/startup.json`. This module owns the evidence
 * shape and the validation that compares a record with the shared
 * `SUPPORT_PROMISE` row and the gate-verified system facts (REQ-012). The
 * vitest mismatch tests prove that every wrong value is rejected before it
 * can produce passing evidence. The record contains no Linux distribution
 * version (PVS-SCP-007).
 */
import type { SupportPromise } from '../src/browser/support'
import { STARTUP_GATE_ORDER } from '../src/browser/startup'
import type { StartupRecord } from '../src/browser/startup'
import { matchesPromisedGpu } from './check-support-row'
import type { SystemFacts } from './support-row-record'

/** The only power-preference hint the startup gate ever passes (REQ-014). */
const REQUIRED_POWER_PREFERENCE = 'high-performance'

/** The final delivery state entered only after every gate passes (REQ-134). */
const REQUIRED_DELIVERY_STATE = 'Loading Scene'

/**
 * The verified host GPU and driver row of the promised machine (REQ-012).
 *
 * The gate accepts the environment only when the system reports exactly
 * one GPU row and that row matches the promise; the startup evidence
 * record carries that verified row so the record itself shows the exactly
 * one matching host GPU and driver.
 */
export interface StartupHostFacts {
  /** The verified GPU model, e.g. `NVIDIA RTX 2070 SUPER` (REQ-012). */
  readonly gpu: string
  /** The verified GPU driver version (REQ-012). */
  readonly driver: string
  /** The number of GPU rows the system reported; the gate accepts exactly one. */
  readonly gpuRows: number
}

/**
 * The machine-readable Phase 6 startup evidence record (ARCH-023,
 * REQ-011, REQ-014, REQ-134, REQ-135).
 *
 * The record carries the product-reported startup report — the secure
 * context, the exact gate order, the `high-performance` power-preference
 * hint, the browser adapter's full reported information and every reported
 * limit, the empty core-only device request, the selected Three.js WebGPU
 * backend, the absence of a WebGL fallback, and the final `Loading Scene`
 * delivery state — plus the verified exactly-one host GPU and driver row.
 * The promised-row acceptance writes this record as
 * `test-results/support-row/startup.json` only after validation passes, so
 * a headless launch, a software adapter, a failed gate, or a mismatched
 * value never produces passing evidence.
 */
export interface StartupEvidenceRecord extends StartupRecord {
  /** The verified exactly-one host GPU and driver row (REQ-012). */
  readonly host: StartupHostFacts
}

/**
 * Whether the browser adapter's vendor information matches the promised
 * GPU's vendor (REQ-012).
 *
 * The promised GPU `NVIDIA RTX 2070 SUPER` names NVIDIA as its vendor; the
 * browser adapter reports its vendor in its own form (e.g. `nvidia`).
 * Correlation accepts any reported vendor token that equals the promised
 * GPU's vendor token, case-insensitively, and rejects an empty or
 * different vendor.
 */
export function matchesPromisedAdapterVendor(vendor: string, promisedGpu: string): boolean {
  if (vendor === '') {
    return false
  }
  const promisedVendorToken = promisedGpu.toLowerCase().split(/\s+/).filter(Boolean)[0]
  return promisedVendorToken !== undefined && vendor.toLowerCase() === promisedVendorToken
}

/**
 * Validate one Phase 6 startup evidence record against the single authored
 * support promise and the gate-verified system facts (REQ-011, REQ-012,
 * REQ-014, REQ-134, REQ-135).
 *
 * Returns the list of rejection reasons; an empty list means the product
 * reported a secure context, the exact gate order, the `high-performance`
 * power-preference hint, a browser adapter with matching NVIDIA vendor
 * information and `isFallbackAdapter: false`, full adapter information and
 * every reported limit, an empty core-only device request with no optional
 * feature or raised limit, one usable device, a Three.js WebGPU backend
 * with no WebGL fallback, the final `Loading Scene` delivery state, and the
 * verified exactly-one host NVIDIA RTX 2070 SUPER with driver 610.57.04.
 */
export function validateStartupEvidenceRecord(
  record: StartupEvidenceRecord,
  promise: SupportPromise,
  system: SystemFacts,
): string[] {
  const rejections: string[] = []
  const row = promise.rows[0]

  if (record.secureContext !== true) {
    rejections.push('The product did not report a secure context.')
  }

  if (record.gates.length !== STARTUP_GATE_ORDER.length) {
    rejections.push(
      `Gate order ${record.gates.join(', ')} does not match the required order ${STARTUP_GATE_ORDER.join(', ')}.`,
    )
  } else {
    for (let index = 0; index < STARTUP_GATE_ORDER.length; index += 1) {
      if (record.gates[index] !== STARTUP_GATE_ORDER[index]) {
        rejections.push(
          `Gate order ${record.gates.join(', ')} does not match the required order ${STARTUP_GATE_ORDER.join(', ')}.`,
        )
        break
      }
    }
  }

  if (record.powerPreference !== REQUIRED_POWER_PREFERENCE) {
    rejections.push(
      `Power preference ${record.powerPreference} does not match the required ${REQUIRED_POWER_PREFERENCE}.`,
    )
  }

  if (!matchesPromisedAdapterVendor(record.adapter.vendor, row.gpu)) {
    rejections.push(
      `Browser adapter vendor ${record.adapter.vendor} does not match the promised ${row.gpu}.`,
    )
  }
  if (record.adapter.isFallbackAdapter !== false) {
    rejections.push(
      'The browser adapter reports a software fallback; a physical adapter is required.',
    )
  }
  if (Object.keys(record.adapter.info).length === 0) {
    rejections.push('The product recorded no adapter information.')
  }
  if (Object.keys(record.adapter.limits).length === 0) {
    rejections.push('The product recorded no reported limit.')
  }

  if (Object.keys(record.device.descriptor).length !== 0) {
    rejections.push('The core-only device request was not the empty descriptor.')
  }
  if (record.device.optionalFeatures.length !== 0) {
    rejections.push('The device request enabled an optional adapter feature.')
  }
  if (Object.keys(record.device.requiredLimits).length !== 0) {
    rejections.push('The device request raised a limit.')
  }

  if (record.backend.selected !== 'webgpu') {
    rejections.push(`The Three.js renderer selected the ${record.backend.selected} backend; WebGPU is required.`)
  }
  if (record.backend.webglFallback !== false) {
    rejections.push('The Three.js renderer fell back to a WebGL backend.')
  }

  if (record.deliveryState !== REQUIRED_DELIVERY_STATE) {
    rejections.push(
      `Final delivery state ${record.deliveryState} does not match the required ${REQUIRED_DELIVERY_STATE}.`,
    )
  }

  if (!matchesPromisedGpu(record.host.gpu, row.gpu)) {
    rejections.push(`Host GPU ${record.host.gpu} does not match the promised ${row.gpu}.`)
  }
  if (record.host.driver !== row.driver) {
    rejections.push(`Host driver ${record.host.driver} does not match the promised ${row.driver}.`)
  }
  if (record.host.gpuRows !== 1) {
    rejections.push(`The host reported ${record.host.gpuRows} GPU rows; exactly one is required.`)
  }

  return rejections
}

/**
 * Compose the startup evidence record from the product-reported startup
 * record and the gate-verified system facts (REQ-012, REQ-134).
 *
 * The host row is read from the verified facts instead of being
 * re-authored, so the record reuses the shared support promise and the
 * exactly-one row the gate accepted.
 */
export function buildStartupEvidenceRecord(
  startup: StartupRecord,
  system: SystemFacts,
): StartupEvidenceRecord {
  return {
    ...startup,
    host: {
      gpu: system.gpu,
      driver: system.driver,
      gpuRows: system.gpuRows,
    },
  }
}
