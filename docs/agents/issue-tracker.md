# Issue tracker: Local Markdown

Issues and specs (you may know a spec as a PRD) for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says “publish to the issue tracker”

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says “fetch the relevant ticket”

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Phase 1 — Repository description

### Testing coverage deviations

- No automated test or command is planned because the task changes repository documentation only. Review compares the rendered `README.md` with `CONTEXT.md`, `docs/requirements.md`, and `docs/architecture.md`.

## Phase 2 — Simulation boundary

### Assumptions

- Bun is the package manager. The implementation commits `bun.lock` and uses frozen Bun installs because no package configuration or lock file exists.
- Rendering, interface, audio, persistence, and navigation ports are not created until a real adapter needs each seam. The only browser-to-core seam in this phase is the core-owned `Simulation` interface.

### Clarifications

- The project owner selected a boundary-only tracer. This phase does not add a typed gameplay command or advance a Simulation tick. The initial immutable projection contains only Simulation tick 0; later phases add real command and tick behavior.

## Phase 4 — Initial campaign state

### Testing coverage deviations

- Phase 4 does not run `CP-REL-RELEASE` or `CP-PREP-RECRUIT` end to end because their battle, Journal, recruitment, and evidence surfaces belong to later phases. As allowed by the phase plan, `src/core/simulation/simulation.test.ts` creates two new Simulations and checks the same exact initial state and projection claims. Browser evidence stays assigned to the later evidence phases.

## Phase 5 — Support promise

### Assumptions

- The manual promised-row acceptance command runs on the current promised workstation and resolves the system `chromium` executable from `PATH`. Playwright 1.62.1 bundles Chromium 151.0.7922.34, which is not the required patch version. The workstation provides the required system Chromium. The command must fail instead of using the bundled browser.

### Testing coverage deviations

- Phase 5 uses a focused support-row check instead of running `CP-SUPPORT-GATE` and `CP-PERFORMANCE` end to end. WebGPU startup gates, the representative bridge battle, performance metrics, and the evidence harness belong to later phases.
- Pull-request CI uses Playwright's bundled Chromium for general browser checks and does not produce promised-row evidence. The focused Phase 5 support-row check runs manually on the promised workstation. REQ-015 remains open until Phase 38 verifies usable normal keyboard-and-mouse play.

## Phase 6 — WebGPU startup

### Testing coverage deviations

- Phase 6 stops at the `Loading Scene` handoff. It proves that each failed gate prevents that handoff, but it does not test download, decode, GPU upload, Scene readiness, or the `Ready` state. Phase 7 owns those checks.
- Phase 6 uses focused Vitest and Playwright checks and the local promised-row command. It does not generate the linked `CP-SUPPORT-GATE` PNG set or final evidence manifest. Phases 42–44 own the acceptance catalog, checkpoint data, and visual provenance.

## Phase 7 — Scene loading and renderer boundary

### Clarifications

- The project owner selected the Overworld as the first loaded Scene because a new campaign starts on the Overworld. Use the stable Scene ID `poc-overworld` and one small authored glTF asset with ID `poc-overworld-environment`. Phase 38 owns the representative visual detail.
- The project owner defined Scene readiness as the point when the decoded asset is attached to the Three.js Scene, GPU preparation is complete, and one WebGPU frame presents the current read-only Simulation projection. Phase 7 adds no authoritative Scene or location state. Phase 9 owns authoritative Overworld location and movement.

### Testing coverage deviations

- The project owner selected real WebGPU e2e verification. Phase 7 adds no focused unit test because unit tests are forbidden on phase and master branches. General CI checks types, dependency direction, architecture, the build, existing browser seams, and the real public-content-catalog-to-Scene-asset contract. The promised-workstation Playwright command exercises the real successful and failed WebGPU Scene loads.
- The project owner assigned the final `CP-SUPPORT-LOAD` WebM files and evidence manifest to Phases 42–44, which own the scenario catalog, checkpoint data, and visual provenance.

## Phase 8 — Rendering device loss

### Clarifications

- The project owner selected Playwright capture and destroy for promised-row loss induction. The check wraps the browser's real `GPUAdapter.requestDevice`, retains the exact returned device only inside Playwright, and calls `GPUDevice.destroy()` after `Ready`. This resolves the production `GPUDevice.lost` promise and adds no product-side loss command.
- The project owner selected one Browser Runtime `acceptsGameplayInput()` gate. It is open only while the normal runtime runs and closes permanently on terminal device loss. Phase 9 must make its Input Adapter consult this gate before it creates or submits a gameplay command. Phase 8 adds no generic command module and no incomplete gameplay-command payload.
- REQ-138 remains Active after Phase 8. Phase 43 closes it after the complete `SCN-16-WEBGPU-DEVICE-LOSS` state and gameplay-event checks pass. Phase 44 adds the required WebM and provenance.

