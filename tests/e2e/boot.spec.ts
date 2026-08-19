import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    /** Test-only counter of production `requestAnimationFrame` requests. */
    __boldAndBraveRafRequests?: number
  }
}

test('the built application boots and runs the production frame loop without page or console errors', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  // Install the production `requestAnimationFrame` counter before any page
  // script runs, so the Browser Runtime's startup frame request (ARCH-006,
  // ARCH-024) is observable from the test.
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame
    window.__boldAndBraveRafRequests = 0
    window.requestAnimationFrame = (callback) => {
      window.__boldAndBraveRafRequests = (window.__boldAndBraveRafRequests ?? 0) + 1
      return original(callback)
    }
  })

  await page.goto('/')

  await expect(page.locator('#app')).toContainText('Bold and Brave')

  // Startup starts the one production frame loop, which requests its first
  // `window.requestAnimationFrame` callback synchronously. Read the counter
  // before the test schedules its own probe frames, so the value proves the
  // startup wiring alone: without `application.runtime.start()` this stays 0.
  const startupFrameRequests = await page.evaluate(() => window.__boldAndBraveRafRequests ?? 0)
  expect(startupFrameRequests).toBeGreaterThanOrEqual(1)

  // Drive real rendered frames so the runtime's frame callbacks execute on
  // the built page; any exception in the frame loop — including a Simulation
  // advance — surfaces as a page error. The guard timer keeps the test from
  // hanging if the headless browser ever throttles animation frames; the
  // returned count still proves that rendered frames actually executed.
  const frames = await page.evaluate(() => new Promise<number>((resolve) => {
    let count = 0
    const step = (): void => {
      count += 1
      if (count >= 3) {
        resolve(count)
      } else {
        window.requestAnimationFrame(step)
      }
    }
    window.requestAnimationFrame(step)
    window.setTimeout(() => resolve(count), 2000)
  }))

  expect(frames).toBeGreaterThanOrEqual(3)
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
