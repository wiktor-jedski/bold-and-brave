## Guidelines

### Questions

Group questions in batches if their outcomes do not depend on each other.

### Language

Always talk in ASD-STE100 Simplified Technical English
Always read CONTEXT.md files, and use their ubiquitous language

## Skills

### Issue tracker

Issues and specs live as Markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo using root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

### Planning inputs

Phase plan - `docs/implementation/plan.md`
Task list - `docs/implementation/task-list.md`
Open items/issues - `docs/agents/issue-tracker.md`
Architecture - `docs/architecture.md`
Requirements - `docs/requirements.md`

## Testing

### CI

Check required dependencies and run all project tests - `scripts/ci-check.py`

### Planning

Task list validation script - `scripts/validate-task-list.py`

### Project scripts

- Start the Vite development server - `bun run dev`
- Build the browser application - `bun run build`
- Preview the production build - `bun run preview`
- Type-check platform-neutral core code - `bun run typecheck:core`
- Type-check browser code - `bun run typecheck:browser`
- Test the Simulation - `bun run test:simulation`
- Test architecture boundaries - `bun run test:architecture`
- Test the built browser application - `bun run test:browser`
- Check dependency direction - `bun run check:dependencies`
