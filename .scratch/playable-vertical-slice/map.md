Label: wayfinder:map

# Chart the Bold and Brave Playable Vertical Slice

## Destination

A decision-complete specification for a 45–60 minute Three.js browser-game slice that proves Bold and Brave's defining Band contract loop through a timed bridge or settlement defense and is ready to hand to iterative phase planning.

The slice begins with preparation in a frontier settlement, resolves a small directional-combat battle at the bridge or in the settlement depending on timing, and ends with persistent human and material consequences.

## Notes

- Domain: grounded low-fantasy late-medieval frontier; dangerous, adventurous, politically messy, and without playable magic in the slice.
- Consult `CONTEXT.md` for canonical language. Use the Grilling and Domain Modeling skills for human decisions, Prototype for questions of feel or presentation, and Research for current facts outside the repository.
- Delivery: offline-style single-player play in a browser, with no account, backend, or server-owned gameplay state; saves live locally in the browser.
- Technology: Three.js is fixed. Other libraries, build tooling, and browser APIs remain decisions.
- Representative-quality priorities: directional melee, personally leading and commanding a small Band, and a visible post-contract relationship or grievance consequence.
- Deliberately simple presentation is acceptable for the Overworld, dialogue, settlement simulation, economy, and content volume.
- Scope scenario: the player recruits and equips a Band in one compact settlement, accepts a defense Local Contract, sets up at the bridge before the raid deadline or responds in the settlement after the attack begins, fights one enemy Agent and five ordinary bandits, resolves the fate of survivors, and returns to the changed settlement.
- Battle size: player character, one Companion, and up to four Troops against one Agent and five bandits.
- Weapons: one-handed sword, shield, and staff.
- A combatant may be Downed or killed in battle, but both states deliberately share the same battle presentation. After battle, Release/Capture/Execute is chosen separately for the Downed Agent and once for all Downed ordinary bandits. Captured survivors become Captives.
- Preparation uses Coin and Provisions. Troops do not gain progression in the slice; only the player gains a Feat.
- Art: stylized low-poly realism with strong silhouettes, woodcut colors, restrained flat shading, and exaggerated combat readability. Generative AI is a development aid only, not a runtime dependency.
- Audio: functional combat, movement, command, interface, ambience, and nonverbal-reaction sound, plus one ambient music layer; no spoken dialogue or adaptive score.
- Persistence: three manual save slots outside active combat plus autosave at Scene transitions.
- Verification: every playable phase must expose seeded, reproducible scenarios with explicit visual checkpoints, screenshot and short-video evidence for AI vision review, and conventional assertions for state and logic.
- Wayfinder plans decisions rather than implementing the slice. Once this map is decision-complete, hand it to phase planning.

## Decisions so far

