/**
 * The Browser Runtime timing module (ARCH-006).
 *
 * This entry is the module's public surface: the `createBrowserRuntime`
 * factory and its interface types. The implementation stays private so the
 * external seam remains deep, mirroring the core-owned Simulation module
 * (ARCH-002).
 */
export { createBrowserRuntime } from './implementation'
export type {
  BrowserRuntime,
  FrameCallback,
  FramePresenter,
  FrameScheduler,
  PresenterSlot,
} from './interface'
