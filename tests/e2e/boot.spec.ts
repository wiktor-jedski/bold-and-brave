import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    /** Test-only counter of production `requestAnimationFrame` requests. */
    __boldAndBraveRafRequests?: number
  }
}

/**
 * The built product runs the ordered Phase 6 startup gates (ARCH-023,
 * REQ-011, REQ-014, REQ-134, REQ-135). This check forces the first failed
 * check — the insecure context — deterministically in any environment by
 * overriding `window.isSecureContext` before any page script runs, and
 * observes the governed failure behavior: one specific semantic
 * `Unsupported` alert with the exact readable message, no Scene asset
 * request, and no production `requestAnimationFrame` request, because the
 * failed startup starts neither the Browser Runtime frame loop nor the
 * Scene-loading handoff (PVS-WEB-001).
 */
test('an insecure built-product startup shows the secure-context alert, requests no Scene asset, and starts no production frame loop', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const sceneAssetRequests: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })
  // Scene assets are the downloads, decodes, and uploads the Scene loader
  // would request; a failed startup must request none (REQ-134,
  // PVS-WEB-001).
  page.on('request', (request) => {
    if (/\.(glb|gltf|bin|png|jpg|jpeg|webp)(\?|$)/i.test(request.url())) {
      sceneAssetRequests.push(request.url())
    }
  })

  // Install the forced insecure context and the production
  // `requestAnimationFrame` counter before any page script runs, so the
  // capability gate reads `window.isSecureContext` as false and the
  // runtime's startup frame request (ARCH-006, ARCH-024) is observable
  // from the test.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    })
    const original = window.requestAnimationFrame
    window.__boldAndBraveRafRequests = 0
    window.requestAnimationFrame = (callback) => {
      window.__boldAndBraveRafRequests = (window.__boldAndBraveRafRequests ?? 0) + 1
      return original(callback)
    }
  })

  await page.goto('/')

  // The startup surface keeps the application name (ARCH-024).
  await expect(page.locator('#app')).toContainText('Bold and Brave')

  // The first failed check shows one specific semantic `Unsupported` alert
  // with its exact readable message (REQ-134, PVS-WEB-001).
  const alert = page.getByRole('alert')
  await expect(alert).toHaveText('Startup requires a secure context.')

  // The failed startup starts no production frame loop: no
  // `requestAnimationFrame` request was made (ARCH-006, ARCH-008,
  // REQ-134). The counter is read before the test schedules its own probe
  // frames, so the value proves the startup wiring alone.
  const frameRequests = await page.evaluate(() => window.__boldAndBraveRafRequests ?? 0)
  expect(frameRequests).toBe(0)

  // No Scene asset request follows the failure (REQ-134, PVS-WEB-001).
  expect(sceneAssetRequests).toEqual([])
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
