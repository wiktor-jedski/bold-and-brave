import { expect, test } from '@playwright/test'

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

  await page.goto('/')

  await expect(page.locator('#app')).toContainText('Bold and Brave')

  // The startup code starts the production `window.requestAnimationFrame`
  // loop (ARCH-006, ARCH-008, ARCH-024). Drive real rendered frames so the
  // runtime's frame callbacks execute on the built page; any exception in
  // the frame loop — including a Simulation advance — surfaces as a page
  // error. The guard timer keeps the test from hanging if the headless
  // browser ever throttles animation frames; the returned count still
  // proves that rendered frames actually executed.
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
