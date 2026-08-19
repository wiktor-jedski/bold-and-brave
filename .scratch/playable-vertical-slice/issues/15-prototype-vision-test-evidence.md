Type: prototype
Status: resolved
Assignee: Codex
Blocked by: 01, 02, 12, 14

# Prove screenshot and video evidence for AI vision testing

## Question

What deterministic scenario controls, capture workflow, screenshot checkpoints, short-video format, observable rubrics, and conventional assertions produce reliable phase-acceptance evidence that an AI vision reviewer can judge?

## Answer

Use an agent-native evidence harness; do not build a human-facing evidence workbench.

- **Determinism:** each scenario exposes a named preset, explicit seed, reset, and fixed checkpoint IDs. The same preset and seed produce the same actors, timing, inputs, and outcomes.
- **Machine evidence:** every checkpoint emits a machine-readable state snapshot and conventional assertions. Assertions are the acceptance gate for campaign state, combat transitions, commands, fates, resources, and persistence.
- **Visual evidence:** automatically capture a screenshot or short clip only for checkpoints with a visual contract, such as directional combat readability or a visible Hold position marker. The AI agent evaluates those artifacts; a human-operated checklist is not part of the slice.
- **Capture choice:** use a screenshot for a static visual claim. Use a short clip only when the claim depends on a transition or timing; the clip must show context, input, outcome, and the settled result.
- **Manifest:** tie every state snapshot, assertion result, and visual artifact to the seed, checkpoint, and outcome. Generate the manifest through the test harness, not through manual UI interaction.
- **Failure evidence:** preserve the state snapshot, failed assertion, and relevant visual artifact for diagnosis. Do not require video at every checkpoint.

The workbench prototype is rejected as an implementation approach; it remains linked as the exploration that clarified the decision.

## Comments

### 2026-08-17 — Prototype artifact

- [Evidence workbench](../prototypes/15-vision-test-evidence.html)
- The workbench exposes deterministic preset and seed controls, five fixed checkpoints, visual-criteria gating for screenshots and clips, an eight-second clip recipe, observable rubric rows, conventional assertion states, and an exportable manifest.
- Browser smoke check passed: the initial checkpoint rendered; screenshot capture stayed blocked until all three criteria were accepted; capture advanced the checkpoint state; the defeat preset surfaced expected failures for the Safe settlement and Resolved contract assertions.
- Human review is required before this ticket can be resolved.

### 2026-08-17 — Human review

- The deterministic capture-and-check concept is useful.
- The human-facing visual workbench is rejected for this effort because the tests will be driven by an AI agent.
- The likely direction is an agent-native harness with deterministic controls, machine-readable state, and conventional assertions. The role of automatic screenshots and short videos remains to be decided: required for visual assertions, optional diagnostics, or out of scope.

### 2026-08-17 — Resolution

- Human review selected automatic visual captures only for checkpoints with visual assertions. Screenshots cover static claims; short clips cover transitions or timing and show context, input, outcome, and the settled result.
- The acceptance path is agent-native: deterministic controls, machine-readable state snapshots, conventional assertions, and a manifest linking artifacts to seed, checkpoint, and outcome.
