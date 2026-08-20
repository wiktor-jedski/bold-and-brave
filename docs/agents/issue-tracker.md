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
