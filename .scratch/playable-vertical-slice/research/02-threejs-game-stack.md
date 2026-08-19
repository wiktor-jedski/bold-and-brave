# Three.js browser-game stack survey

**Scope.** This note surveys a deliberately small set of browser-compatible choices for the Bold and Brave Playable Vertical Slice: an offline-style, single-player browser game with a small Band, one compact battle Scene, browser-local saves, seeded scenarios, and screenshot/short-video evidence. Three.js is fixed; this note does not implement the slice.

## Baseline: Three.js and the browser

### Facts

- Three.js `WebGLRenderer` uses WebGL 2, and its documentation says WebGL 1 has not been supported since `r163`. The baseline therefore needs a WebGL-2-capable browser/device rather than a WebGL-1 fallback. [`WebGLRenderer` API](https://threejs.org/docs/pages/WebGLRenderer.html)
- `WebGLRenderer.domElement` is an `HTMLCanvasElement | OffscreenCanvas`, so the renderer's canvas can be exercised by browser automation and can be the visual surface used for evidence capture. [`WebGLRenderer` API](https://threejs.org/docs/pages/WebGLRenderer.html)
- Three.js's `GLTFLoader` loads glTF 2.0 and returns a scene plus an array of `AnimationClip`s. It is an addon imported explicitly, rather than part of the core `three` namespace. [`GLTFLoader` API](https://threejs.org/docs/pages/GLTFLoader.html)

### Recommendation for this slice

Use `WebGLRenderer` as the compatibility baseline, with a startup capability check and a clear unsupported-browser message. Keep the rendering layer separate from simulation, save data, and evidence hooks: the browser canvas is an output, not the source of truth. Use glTF through `GLTFLoader` for animated combatants and scene props, and keep collision/navmesh metadata authored separately or in a deterministic asset build step.

## Physics and character collision

### Candidate A: Rapier 3D (recommended default)

#### Facts

- Rapier's JavaScript bindings are published as `@dimforge/rapier2d` and `@dimforge/rapier3d`. The normal package is a WebAssembly module and must be loaded asynchronously. For no-bundler or bundlers with problematic WASM handling, Rapier provides `@dimforge/rapier2d-compat` and `@dimforge/rapier3d-compat`, which embed the WASM in JavaScript and require `await RAPIER.init()`. [Rapier JavaScript getting started](https://rapier.rs/docs/user_guides/javascript/getting_started_js/)
- Rapier has a built-in kinematic character controller. Its documented move-and-slide operation accounts for obstacles, can stop at obstacles, slide on slopes, climb stairs, walk over small obstacles, and interact with moving platforms. The guide also says the built-in controller is generic and may not fit every game without game-specific tuning. [Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/)
- The controller computes a corrected translation from a desired translation; the caller must apply the result to the collider or kinematic rigid body. Its supported movement is translational: the guide explicitly says the built-in controller does not support rotational movement. [Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/)
- Rapier recommends a cuboid, ball, or capsule for the character shape because those shapes involve less computation and fewer numerical approximations. The controller supports slope limits, autostep, snap-to-ground, collision filters, and chronological computed collision events. [Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/)
- Rapier does not provide rendering; its `World.debugRender()` exposes flat vertex/color arrays that the application must draw. [Rapier JavaScript getting started](https://rapier.rs/docs/user_guides/javascript/getting_started_js/)
- Rapier's JavaScript/TypeScript/WASM version documents cross-platform determinism for the same version and same initial conditions, including identical `World.createSnapshot()` MD5 hashes after the same number of timesteps. It also warns that construction order and initialization values must match and that transcendental functions such as `Math.sin` and `Math.cos` are not cross-platform deterministic. [Rapier determinism](https://rapier.rs/docs/user_guides/javascript/determinism/)

#### Recommendation

Use Rapier 3D for the player character and the physical collision/query layer if the slice needs reliable capsule-vs-world movement, stairs/slopes, triggers, or future dynamic bodies. Make Rapier initialization an explicit asynchronous boot phase (or use the compat package where the bundler/deployment constraints demand it). Represent each combatant with a capsule or similarly simple collider; keep sword/guard hit tests as authored gameplay queries rather than relying on full ragdoll physics. Feed a fixed timestep to `world.step()` and snapshot/hash selected state in deterministic scenarios.

A practical separation is: Rapier controls collision and movement; a game-state system controls health, Downed/fate transitions, orders, and Agent relationships; Three.js mirrors the resulting transforms. Do not treat render-frame time or animation pose as authoritative gameplay state.

### Candidate B: cannon-es (all-JavaScript alternative)

#### Facts

- `cannon-es` describes itself as a lightweight 3D physics engine written in JavaScript. Its repository identifies it as a maintained fork of cannon.js and describes a type-safe flatbundle with ESM and CJS output suitable for modern environments. [cannon-es repository](https://github.com/pmndrs/cannon-es)
- Its repository documents rigid-body APIs, body shapes, constraints, collision filtering, triggers, sleeping bodies, and Three.js/React integration pointers. It presents those as general physics primitives, while Rapier separately documents a high-level character-controller API. [cannon-es repository](https://github.com/pmndrs/cannon-es) [Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/)

#### Recommendation

Choose cannon-es only if avoiding WASM/asynchronous physics startup is more important than a ready-made character controller and the architecture is willing to own capsule movement, slope/step handling, and collision-response policy. For this slice's third-person Band battle, that custom work is avoidable; Rapier is the better default. This is a recommendation based on the documented feature surface, not a claim that cannon-es cannot implement character movement.

## Navigation and movement orders

### Candidate: recast-navigation-js with Three.js helpers

#### Facts

- `recast-navigation-js` describes itself as a WebAssembly port of Recast Navigation and Detour, providing navigation-mesh construction, pathfinding, spatial reasoning, and crowd simulation. Its README lists web and Node support and an integration package, `@recast-navigation/three`. [recast-navigation-js repository](https://github.com/isaac-mason/recast-navigation-js)
- The repository says it ships as ECMAScript modules compatible with Node.js and browsers. It must be initialized asynchronously with `init()`. It offers runtime generation, offline generation/import, tiled meshes, temporary obstacles through TileCache, and Three.js helpers. [recast-navigation-js repository](https://github.com/isaac-mason/recast-navigation-js)
- The same README warns that runtime generation may be too slow for larger environments and describes offline generation/import as useful for static environments. It also documents a lighter option: generate/export a mesh and use an external query library when minimizing the WASM bundle or avoiding more complex Detour features. [recast-navigation-js repository](https://github.com/isaac-mason/recast-navigation-js)

### Recommendation for this slice

Do not make a full crowd-navigation stack a prerequisite for the first bridge/settlement defense. The map has only one player character, one Companion, four Troops, one enemy Agent, and five bandits. Start with deterministic authored anchors/waypoints and simple local steering for Follow, Hold position, and Engage, while using Rapier shape queries for collision validity. Keep a navmesh seam in the movement-order interface so that `recast-navigation-js` can replace waypoint planning when obstacle-rich Scenes or larger Bands justify it.

If navigation must already support click-to-move across the Overworld or reliable obstacle routing in the battle Scene, use a prebuilt/offline navmesh and `@recast-navigation/three`, not runtime generation on every load. Keep navmesh generation out of the gameplay boot path where possible; both the async WASM initialization and runtime-generation cost are documented constraints. The “waypoints first, navmesh behind an interface” choice is a recommendation for the slice scale, not a limitation of Recast/Detour.

## Animation and model assets

### Facts

- Three.js `AnimationMixer` is a player for animations on an object. A mixer has global time and time scale; `update(deltaTime)` advances it, and `setTime(time)` jumps to an exact animation time. [Three.js `AnimationMixer`](https://threejs.org/docs/pages/AnimationMixer.html)
- `GLTFLoader` returns animation clips from glTF and supports common production extensions including Draco mesh compression, meshopt compression, KTX2/Basis textures, and WebP/AVIF textures when the corresponding loaders/decoders are configured. [Three.js `GLTFLoader`](https://threejs.org/docs/pages/GLTFLoader.html)
- Three.js's animation docs state that mixer updates are usually driven from a render loop using a delta from `Clock` or `Timer`; `Clock.getDelta()` measures elapsed time between calls. [`AnimationMixer`](https://threejs.org/docs/pages/AnimationMixer.html), [`Clock`](https://threejs.org/docs/pages/Clock.html)

### Recommendation

Use one `AnimationMixer` per animated combatant root, with explicit named clips for idle, locomotion, attack, guard, hit/recoil, Downed, and post-battle kneeling. Drive animation from simulation events and a fixed simulation clock; use render interpolation only for visual smoothness. Use `setTime()` in deterministic screenshot checkpoints when a specific pose must be stable. Keep animation transitions separate from authoritative combat state so an interrupted render frame cannot change whether an Agent is Downed or Captive.

For asset loading, use glTF and add compression only after measuring the representative scene. Compression decoders add asynchronous loading/setup and are not needed to validate the small vertical slice. Test the exact browser/device envelope because WebGL 2 and GPU/driver capability remain prerequisites.

## Audio

### Facts

- Three.js `AudioListener` wraps the native `AudioContext`; an application usually creates one listener, normally as a child of the camera. It is the mandatory listener parameter for `Audio` and `PositionalAudio`. [Three.js `AudioListener`](https://threejs.org/docs/pages/AudioListener.html)
- Three.js `Audio` and related modules use the Web Audio API. `Audio` supports a decoded `AudioBuffer`, looping, volume, playback rate, detune, filters, and playback control. [Three.js `Audio`](https://threejs.org/docs/pages/Audio.html)
- Browsers commonly block audible autoplay when playback is initiated before user interaction. MDN documents user interaction, muted/zero-volume media, or an allowlisted/permission-policy context as conditions under which autoplay may be allowed, and recommends handling a rejected `play()`/deferring playback. [MDN autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)

### Recommendation

Create/resume the `AudioContext` from the first explicit Start/Continue interaction, then attach one `AudioListener` to the camera. Route combat cues, movement, commands, interface, ambience, and the single ambient music layer through named gain buses so deterministic tests can mute or replace audio without changing gameplay. Keep audio playback as a consequence of simulation events (attack committed, guard matched, hit, Downed, command acknowledged), not as a source of state. Treat autoplay denial as a normal startup path and expose a visible “enable sound” affordance.

For evidence capture, make audio optional in screenshot tests and explicitly choose whether short videos include it; browser autoplay and device audio output are environment-dependent even when the visual simulation is deterministic.

## Input

### Facts

- Pointer Events provide one hardware-agnostic DOM event model for mouse, pen/stylus, and touch, with `pointerType`, button state, pressure, contact geometry, and pointer capture. [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- Pointer Lock supplies mouse movement deltas rather than absolute cursor position, hides the cursor, removes screen-edge limits, and is intended for first-person 3D games; entering it requires an engagement gesture in relevant cases and can be released by the user. [MDN Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API)
- Pointer lock exposes `movementX`/`movementY` and dispatches `pointerlockchange`/`pointerlockerror`, so a game must handle lock acquisition, loss, and error states. [MDN Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API)

### Recommendation

Use ordinary Pointer Events for the four-sector drag gesture, command-marker placement, UI buttons, and touch/pen compatibility. Use Pointer Lock only if the later camera-control decision requires continuous mouse-look; it is not needed for the currently specified over-the-shoulder, stable-camera directional control. Normalize raw DOM events into an input-command stream with timestamps/tick numbers, then consume that stream from the fixed-step simulation. This makes the same seeded scenario replayable without depending on event timing or a particular device.

Keep keyboard shortcuts as a separate command mapping (pause, speed, save, UI navigation) and ensure the same commands are available through visible controls; this avoids coupling gameplay correctness to keyboard layout or Pointer Lock availability.

## Browser-local persistence

### Facts

- IndexedDB is an asynchronous, transactional, same-origin client-side database for significant structured data, including files/blobs; it supports object stores, indexes, and structured-clone-compatible values, and is available in Web Workers. [MDN IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- Browser storage is managed per origin. IndexedDB and related storage are best-effort by default; quotas and eviction differ by browser. An origin can request persistent storage with `navigator.storage.persist()`, but approval behavior differs among browsers. [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- `localStorage` is string-only and has a small per-origin limit, while IndexedDB is intended for larger structured data. [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

### Recommendation

Use IndexedDB for the three manual save slots, autosave at Scene transitions, and a small schema-versioned metadata record. Store plain game-state data—seed, contract state, deadline, Coin, Provisions, Band member state, Agent Disposition/Grievances/Fate, and settlement condition—not Three.js objects, GPU resources, Rapier handles, or animation mixers. Write through a versioned transaction and show save/load errors rather than silently losing a save.

Request persistent storage as a best-effort enhancement, but design the UX around possible eviction, private browsing, origin changes, and quota failures. Include an explicit export/import JSON path only if later product decisions require stronger portability; it is not a substitute for IndexedDB's transactional writes.

## Deterministic testing and scenario control

### Facts

- Rapier documents cross-platform deterministic simulation under same-version, same-initial-condition, same-construction-order constraints, while warning that non-deterministic initialization values and transcendental math can break that guarantee. [Rapier determinism](https://rapier.rs/docs/user_guides/javascript/determinism/)
- Three.js's `Clock` reports elapsed wall-clock deltas, and `AnimationMixer.update()` consumes a delta; neither API by itself defines a fixed-step deterministic game simulation. [`Clock`](https://threejs.org/docs/pages/Clock.html), [`AnimationMixer`](https://threejs.org/docs/pages/AnimationMixer.html)
- Playwright's `page.addInitScript()` runs before page scripts and explicitly documents overriding `Math.random` as a use case. [Playwright `page.addInitScript`](https://playwright.dev/docs/api/class-page#page-add-init-script)
- Playwright browser contexts are isolated and can be closed explicitly so artifacts such as videos are flushed and saved. [Playwright `browser.newContext`](https://playwright.dev/docs/api/class-browser#browser-new-context)

### Recommendation

Define a scenario manifest containing a seed, initial save/state, fixed tick rate, input command sequence, expected state checkpoints, and visual checkpoint labels. Use a small explicit seeded PRNG owned by the game rather than calling ambient `Math.random`; if tests need to control third-party randomness, Playwright's init script can seed/replace it before application code runs. Keep all gameplay time in integer ticks or fixed-step seconds; use render-frame deltas only to interpolate presentation.

For deterministic assertions, hash or compare serialized game state at checkpoints (including Band membership, Agent Fate/Disposition/Grievances, contract outcome, Coin/Provisions, and settlement condition) and, where Rapier is used, optionally compare a physics snapshot/hash after the same number of steps. Do not assert raw pixels as the only correctness signal: GPU, browser, font, and driver differences can change rendering while state is correct. Instead pair state assertions with named visual checkpoints and artifact capture.

A fixed browser context should specify viewport, device scale, locale/timezone if relevant, and reduced-motion policy. Freeze or replace any wall-clock source used by the game in test mode, and gate audio/network effects so an offline-style test does not depend on external services.

## Screenshot and short-video evidence

### Facts

- Playwright's `page.screenshot()` captures a page screenshot to a path. Its options include viewport/full-page capture and an `animations` option; when animations are disabled, finite CSS/Web Animations are fast-forwarded and infinite animations are canceled for the screenshot. [Playwright `page.screenshot`](https://playwright.dev/docs/api/class-page#page-screenshot)
- Playwright browser contexts support `recordVideo`, including an output directory and optional dimensions; videos are saved when the context is closed. [Playwright `browser.newContext` `recordVideo`](https://playwright.dev/docs/api/class-browser#browser-new-context-option-record-video)
- The browser's `MediaRecorder` records a `MediaStream`, supports MIME-type capability checks through `isTypeSupported()`, emits `dataavailable` chunks, and stops with a final data event. [MDN `MediaRecorder`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)

### Recommendation

Use Playwright as the first-party evidence harness: launch a fixed browser context, load a seeded scenario, issue commands, wait for explicit simulation checkpoints, and capture a screenshot plus a short video for each required phase. Always close the context before collecting video files. Prefer Playwright video for end-to-end evidence because it records the browser surface and user interaction; use in-page `MediaRecorder` only if the architecture specifically needs a canvas stream or game-controlled recording.

Make screenshot checkpoints stable by pausing simulation, setting mixer times where necessary, disabling nonessential CSS/Web Animations, and hiding transient debug overlays. Record metadata beside each artifact (scenario seed, build identifier, browser, viewport, tick/checkpoint) so a reviewer can distinguish a gameplay regression from a rendering-environment difference.

## Implications for “Choose the Three.js slice architecture”

1. **Keep a deterministic simulation core separate from Three.js rendering.** Use integer/fixed-step ticks, seeded randomness, explicit input commands, and serializable game state. Three.js mirrors state; it does not own Band, Agent, contract, save, or Fate truth. [`Clock`](https://threejs.org/docs/pages/Clock.html), [Rapier determinism](https://rapier.rs/docs/user_guides/javascript/determinism/)
2. **Choose Rapier 3D as the collision/movement default.** Its browser bindings and character controller are documented, and its determinism/snapshot story supports seeded acceptance scenarios. Budget an asynchronous WASM initialization phase and test the WebGL-2 browser envelope. [Rapier JavaScript setup](https://rapier.rs/docs/user_guides/javascript/getting_started_js/), [Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/), [Rapier determinism](https://rapier.rs/docs/user_guides/javascript/determinism/), [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
3. **Start navigation with authored anchors and a replaceable planner seam.** The small Band and one compact Scene do not justify making runtime Recast generation a boot dependency. Adopt offline/prebuilt Recast navigation later if click-to-move or obstacle-rich orders outgrow waypoints; keep the command interface independent of the planner. [recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js)
4. **Use glTF + `AnimationMixer` for presentation, not combat truth.** Drive clips from simulation events and expose explicit pose checkpoints for evidence. Keep collision shapes and gameplay hit logic simple and separately authored. [Three.js `GLTFLoader`](https://threejs.org/docs/pages/GLTFLoader.html), [Three.js `AnimationMixer`](https://threejs.org/docs/pages/AnimationMixer.html)
5. **Treat browser policies as architecture inputs.** Start/resume audio after user interaction, handle Pointer Lock loss rather than requiring it, and treat IndexedDB as origin-scoped best-effort storage with quota/eviction/error paths. [MDN autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay), [MDN Pointer Lock](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API), [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [MDN storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
6. **Make evidence a supported runtime seam.** Add test-only scenario loading, checkpoint events, state serialization, pause/time controls, deterministic audio/network gates, and metadata-aware Playwright screenshot/video capture. This directly supports the map's requirement that every playable phase expose seeded reproducible scenarios and visual evidence without making screenshots the sole oracle. [Playwright `page.screenshot`](https://playwright.dev/docs/api/class-page#page-screenshot), [Playwright `recordVideo`](https://playwright.dev/docs/api/class-browser#browser-new-context-option-record-video), [Rapier determinism](https://rapier.rs/docs/user_guides/javascript/determinism/)

**Primary-source set:** [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [Three.js AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html), [Three.js AudioListener](https://threejs.org/docs/pages/AudioListener.html), [Three.js Audio](https://threejs.org/docs/pages/Audio.html), [Rapier JavaScript setup](https://rapier.rs/docs/user_guides/javascript/getting_started_js/), [Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/), [Rapier determinism](https://rapier.rs/docs/user_guides/javascript/determinism/), [recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js), [cannon-es](https://github.com/pmndrs/cannon-es), [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events), [MDN Pointer Lock](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API), [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [MDN storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [MDN autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay), [Playwright Page](https://playwright.dev/docs/api/class-page), [Playwright Browser](https://playwright.dev/docs/api/class-browser), and [MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder).
