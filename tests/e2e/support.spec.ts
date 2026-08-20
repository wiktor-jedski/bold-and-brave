import { expect, test } from '@playwright/test'
import { SUPPORT_PROMISE } from '../../src/browser/support'

/**
 * The built product presents the single authored support promise
 * (ARCH-024, REQ-012, REQ-013, REQ-015) as one semantic support table with
 * exactly one body row. Every rendered cell comes from the shared record,
 * so this check compares the product surface with the same authored values
 * instead of re-authoring them (REQ-012).
 */
test('the built product presents the shared support promise as one support table with exactly one body row', async ({ page }) => {
  await page.goto('/')

  // The product surface keeps the application name (ARCH-024).
  await expect(page.locator('#app')).toContainText('Bold and Brave')

  // The record is the one authored support row; the product surface and
  // this promised-row check share it (REQ-012).
  const row = SUPPORT_PROMISE.rows[0]
  expect(SUPPORT_PROMISE.rows).toHaveLength(1)

  // Exactly one semantic support table exists in the built product.
  const table = page.getByRole('table')
  await expect(table).toHaveCount(1)

  // The table has exactly one body row.
  const bodyRow = table.locator('tbody tr')
  await expect(bodyRow).toHaveCount(1)

  // Every cell of the one body row is derived from the shared record: the
  // browser, browser version, operating-system architecture, GPU, driver,
  // viewport, maximum device-pixel ratio, and combined keyboard-and-mouse
  // input mode (REQ-012, REQ-013, REQ-015).
  await expect(bodyRow.locator('td')).toHaveText([
    row.browser,
    row.browserVersion,
    row.platform,
    row.gpu,
    row.driver,
    `${row.viewport.width} × ${row.viewport.height} ${row.viewport.unit}`,
    row.maxDevicePixelRatio.toFixed(1),
    row.inputMode,
  ])

  // The support surface contains no Linux distribution version and no
  // promise for keyboard-only, touch, mobile, reduced-motion, another
  // browser, another GPU, or another driver (PVS-SCP-007, PVS-SCP-010).
  const surfaceText = await table.innerText()
  expect(surfaceText).not.toMatch(/Arch Linux|Ubuntu|Debian|Fedora|openSUSE|Manjaro|Linux Mint/i)
  expect(surfaceText).not.toMatch(/keyboard[- ]only|touch|mobile|reduced[- ]motion/i)
  expect(surfaceText).not.toMatch(/Firefox|Safari|WebKit|Edge|AMD|Intel|Apple|Qualcomm/i)
})