### Testing coverage deviations

- Phase 8 does not run `SCN-16-WEBGPU-DEVICE-LOSS` during an active battle or check the later typed gameplay-event stream because combat and that event stream do not exist yet. The local check instead runs the active fixed-tick Simulation, compares the complete immutable projection at loss with every pre-Reload sample, and confirms that presentation stops. Phase 43 runs the complete scenario and checks the no-post-loss-event claim.
- No gameplay Input Adapter exists before Phase 9. Phase 8 therefore checks every `acceptsGameplayInput()` lifecycle state, permanent closure after device loss, refused runtime restart, and the Reload-only `Device lost` surface. Phase 9 performs the first check with a real gameplay command.

## Phase 9 — Overworld travel

### Assumptions

- One authoritative world unit maps to one glTF and Three.js scene unit. The Typed Content Catalog owns this 1:1 production scale. Simulation movement, authored navigation, camera bounds, Band-pawn size, and asset validation use the same value.
- Campaign time starts at elapsed Overworld time 0 because the sources define no absolute new-campaign clock or date. Travel stores exact elapsed time. A later interface can format it without a travel-math change.
- To avoid temporary behavior, Tasks 25, 28, and 29 implement the final 1× `Space` pause behavior and the final moving-travel rate and 0.1-step Provisions remainder needed by the initial two-member Band. Phase 10 still owns speed selection. Phase 11 still owns all member-count, save-and-load, floor, and non-moving-state coverage.
- Overworld controls use primary-button click for movement, secondary-button drag for camera rotation, the wheel for camera zoom, and `Space` for pause and resume. Camera angle and distance bounds are authored content and must keep the view top-down and the Band pawn and current route readable.

### Clarifications

- The project owner selected the Three.js Presentation Adapter as the owner of CSS-pixel-to-world selection. For a primary-button Overworld selection, the Input Adapter checks the Browser Runtime gameplay-input gate and passes the unchanged CSS-pixel position to the Presentation Adapter. The Presentation Adapter maps the selection through its current camera and returns a candidate production-scale world point only from authored traversable terrain. The Input Adapter submits a target-tick destination command only for a returned candidate. The Simulation remains responsible for authoritative target validity and movement. Camera rotation and zoom remain presentation-only and create no gameplay command.
- Phase 9 must finish one representative start-boundary visual slice: frontier terrain, one direct route, a compact settlement-entry landmark, one Band pawn, terrain and pawn materials, lighting, and idle and travel feedback. Phase 38 completes and harmonizes assets from earlier phases. It does not replace a Phase 9 placeholder or first introduce these representative elements.
- Resolving these source decisions does not make an implementation task ready. Tasks 23–29 remain `OPEN` until a separate readiness review marks them `PREPARED`.

### Approved visual reference and pass checklist

- Use [`phase-9-visual.png`](../../phase-9-visual.png) as the directional reference for composition and visual language. It is not a production asset or a pixel-exact target.
- Use a high, oblique, top-down default view with no visible horizon. Keep the direct route, settlement destination, and Band pawn readable at the authored rotation and zoom bounds.
- Use large faceted terrain shapes, a damp warm moor palette, a few broad pools, little surface noise, and soft warm overcast light.
- Show a compact settlement destination with three to five timber buildings that use less than about 10 percent of the authored default frame. Do not use a gate. Mark the settlement entry boundary through the change from open moor to low fences, worked ground, and the first buildings.
- Show exactly one Band pawn with a deep hood, long blue-grey tabard, one-handed sword, and narrow heater shield. Do not show separate Band members. At the authored default view and every camera bound, keep the pawn small, readable, and subordinate to the map. Do not use a fixed screen-height percentage.
- Replace every technical box mesh and separate Band-member node with committed authored glTF terrain, route, materials, lighting, one `poc-band-pawn`, and idle and travel clips. The reference image, an asset generator, and generated runtime code must not be runtime dependencies.

### Testing coverage deviations

- No unit tests are planned because unit tests are forbidden on phase and master branches. Real catalog, navigation, Simulation, Presentation Adapter, Input Adapter, Browser Runtime, and glTF collaborations are checked through integration tests, build validation, and browser e2e tests.
- Phase 9 does not run `CP-FLOW-CONTRACT`, `CP-PREP-PROVISIONS`, or `CP-UI-HUD` end to end. Those checkpoints also require later time-speed, full Provisions, settlement, Journal, and representative-presentation work. The phase uses focused core integration checks and a real promised-workstation travel journey. Later implementation and evidence phases complete the checkpoint scenarios, manifests, and canonical artifacts.
