Type: research
Status: resolved
Assignee: Codex

# Survey the current Three.js browser-game stack

## Question

What do current primary sources establish about maintained, browser-compatible options and constraints for physics and character collision, navigation, animation, audio, input, local persistence, deterministic testing, and screenshot/video capture around Three.js?

## Answer

The primary-source survey establishes the following route for later architecture decisions:

- Treat WebGL 2 as the browser/device baseline and keep rendering separate from authoritative simulation.
- Prefer Rapier 3D for capsule movement, collision queries, and future dynamic bodies; budget asynchronous WASM initialization and fixed-step simulation.
- Start Band movement orders with deterministic authored anchors and local steering behind a replaceable navigation seam; use offline/prebuilt Recast navigation only when the compact slice needs it.
- Use glTF through `GLTFLoader` and `AnimationMixer` for presentation, while simulation owns combat, orders, Agent state, and Fate.
- Use Three.js Web Audio wrappers after explicit user interaction, normalize Pointer Events into ticked input commands, and handle browser policy failures as visible states.
- Use IndexedDB for schema-versioned browser-local save slots and autosave, with explicit quota, eviction, and storage-error paths.
- Use seeded scenario manifests, fixed-step state checkpoints, and Playwright browser contexts for screenshots and short videos; pair visual evidence with serialized-state assertions.

The complete evidence and direct primary-source links are in [Three.js browser-game stack survey](../research/02-threejs-game-stack.md).

## Comments

### Resolution — 2026-08-17

The research asset records the constraints and recommendations needed by the local-save, architecture, and vision-evidence tickets. It does not choose the final module boundaries or browser envelope.
