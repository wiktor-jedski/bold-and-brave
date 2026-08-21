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