- [Find the directional combat control and feedback model](issues/01-prototype-directional-combat.md) — Use a stable over-the-shoulder camera and a shared four-sector drag gesture: hold to preview an attack or guard direction, then release to commit the attack or leave guard.
- [Survey the current Three.js browser-game stack](issues/02-research-threejs-game-stack.md) — Use a fixed-step simulation core with seeded scenarios, Rapier 3D collision and movement, authored anchors behind a replaceable navigation seam, glTF/AnimationMixer presentation, IndexedDB saves, and Playwright evidence capture.
- [Define the combat model and equipment roles](issues/03-define-combat-model.md) — Use Mount & Blade-style committed attacks with guard-cancel feints, directional sword/staff guards, omnidirectional stamina-limited shields, multi-target weapon paths, and explicit Downed/death rules.
- [Define Band commands and combatant behavior](issues/04-define-band-commands-and-combat-ai.md) — Use separately ordered Companion and Troop groups with Follow, visible-marker Hold, and automatic-target Engage orders; the enemy Agent coordinates readable bandit pressure.
- [Define the raid interception and battle flow](issues/05-define-raid-battle-flow.md) — Use a bridge setup or late settlement-center emergency, resident-protection victory conditions, binary Safe/Damaged settlement consequences, and immediate victory-resolution or defeat-summary exits.
- [Define Agent relationships, grievances, and enemy fates](issues/06-define-agent-relationships-and-fates.md) — Use per-Agent Friendly/Neutral/Hostile dispositions, persistent typed grievances, and separate Active/Captive/Executed fates with authored reactions to battle outcomes and survivor decisions.
- [Define settlement interaction and contract flow](issues/07-define-settlement-and-contract-flow.md) — Use Talk, Wait, Journal, and Leave around one defense Local Contract, with a visible Raid deadline that selects bridge setup or a late settlement-center emergency.
- [Define recruitment, equipment, Coin, and Provisions](issues/08-define-preparation-economy.md) — Use four fixed Staff Troop candidates at 25 Coin each, 100 starting Coin, 10 starting Provisions, and a single 0.2-per-member-per-Overworld-day upkeep rate.
- [Define Overworld travel, time, and Scene transitions](issues/10-define-overworld-time-and-scenes.md) — Use a free-roaming 3D Overworld with direct click-to-move, distance-based time, Space pause, 1×–4× speed controls, and one settlement Scene for both battle starts.
- [Define local campaign saves and restoration](issues/11-define-local-save-model.md) — Use three manual slots and one separate rolling autosave for complete validated non-combat campaign snapshots, with exact restoration, visible no-save failure, and explicit deletion/reset controls.
- [Define player Feat progression](issues/09-define-player-feat-progression.md) — Any victory unlocks one permanent choice among Rapid Guard, Rapid Attack, and Rapid Stamina after survivor-fate resolution; defeat grants none.
- [Find the visual language and readability bar](issues/12-prototype-visual-language.md) — Use a third-person camera and minimal white translucent HUD: bottom red health bar, top-left settlement defense/time, center four-sector Attack/Block control with opaque selected direction and stamina below; resolve Agent fate beside a kneeling Agent in a field with woodcut colors.
- [Define the audio language and feedback priorities](issues/13-define-audio-language.md) — Use combat-first feedback with four-sector pitch cues, sparse nonverbal command and state sounds, one unvaried movement layer, Downed-only Agent reaction, and a single low non-adaptive music layer.
- [Choose the Three.js slice architecture](issues/14-choose-technical-architecture.md) — Use one deep fixed-step Simulation with Rapier movement, strict presentation and adapter seams, typed manifests, shared deterministic scenarios, and WebGPU-only rendering.
- [Prove screenshot and video evidence for AI vision testing](issues/15-prototype-vision-test-evidence.md) — Use an agent-native harness with deterministic seeds and checkpoints, machine-readable snapshots and assertions, and automatic screenshots only for visual claims; use clips only for transitions or timing.
- [Establish the WebGPU browser and device envelope](issues/16-research-webgpu-browser-envelope.md) — WebGPU support is browser/OS/GPU specific; require secure-context capability checks, fail closed against Three.js WebGL2 fallback, explicit loading/device-loss states, and semantic DOM alternatives.
- [Define the WebGPU slice support envelope](issues/19-define-webgpu-support-envelope.md) — Promise one tested Chromium/Linux desktop row with a named GPU and driver, core WebGPU only, 60-frame target and 30-frame floor, Scene loading with console diagnostics, and normal keyboard-and-mouse controls.
- [Tune the Playable Vertical Slice encounter](issues/17-prototype-slice-tuning.md) — Use two default Troops, a 12-hour deadline with 15-second bridge setup, authored player-advantage movement, readable sector damage/timing, 100-max stamina, and a 3–5 minute competent battle.
- [Structure the Playable Vertical Slice handoff specification](issues/18-structure-slice-handoff-spec.md) — Use one self-contained, subsystem-first normative contract with explicit requirement classes, state and flow tables, evidence traceability, and no in-scope unresolved decisions.

## Not yet specified

- The future Band morale model, including how battle outcomes, missing Provisions, Local Contract decisions, travel without camping, and entertainment affect Band retention, is not yet specified.

## Out of scope

- Implementing the slice or breaking its implementation into phase tickets; that begins after this decision map reaches its destination.
- An open-approach interception terrain variant; the first version uses the bridge only and can revisit the alternative in a later effort.
- A playable path that joins or assists the raiders; the first version only lets the Band defend the settlement.
- Building on the Overworld, covert operations, trade simulation and trade routes, camping, tournaments, nicknames, horses, vehicles, siege equipment, bows, axes, or pikes.
- Large armies, diplomacy, delegated Companion work, stewards, troop education or progression, custom Troops trained and equipped by the player, quirks, multiple contracts, and NPC daily schedules.
- Multiplayer, accounts, backend services, server-owned state, runtime generative AI, spoken dialogue, and adaptive music.
- Detailed Captive management, ransom, forced labor or enslavement systems, and captive trading.
