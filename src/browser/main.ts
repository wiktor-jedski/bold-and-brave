import { createBrowserApplication, runApplicationStartup } from './compositionRoot'
import { renderDeliveryState } from './startup/surface'
import { renderSupportPromise } from './support/surface'

const app = document.querySelector<HTMLElement>('#app')

if (app !== null) {
  const application = createBrowserApplication()
  app.textContent = application.name
  // Present the single authored support promise (ARCH-024, REQ-012,
  // REQ-013, REQ-015) as one semantic support table with exactly one body
  // row, every value read from the shared record.
  renderSupportPromise(app)
  // Run the ordered Phase 6 startup sequence (ARCH-023, REQ-011, REQ-014,
  // REQ-134, REQ-135): the delivery-state surface stays at `Startup` while
  // the capability and Three.js WebGPU backend gates run, shows one
  // specific semantic `Unsupported` alert for the first failed check, and
  // enters `Loading Scene` only after every check passes. Only on success
  // does startup start the one Browser Runtime frame loop and invoke the
  // Scene-loading handoff (ARCH-006, ARCH-008); a failure starts neither.
  const surface = renderDeliveryState(app)
  void runApplicationStartup(application, surface)
}
