import { createBrowserApplication } from './compositionRoot'

const app = document.querySelector('#app')

if (app !== null) {
  const application = createBrowserApplication()
  app.textContent = application.name
  // Start the single production frame loop (ARCH-006, ARCH-008): the
  // composition-root runtime schedules real `window.requestAnimationFrame`
  // callbacks that advance the one composed Simulation at the fixed 60 Hz
  // tick interval (REQ-113).
  application.runtime.start()
}
