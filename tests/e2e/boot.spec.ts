import { expect, test } from '@playwright/test'

test('the built application boots without page or console errors', async ({ page }) => {
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

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
