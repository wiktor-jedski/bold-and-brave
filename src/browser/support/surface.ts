/**
 * The product surface of the support promise (ARCH-024, REQ-012, REQ-013,
 * REQ-015).
 *
 * This module presents the single authored support-promise record as one
 * semantic support table with exactly one body row. Every rendered value is
 * read from `SUPPORT_PROMISE`, so the built product never copies the
 * promised browser, operating-system architecture, GPU, driver, viewport,
 * device-pixel ratio, or input mode into a second product statement
 * (REQ-012). The table names no Linux distribution version (PVS-SCP-007)
 * and makes no keyboard-only, touch, mobile, reduced-motion, other-browser,
 * other-GPU, or other-driver promise (REQ-015, PVS-SCP-010).
 */
import { SUPPORT_PROMISE } from './catalog'
import type { SupportPromiseRow } from './interface'

/** One value column of the rendered support table. */
interface SupportColumn {
  /** The semantic header label of the column. */
  readonly label: string
  /** Derive the cell text from the authored support row. */
  readonly text: (row: SupportPromiseRow) => string
}

/** The eight value columns, each read from the one authored support row. */
const SUPPORT_COLUMNS: readonly SupportColumn[] = [
  { label: 'Browser', text: (row) => row.browser },
  { label: 'Browser version', text: (row) => row.browserVersion },
  { label: 'Operating-system architecture', text: (row) => row.platform },
  { label: 'GPU', text: (row) => row.gpu },
  { label: 'Driver', text: (row) => row.driver },
  {
    label: 'Viewport',
    text: (row) => `${row.viewport.width} × ${row.viewport.height} ${row.viewport.unit}`,
  },
  { label: 'Maximum device-pixel ratio', text: (row) => row.maxDevicePixelRatio.toFixed(1) },
  { label: 'Input mode', text: (row) => row.inputMode },
]

/**
 * Render the shared support promise into `host` as one semantic table.
 *
 * The table has one header row and exactly one body row, both built from
 * the single authored row of `SUPPORT_PROMISE` (REQ-012). The application
 * name and the one production frame loop are owned by the startup surface;
 * this presentation adds no second Simulation, timing loop, or gameplay
 * state (REQ-113).
 */
export function renderSupportPromise(host: HTMLElement): void {
  const table = document.createElement('table')
  const head = document.createElement('thead')
  const body = document.createElement('tbody')
  const headerRow = document.createElement('tr')
  const bodyRow = document.createElement('tr')

  for (const column of SUPPORT_COLUMNS) {
    const header = document.createElement('th')
    header.scope = 'col'
    header.textContent = column.label
    headerRow.append(header)
  }

  const row = SUPPORT_PROMISE.rows[0]
  for (const column of SUPPORT_COLUMNS) {
    const cell = document.createElement('td')
    cell.textContent = column.text(row)
    bodyRow.append(cell)
  }

  head.append(headerRow)
  body.append(bodyRow)
  table.append(head, body)
  host.append(table)
}
