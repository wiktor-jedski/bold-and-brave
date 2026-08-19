import { createBrowserApplication } from './compositionRoot'

const app = document.querySelector('#app')

if (app !== null) {
  const application = createBrowserApplication()
  app.textContent = application.name
}
