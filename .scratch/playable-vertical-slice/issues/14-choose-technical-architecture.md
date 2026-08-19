Type: grilling
Status: resolved
Assignee: Codex
Blocked by: 02, 03, 04, 07, 08, 10, 11, 12, 13

# Choose the Three.js slice architecture

## Question

Which libraries and module boundaries should own rendering, simulation, combat, Agent and Band behavior, navigation, persistence, content data, UI, audio, deterministic scenarios, and browser delivery while keeping the slice changeable and testable?

## Answer

Use a single Vite + TypeScript browser application with one deep, platform-neutral `Simulation` module as the authoritative gameplay seam.

### Authoritative Simulation

- The `Simulation` owns mutable typed campaign and battle state. Its public interface accepts target-tick commands, advances one fixed tick at a time, exposes read-only projections and typed feedback events, and accepts validated plain-state snapshot restoration.
- Use a 60 Hz fixed tick. The browser runtime owns `requestAnimationFrame` accumulation and applies a bounded catch-up policy; scenario runners call exact ticks directly.
- Keep combat, Band orders, Agent and bandit behavior, travel, settlement interaction, Local Contract transitions, survivor fates, Feat choice, and save-safe transitions inside the Simulation implementation.
- Use common `Combatant` data with explicit player, Companion/Troop, Agent, and bandit behavior policies. `Combatant` remains the battle-participation term; it does not replace the individual's social identity or Agent fate.
- Inject a seeded random source. Gameplay never uses ambient browser randomness or `Math.random`.

### Browser and adapter seams

- Run the Simulation and Rapier on the main thread. Use Rapier 3D for authoritative capsule movement, collision, and queries. Start with authored anchors and deterministic local steering behind a navigation seam; a future offline Recast adapter may replace the planner.
- Use Three.js as a strict presentation adapter. It owns WebGPU rendering, camera, glTF loading, `AnimationMixer`, interpolation, and visual feedback. It stores no authoritative gameplay state and never decides combat or fate outcomes.
- Use plain HTML/CSS DOM panels for the Journal, Local Contract, save controls, and survivor-fate choices. Normalize Pointer Events, keyboard input, and interface actions into the same typed command stream.
- Use an event-driven audio adapter for spatial world cues and centered interface cues. Audio readiness or browser-policy failure is a visible capability state, not a gameplay fallback.
- Use a versioned persistence interface with an IndexedDB adapter. Save only validated plain campaign snapshots; rebuild Rapier, Three.js, and interface runtime state on load. Preserve the resolved three manual slots, rolling autosave, non-combat save boundary, and visible storage-failure behavior.

### Content and verification

- Store authored Agents, Troops, weapons, Feats, settlement data, contract data, and scenario setup in readonly typed manifests consumed by the Simulation.
- Drive deterministic scenarios through the same Simulation seam as the browser runtime. Test-only loading and checkpoint collection may exist, but scenarios must not bypass gameplay rules.
- Use Vitest for browser-independent Simulation, schema, persistence-interface, and scenario assertions. Use Playwright browser contexts for visual checkpoints, screenshots, and short-video evidence.
- Organize the application as layered ports and adapters: `domain`, `simulation`, `content`, and `scenarios` stay platform-neutral; rendering, interface, audio, persistence, navigation, and browser bootstrap point outward from the core.

### Explicit rendering override

The human selected WebGPU-only rendering for this effort, overriding the WebGL2 compatibility recommendation in **Survey the current Three.js browser-game stack**. WebGL2 fallback is outside this architecture decision and must not be assumed by later evidence work.

## Comments

### Resolution — 2026-08-17

The human confirmed the fixed-step Simulation seam, main-thread execution, Rapier movement, authored navigation seam, strict Three.js presentation adapter, DOM interface, event-driven audio, IndexedDB snapshots, typed content manifests, shared deterministic scenarios, Vitest plus Playwright verification, and explicit WebGPU-only rendering scope.

