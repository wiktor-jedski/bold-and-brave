import { createBrowserApplication } from './compositionRoot'
import { renderSupportPromise } from './support/surface'

const app = document.querySelector<HTMLElement>('#app')

if (app !== null) {
  const application = createBrowserApplication()
  app.textContent = application.name
  // Present the single authored support promise (ARCH-024, REQ-012,
  // REQ-013, REQ-015) as one semantic support table with exactly one body
  // row, every value read from the shared record.
  renderSupportPromise(app)
  // Start the single production frame loop (ARCH-006, ARCH-008): the
  // composition-root runtime schedules real `window.requestAnimationFrame`
  // callbacks that advance the one composed Simulation at the fixed 60 Hz
  // tick interval (REQ-113).
  application.runtime.start()
}
