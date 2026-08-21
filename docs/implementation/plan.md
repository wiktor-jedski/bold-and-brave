# Bold and Brave Implementation Plan

## Purpose

This plan divides the Playable Vertical Slice into small phases. Each phase is one sprint and one code-review unit. Each phase gives one coherent result.

Use these source documents:

- [`docs/requirements.md`](../requirements.md) is the normative product contract.
- [`docs/architecture.md`](../architecture.md) is the normative architecture contract.
- [`CONTEXT.md`](../../CONTEXT.md) defines the game terms.

If this plan conflicts with a source document, the source document has authority.

## Phase use

Use one phase at a time. Create a task list from only that phase. Keep each task small. Use the same requirement set for implementation and review.

A phase is complete only when all of these conditions are true:

1. The phase result works as one complete behavior.
2. All requirements in **Requirements closed** are complete.
3. The phase check passes.
4. The review has no unresolved finding.
5. Checks from complete phases still pass.

The phase number gives the dependency sequence. It does not give dates, sprint duration, task order inside a phase, file layout, or class design. A task agent can select implementation details only when it creates the task list.

The **Acceptance link** gives the final catalog checkpoint for the behavior. Before the evidence harness exists, use a focused check with the same input, state, and output claim. The evidence phases connect these checks to generated evidence. They do not change gameplay results.

### Incremental visual asset delivery

Each phase that first makes a Scene, Combatant, weapon, or interactable visible must also deliver the representative committed production assets for that visible scope. A technical placeholder can prove a loading or rendering seam before gameplay uses the object. It must not remain when the object becomes part of playable behavior.

Use the production coordinate, scale, naming, material, animation, and export conventions from the first representative asset slice. The browser application must load committed production files and must not depend on an asset-generation tool or service at runtime.

Phase 38 completes and audits visual consistency. It must not be the first phase that supplies representative assets for an earlier playable behavior.

## Governance

### Phase 1 — Repository description

**Result:** `README.md` gives a concise description of the Playable Vertical Slice, uses the canonical terms, links `CONTEXT.md`, `docs/requirements.md`, and `docs/architecture.md`, and does not contain the obsolete full-game feature list.

**Requirements closed:** None.

**Phase check:** Review the rendered `README.md` against the three linked normative sources. It contains no obsolete wishlist item and makes no product promise outside the current Playable Vertical Slice.

**Acceptance link:** None.

**Review focus:** Confirm that `README.md` is short, accurate, and does not duplicate the normative contracts.

## Core runtime and browser delivery

### Phase 2 — Simulation boundary

**Result:** One platform-neutral `Simulation` owns gameplay state. Browser dependencies point to ports that the core owns. Browser code cannot change gameplay state directly.

**Requirements closed:** REQ-111, REQ-121.

**Phase check:** Build and start the browser application. Its composition root creates exactly one `Simulation` through the core-owned interface and reads an immutable initial projection with Simulation tick 0. A mutation attempt leaves a second projection unchanged. A core-only TypeScript build and dependency check find no browser type or dependency from core code to browser code.

**Acceptance link:** `CP-ARCH-DETERMINISM`.

**Review focus:** Confirm that there is one gameplay authority.

### Phase 3 — Fixed-tick runtime

**Result:** The runtime advances the Simulation at 60 fixed ticks per Simulation second. It processes no more than five catch-up ticks in one rendered frame. It keeps all remaining ticks. A scenario caller can advance exact ticks directly.

**Requirements closed:** REQ-113.

**Phase check:** Use a controlled frame delay. Confirm the tick count, catch-up limit, and retained tick debt.

**Acceptance link:** `CP-ARCH-DETERMINISM`.

**Review focus:** Confirm that the runtime never drops a Simulation tick.

### Phase 4 — Initial campaign state

**Result:** A new campaign has exactly Village Elder (`poc-contract-giver`) and Varek (`poc-enemy-agent`) in the Agent relationship model. Their Agent fates, Dispositions, and Grievances have the exact initial values. The player has 100 Coin, 10.0 Provisions, and Miro (`poc-companion`) as the fixed Companion at no Coin cost.

**Requirements closed:** REQ-077, REQ-167.

**Phase check:** Create two new campaigns and compare their initial plain-state projections with the required values.

**Acceptance link:** `CP-PREP-RECRUIT`, `CP-REL-RELEASE`.

**Review focus:** Confirm that Miro and generic settlement residents do not enter the Agent relationship model.

### Phase 5 — Support promise

**Result:** The product states one support row. Acceptance uses the specified Chromium version, Linux x64, NVIDIA GPU and driver, viewport, and device-pixel ratio. The product makes only a normal keyboard-and-mouse support promise.

**Requirements closed:** REQ-012, REQ-013.

**Phase check:** Inspect the recorded environment and browser dimensions. Confirm that no other support promise is present.

**Acceptance link:** `CP-SUPPORT-GATE`, `CP-PERFORMANCE`.

**Review focus:** Do not infer support for a different browser, input mode, GPU, or driver.

### Phase 6 — WebGPU startup

**Result:** Startup checks the secure context, physical adapter, and usable device in the specified order. It then checks core WebGPU capabilities and the Three.js WebGPU backend. It uses `high-performance` as a preference only. A failed gate stops before asset loading. There is no WebGL fallback.

**Requirements closed:** REQ-011, REQ-014, REQ-134, REQ-135.

**Phase check:** Exercise success and each failed startup gate. Confirm the ordered state, readable error, and absence of asset loading after a failure.

**Acceptance link:** `CP-SUPPORT-GATE`.

**Review focus:** Confirm that an optional GPU feature is not required.

### Phase 7 — Scene loading and renderer boundary

**Result:** Three.js presents read-only Simulation output through WebGPU. Scene loading reports download, decode, GPU upload, and readiness progress. Console records contain the Scene and asset identifiers. The first error stops loading and provides Retry.

**Requirements closed:** REQ-118, REQ-136, REQ-137.

**Phase check:** Load one Scene and fail one asset load. Confirm all progress stages, diagnostic records, first-error stop, and Retry.

**Acceptance link:** `CP-SUPPORT-LOAD`, `CP-ARCH-DETERMINISM`.

**Review focus:** Confirm that rendering does not store a gameplay result.

### Phase 8 — Rendering device loss

**Result:** A lost rendering device stops the Simulation immediately. No hidden tick or gameplay event occurs after the loss. The product shows Reload, and Reload repeats all startup gates.

**Requirements closed:** REQ-138.

**Phase check:** Cause device loss during active Simulation work. Compare the tick at loss with all ticks before Reload.

**Acceptance link:** `CP-DELIVERY-DEVICE-LOSS`.

**Review focus:** Confirm that the stopped state cannot accept gameplay input.

## Campaign and preparation

### Phase 9 — Overworld travel

**Result:** A new campaign starts at the specified distance outside the settlement. Click-to-move, camera rotation, and camera zoom work on the free-roaming 3D Overworld. This phase replaces the technical box fixture with the first representative visual asset slice: a recognizable frontier area at the start boundary, visible player-character and Miro models, representative low-poly woodcut materials and lighting, and movement animation. Campaign time and Provisions advance only while the Band moves. The travel model can add another location without a new movement rule.

**Requirements closed:** REQ-017, REQ-018, REQ-035, REQ-117.

**Phase check:** Move, stop, and pause at the start boundary. Confirm position, time, Provisions behavior, and deterministic steering. Inspect the built product and confirm that the representative frontier, both Band members, materials, lighting, and movement animation are visible and that the technical box fixture is absent.

**Acceptance link:** `CP-FLOW-CONTRACT`, `CP-PREP-PROVISIONS`.

**Review focus:** Keep destination data separate from the travel rule. Confirm that the Scene, camera, movement, and exported assets use one production scale and that the runtime has no asset-generation dependency.

### Phase 10 — Overworld time controls

**Result:** `Space` pauses and resumes Overworld movement and time. Keys `1`, `2`, `3`, and `4` select the matching speed and resume a paused Overworld. One Overworld hour takes 5 real-time seconds at 1×. Speed changes movement, campaign time, and Provisions by the same multiplier and keeps the same distance result.

**Requirements closed:** REQ-019, REQ-020.

**Phase check:** Travel the same route at each speed and through one pause. Compare final position, campaign time, and Provisions.

**Acceptance link:** `CP-FLOW-CONTRACT`, `CP-PREP-PROVISIONS`.

**Review focus:** Confirm that speed changes elapsed real time, not travel cost.

### Phase 11 — Provisions

**Result:** Moving travel consumes 0.2 Provisions per Band member per Overworld day. The Simulation uses the specified 0.5 Band-member-day remainder rule and 0.1 Provisions steps. It stores and shows one decimal place. It clamps at 0.0. Zero Provisions does not stop travel or add a penalty. Non-moving states consume no Provisions.

**Requirements closed:** REQ-082, REQ-083, REQ-084, REQ-085.

**Phase check:** Exercise member counts, speed values, pause, stationary time, and a save and load across a partial remainder. Continue travel at 0.0.

**Acceptance link:** `CP-PREP-PROVISIONS`, `CP-SAVE-RESTORE`.

**Review focus:** Confirm that Captives do not increase consumption.

### Phase 12 — Settlement transition

**Result:** Crossing the settlement boundary loads the one settlement Scene. The bridge and settlement center are areas in that Scene. `Leave` returns the Band to the Overworld boundary without a change to time, Provisions, Local Contract state, or Band state.

**Requirements closed:** REQ-021, REQ-026.

**Phase check:** Enter and leave the settlement. Compare state before entry and after exit, except for the specified Scene and position fields.

**Acceptance link:** `CP-FLOW-CONTRACT`, `CP-FLOW-LATE`.

**Review focus:** Confirm that a transition cannot apply a hidden travel cost.

### Phase 13 — Settlement actions

**Result:** The settlement provides `Talk`, `Wait`, `Journal`, and `Leave` as contextual actions. `Wait` adds one Overworld hour only while the Local Contract is Available or Accepted. Other settlement activity does not advance time. Dialogue uses short text only and has no speech or branching tree.

**Requirements closed:** REQ-022, REQ-024, REQ-098.

**Phase check:** Use each action in each applicable Local Contract state. Compare campaign time before and after each action.

**Acceptance link:** `CP-FLOW-CONTRACT`, `CP-UI-HUD`.

**Review focus:** Confirm that ordinary interaction never advances campaign time.

### Phase 14 — Local Contract offer

**Result:** Only `Talk` with the contract-giver Agent opens the offer. The offer shows all specified facts and the current Local Contract state before `Accept` or `Decline`. While the contract is Accepted, the top-left display contains only `Defend the settlement` and 24-hour campaign time.

**Requirements closed:** REQ-023, REQ-091.

**Phase check:** Open the offer through valid and invalid interactions. Accept it and inspect the passive display.

**Acceptance link:** `CP-FLOW-CONTRACT`, `CP-UI-HUD`.

**Review focus:** Confirm that another action or Agent cannot open the offer.

### Phase 15 — Save-safe snapshot

**Result:** Manual save and load are available only in `Safe non-combat`. A versioned plain snapshot contains every specified campaign field. It excludes active battle, setup, resolution, transient interface and camera state, and runtime objects.

**Requirements closed:** REQ-124, REQ-126, REQ-127.

**Phase check:** Request snapshots at every save-safe boundary. Accept only the safe requests. Validate every included and excluded field.

**Acceptance link:** `CP-SAVE-BOUNDARY`, `CP-SAVE-RESTORE`.

**Review focus:** Confirm that no unsafe or runtime object can enter a snapshot.

### Phase 16 — Slots, autosave, and restore

**Result:** The Simulation interface accepts target-tick commands, exact ticks, projections, feedback events, and validated snapshot restore. Gameplay uses one injected seeded random source and persists its state when necessary. Storage has three manual slots and one separate rolling autosave. A successful Scene transition writes the autosave. Restore replaces state only after validation and rebuild succeed.

**Requirements closed:** REQ-112, REQ-115, REQ-125, REQ-128, REQ-129.

**Phase check:** Save distinct states in all entries. Restore each state and its random source exactly. Cause one rebuild failure and confirm that the prior campaign remains active.

**Acceptance link:** `CP-SAVE-RESTORE`, `CP-ARCH-DETERMINISM`.

**Review focus:** Confirm that manual load does not write an autosave.

### Phase 17 — Storage failures and deletion

**Result:** Campaign saves stay in browser-local storage. Old, corrupt, and unreadable entries show an unavailable reason and are not migrated. Denied or full storage keeps the campaign playable in memory, disables storage actions, shows a persistent failure, and provides Retry. Slot deletion and full reset require confirmation.

**Requirements closed:** REQ-010, REQ-130, REQ-131, REQ-132.

**Phase check:** Exercise each failure, Retry, one-slot deletion, full reset, and new campaign creation. Confirm that no false success or unintended deletion occurs.

**Acceptance link:** `CP-SAVE-FAILURE`, `CP-SAVE-RESTORE`.

**Review focus:** Confirm that a storage failure never changes the in-memory campaign.

### Phase 18 — Journal

**Result:** The Journal shows Local Contract state, deadline, Band, equipment, Coin, Provisions, saves, and persistent consequences. It provides preparation access. It provides manual save and load in the Overworld and settlement when the state is safe.

**Requirements closed:** REQ-025, REQ-133.

**Phase check:** Open the Journal in the Overworld and settlement, before and after contract acceptance. Confirm all values and save-control states against the Simulation projection.

**Acceptance link:** `CP-FLOW-CONTRACT`, `CP-PREP-RECRUIT`, `CP-SAVE-BOUNDARY`.

**Review focus:** Confirm that the Journal stores no campaign value.

### Phase 19 — Recruitment and equipment

**Result:** The Journal offers four fixed Troop candidates before battle. The player can recruit zero to four Troops. Each confirmed recruitment costs 25 Coin once. Insufficient Coin or a started raid changes no state. The player, Companion, and Troops use only their fixed loadouts. The default accepted preparation has two Troops and 50 Coin.

**Requirements closed:** REQ-078, REQ-079, REQ-080, REQ-081, REQ-088.

**Phase check:** Exercise zero through four recruits, repeated selection, insufficient Coin, and recruitment after raid start. Inspect Band state and Coin after each command.

**Acceptance link:** `CP-PREP-RECRUIT`.

**Review focus:** Confirm that recruitment cannot make Coin negative.

## Combat and Band command

### Phase 20 — Combatant physics

**Result:** Common Combatant state has explicit policies for each role. Social identity, Agent relationship, and Agent fate stay outside that state. Rapier runs on the main thread and owns authoritative capsule movement, collision, and queries. Each role has the specified health, movement, and zero-health values.

**Requirements closed:** REQ-054, REQ-116, REQ-123.

**Phase check:** Create one Combatant of each role. Compare base values, policy, collision result, and separation from social state.

**Acceptance link:** `CP-COMBAT-DAMAGE`, `CP-COMBAT-CASUALTY`, `CP-COMMAND-AI`.

**Review focus:** Do not use one role policy as a substitute for social identity.

### Phase 21 — Combat movement and pause

**Result:** Combat uses a stable over-the-shoulder camera and camera-relative `WASD` movement without target lock. Movement uses the specified speed for preview, guard, wind-up, active, and recovery states. `Escape` pauses active combat. `Space` and dodge do nothing. Save and load stay unavailable until a safe state. Scenes show one unlabeled red health bar.

**Requirements closed:** REQ-040, REQ-047, REQ-048, REQ-090.

**Phase check:** Move in each combat action state, rotate the camera, pause, and try all unavailable actions. Measure movement and inspect authoritative state.

**Acceptance link:** `CP-COMBAT-INPUT`, `CP-UI-HUD`, `CP-SAVE-BOUNDARY`.

**Review focus:** Confirm that camera state cannot change a Simulation result.

### Phase 22 — Directional attack

**Result:** Primary-button press starts attack preview at the pointer origin. A drag inside 24 CSS pixels has no sector. A larger screen-relative drag selects one of four sectors and can revise it while held. Release commits the attack and charges stamina. Guard can cancel only wind-up and gives no stamina refund. An active attack continues through recovery.

**Requirements closed:** REQ-041, REQ-046.

**Phase check:** Exercise the dead zone, all sectors, preview revision, release, wind-up cancellation, active-state guard input, and recovery.

**Acceptance link:** `CP-COMBAT-INPUT`.

**Review focus:** Confirm that pointer coordinates stay in CSS pixels.

### Phase 23 — Directional Guard

**Result:** Secondary-button hold in Directional Guard mode uses the same four sectors. A changed sector becomes effective after 0.25 seconds. A matching guard prevents all damage and gives 0.30 seconds of attacker recoil. A mismatch gives full damage. The center control and stamina bar appear only during attack preview or Directional Guard selection.

**Requirements closed:** REQ-042, REQ-045, REQ-092.

**Phase check:** Exercise all matching and mismatching sectors before and after the change delay. Inspect damage, recoil, control visibility, and selected sector.

**Acceptance link:** `CP-COMBAT-GUARD`, `CP-UI-HUD`.

**Review focus:** Confirm that a visual sector change does not become effective early.

### Phase 24 — Shield and stamina

**Result:** The player uses the fixed sword-and-shield loadout. `Q` changes guard mode only while idle. Shield Block becomes active in 0.20 seconds and blocks all sectors. It drains stamina and causes no attacker recoil. At zero stamina, it gives a 0.40-second stagger. All Combatants use the specified attack, guard, regeneration, exhaustion, and re-enable values.

**Requirements closed:** REQ-043, REQ-044, REQ-052, REQ-053.

**Phase check:** Measure shield raise, all-sector blocks, and all stamina rates. Measure regeneration delay, zero-stamina release, stagger, and action re-enable at 12 stamina.

**Acceptance link:** `CP-COMBAT-GUARD`.

**Review focus:** Confirm that the player attacks with the sword in both guard modes.

### Phase 25 — Weapon damage

**Result:** Sword and staff sectors use the specified damage, wind-up, and recovery values. A committed attack follows its authored weapon path. It can hit each valid enemy once and can hit more than one enemy. There are no hit zones, armor rules, target falloff, or friendly fire. A miss or interruption causes no damage.

**Requirements closed:** REQ-049, REQ-050, REQ-051.

**Phase check:** Run the full sector matrix, one miss, one interrupted attack, one friendly overlap, and one multi-target path. Compare all health changes and timings.

**Acceptance link:** `CP-COMBAT-DAMAGE`.

**Review focus:** Confirm one damage result per target for one committed attack.

### Phase 26 — Casualties

**Result:** A Troop or ordinary bandit uses one seeded draw at zero health. A value below 0.20 gives Downed. Other values give killed. Downed and killed Combatants leave active combat and look the same until resolution. Post-victory player, Companion, and Troop results use the specified health and availability rules.

**Requirements closed:** REQ-056, REQ-057, REQ-058, REQ-095.

**Phase check:** Exercise every role and random values on both sides of 0.20. Try later targeting and damage. Compare battle presentation with post-battle state.

**Acceptance link:** `CP-COMBAT-CASUALTY`, `CP-UI-FATE`.

**Review focus:** Confirm that inactive Combatants cannot receive a second result.

### Phase 27 — Command groups

**Result:** The Companion and recruited Troops are separate Command groups. Each valid Follow, Hold position, and Engage order has the specified behavior and feedback. Invalid group selection and invalid Hold keep the prior state. Target loss causes the specified next-tick behavior. Hold markers and off-screen indicators show the authoritative position.

**Requirements closed:** REQ-061, REQ-062, REQ-063, REQ-094.

**Phase check:** Exercise all orders, an absent group, and an inactive group. Exercise an impassable Hold point, an off-screen marker, and target loss.

**Acceptance link:** `CP-COMMAND-GROUPS`.

**Review focus:** Confirm that an invalid order does not remove the prior order or marker.

### Phase 28 — Raid behavior

**Result:** The rules apply to the Companion, Troops, enemy Agent, bandits, armed residents, and unarmed residents. They specify pressure, strikes, targets, guards, flight, and objectives. At most two raiders have a committed attack in wind-up or active state at one time.

**Requirements closed:** REQ-055, REQ-059, REQ-064, REQ-065, REQ-066.

**Phase check:** Sample each fixed tick in a seeded raid. Check pressure values, strike values, targets, resident states, and the committed-raider count.

**Acceptance link:** `CP-COMMAND-AI`.

**Review focus:** Confirm that all five residents remain valid raid targets while active.

## Battle flow and consequences

### Phase 29 — Bridge setup

**Result:** A deadline reached in the settlement starts 15 real-time seconds of bridge setup without a deployment screen. The player can move and place Companion and Troop Hold markers. The river has one bridge and no other crossing. The Band and five residents start on one side. The six raiders start on the other side. The battle Band can contain the player, Companion, and zero to four recruited Troops.

**Requirements closed:** REQ-008, REQ-027, REQ-033.

**Phase check:** Start setup with zero, two, and four Troops. Inspect the timer, positions, collision, markers, and the one valid crossing.

**Acceptance link:** `CP-FLOW-EARLY`, `CP-COMMAND-GROUPS`.

**Review focus:** Confirm that setup does not advance campaign time.

### Phase 30 — Late settlement entry

**Result:** A deadline that passes while the Band is outside does not stop Overworld travel. Later settlement entry starts the settlement-center battle at once. It has five residents and no setup window.

**Requirements closed:** REQ-028.

**Phase check:** Cross the deadline outside, continue travel, and enter the boundary. Record the transition through the first settled battle state.

**Acceptance link:** `CP-FLOW-LATE`.

**Review focus:** Confirm that no bridge setup state occurs on the late path.

### Phase 31 — Outcome freeze and defeat

**Result:** After all effects in each tick, battle outcome guards run in priority order. The first true guard becomes terminal. Active combat freezes on that tick. A defeat skips survivor and Feat choices, shows current losses, and returns the Band to the damaged settlement.

**Requirements closed:** REQ-029, REQ-031, REQ-037.

**Phase check:** Trigger Band defeat and resident-loss defeat on the same and on different ticks. Confirm guard priority, one terminal result, no later combat effect, and no victory-only choice.

**Acceptance link:** `CP-FLOW-DEFEAT`.

**Review focus:** Confirm that input cannot change a terminal outcome.

### Phase 32 — Enemy Agent fate

**Result:** The enemy Agent becomes Downed, not killed, at zero health. Victory presents the kneeling Agent in an open field with `Release`, `Capture`, and `Execute`. Confirmation is necessary. Only the governed Agent fate transitions and command rejections can occur.

**Requirements closed:** REQ-068, REQ-096.

**Phase check:** Exercise each choice, cancel before confirmation, repeat a confirmed command, and try each invalid transition.

**Acceptance link:** `CP-REL-RELEASE`, `CP-REL-CAPTURE`, `CP-REL-EXECUTE`, `CP-UI-FATE`.

**Review focus:** Confirm that only an Active Agent has a Disposition.

### Phase 33 — Relationships and reactions

**Result:** Varek's fate choices and contract failure apply the exact Village Elder and Varek Disposition and Grievance changes. The changed state first appears after return to the settlement. Grievances remain. After resolution or failure, preparation is read-only, Village Elder has the authored reaction, and retry is unavailable.

**Requirements closed:** REQ-168, REQ-169.

**Phase check:** Exercise Release, Capture, Execute, and failure. Compare the Village Elder and Varek records before choice, before return, and after return.

**Acceptance link:** `CP-REL-RELEASE`, `CP-REL-CAPTURE`, `CP-REL-EXECUTE`, `CP-REL-FAILURE`.

**Review focus:** Confirm that a settlement or faction score does not replace Agent state.

### Phase 34 — Ordinary-bandit fates

**Result:** After the enemy Agent choice, victory gives one aggregate `Release`, `Capture`, or `Execute` choice for all Downed ordinary bandits. It skips the choice when none are Downed. The result updates bandit records and Captive count only. It does not change a named Agent relationship.

**Requirements closed:** REQ-070, REQ-071, REQ-072.

**Phase check:** Exercise zero, one, and multiple Downed bandits for each choice. Inspect bandit records, killed records, Captive count, and all Agent records.

**Acceptance link:** `CP-REL-RELEASE`, `CP-REL-CAPTURE`, `CP-REL-EXECUTE`.

**Review focus:** Confirm that killed bandits never enter the aggregate choice.

### Phase 35 — Victory Feat

**Result:** After the survivor decisions and victory summary, the player must select one of the three specified Feats. The selected effect applies at once and stays for the slice. The Journal shows it. Victory gives one Feat, including late victory. Defeat gives none. Troops do not progress. A Feat adds no new control.

**Requirements closed:** REQ-073, REQ-074, REQ-075, REQ-076.

**Phase check:** Compare base and selected values for all three Feats. Exercise early victory, late victory, defeat, and a second-choice attempt.

**Acceptance link:** `CP-FEAT`.

**Review focus:** Confirm that each Feat changes only its specified player action.

### Phase 36 — Victory resolution

**Result:** Victory resolves the enemy Agent, ordinary survivors, summary, and Feat in the specified sequence. Every result summary contains all specified fields. Early victory makes the settlement Safe. Late victory makes it Damaged. The Settlement condition changes once. The Local Contract gives no Coin or Provisions reward.

**Requirements closed:** REQ-030, REQ-034, REQ-038, REQ-086.

**Phase check:** Complete early and late victories with each survivor result. Inspect sequence, summary, Settlement condition, Local Contract state, Coin, and Provisions.

**Acceptance link:** `CP-FLOW-EARLY`, `CP-FLOW-LATE`, `CP-SPEC-END-TO-END`.

**Review focus:** Confirm that the summary is complete before the Feat choice.

### Phase 37 — Contract and Simulation closure

**Result:** The Playable Vertical Slice contains all required combat roles and result paths. The Local Contract follows only its governed transitions. Every illegal campaign or battle command keeps authoritative state unchanged and emits a typed invalid-action response. The Simulation owns all gameplay named in the architecture contract.

**Requirements closed:** REQ-009, REQ-036, REQ-039, REQ-114.

**Phase check:** Traverse every Local Contract transition and rejection. Run the command validity matrix in each campaign and battle state. Inspect adapter writes to gameplay state.

**Acceptance link:** `CP-FLOW-CONTRACT`, `CP-FLOW-EARLY`, `CP-FLOW-LATE`, `CP-FLOW-DEFEAT`, `CP-ARCH-DETERMINISM`.

**Review focus:** Confirm that no adapter applies a gameplay result.

## Presentation and audio

### Phase 38 — Visual and interface contract

**Result:** The Playable Vertical Slice completes and harmonizes the visual assets delivered by earlier playable phases. It presents the specified frontier, one Overworld, one compact settlement, and the specified population, and it gives the player no magic. All visible content uses one representative low-poly woodcut visual language. All player-facing terms are canonical. All essential panels use semantic HTML and CSS. Pointer, keyboard, and DOM actions use one target-tick command stream. Normal keyboard-and-mouse play is usable through this stream.

**Requirements closed:** REQ-006, REQ-007, REQ-015, REQ-016, REQ-089, REQ-097, REQ-119.

**Phase check:** Inspect the Overworld, settlement, bridge, settlement center, all required Combatants, every panel, and each input source. Confirm that assets introduced by earlier phases now form one consistent representative visual set. Use normal keyboard-and-mouse input for the required Overworld, settlement, combat, command, and DOM actions. Run the canonical-term and runtime-asset checks.

**Acceptance link:** `CP-UI-HUD`, `CP-UI-FATE`, `CP-SPEC-END-TO-END`, `CP-ARCH-DETERMINISM`, `CP-SUPPORT-GATE`, `CP-SPEC-AUDIT`.

**Review focus:** Confirm that no representative Scene, Combatant, weapon, or interactable is first introduced by this phase. Confirm that generated assets are not runtime dependencies and that unsupported input modes do not create a second command path or support promise.

### Phase 39 — Audio readiness and interface

**Result:** Web Audio starts only after an explicit user action. Before campaign start, the product shows the exact audio readiness state. Failure blocks gameplay and provides Retry. Movement and interaction use the specified simple cues. Interface cues are sparse and passive HUD changes are silent.

**Requirements closed:** REQ-103, REQ-106, REQ-109.

**Phase check:** Exercise not-ready, ready, failure, and Retry. Record movement, interaction, Journal, save, load, choice, invalid action, and passive HUD events.

**Acceptance link:** `CP-AUDIO`.

**Review focus:** Confirm that audio failure cannot be reported as ready.

### Phase 40 — Combat and command audio

**Result:** The mix uses the required priority and ducking. Attack and guard use four distinct sector contours and separate sword and staff materials. Combat events, valid and invalid orders, settlement state changes, and the one Agent Downed reaction use the specified cues. Spatial and centered audio use the specified event groups. Combat results are readable without explanatory combat text.

**Requirements closed:** REQ-093, REQ-099, REQ-100, REQ-101, REQ-102, REQ-104, REQ-105, REQ-108.

**Phase check:** Run the sector, block, hit, miss, order, outcome, Agent Downed, ducking, spatial, and centered event matrix. Confirm that forbidden and duplicate cues are absent.

**Acceptance link:** `CP-AUDIO`, `CP-COMBAT-GUARD`, `CP-COMMAND-GROUPS`.

**Review focus:** Confirm that audio does not explain or decide a combat result.

### Phase 41 — Ambient music and presentation authority

**Result:** One restrained ambient music loop plays outside combat. It ducks for combat and outcomes, fades for survivor-fate choice, and does not adapt. Rendering, DOM, HUD, and audio read only Simulation projections and typed feedback events. Missing presentation does not change gameplay.

**Requirements closed:** REQ-107, REQ-110.

**Phase check:** Compare the same seeded command stream with all presentation active and with each presentation adapter disabled. Gameplay state and outcome stay equal.

**Acceptance link:** `CP-AUDIO`, `CP-ARCH-DETERMINISM`.

**Review focus:** Confirm that presentation failure has no write path to the Simulation.

## Evidence and final acceptance

### Phase 42 — Acceptance harness and catalog

**Result:** The product uses the specified audio, persistence, navigation, content, and scenario ports and typed manifests. Vitest provides browser-independent checks. Playwright provides browser checkpoints and captures. The exact scenario catalog contains stable names, unsigned seeds, reset commands, target-tick transcripts, required paths, and fixed checkpoint identifiers.

**Requirements closed:** REQ-120, REQ-122, REQ-141, REQ-148.

**Phase check:** Validate the complete scenario catalog. Run one browser-independent scenario and one browser scenario through the public Simulation interface.

**Acceptance link:** `CP-SPEC-AUDIT`, `CP-ARCH-DETERMINISM`.

**Review focus:** Confirm that the browser and harness use the same gameplay interface.

### Phase 43 — Checkpoint evidence data

**Result:** Every required checkpoint emits a validated machine-readable snapshot and conventional assertions. The generated evidence manifest contains every required identity, input, state, result, path, artifact, and metric field. Every catalog mapping exists. A scenario resets, applies only its exact public commands, and stops at fixed checkpoints. It cannot force an outcome after start.

**Requirements closed:** REQ-143, REQ-144, REQ-149, REQ-150.

**Phase check:** Run every scenario to every checkpoint. Validate each snapshot, assertion set, manifest field, and scenario-to-checkpoint mapping.

**Acceptance link:** `CP-SPEC-AUDIT` and all mapped gameplay checkpoints.

**Review focus:** Confirm that a test-only action cannot change a started scenario result.

### Phase 44 — Visual evidence and provenance

**Result:** Static visual claims use stable PNG captures after two rendered frames. Transition, timing, and audio claims use WebM clips of no more than 8 seconds. Failed runs keep all required diagnostics. Acceptance rejects missing, stale, manual, or unlinked evidence.

**Requirements closed:** REQ-145, REQ-146, REQ-147, REQ-151.

**Phase check:** Produce valid static and transition evidence. Then use controlled missing, stale, manual, unlinked, and failed-run cases. Confirm the required accept, reject, and preservation results.

**Acceptance link:** `CP-SPEC-AUDIT`, `CP-UI-HUD`, `CP-UI-FATE`, `CP-AUDIO`.

**Review focus:** Confirm that each artifact links to its build, scenario, seed, transcript, checkpoint, and tick.

### Phase 45 — Deterministic replay

**Result:** Two clean runs use the same scenario, seed, build, and transcript. They produce identical actors, timing, state, events, and random state. They also produce identical artifact metadata and outcomes. A different diagnostic seed cannot replace the acceptance seed.

**Requirements closed:** REQ-142.

**Phase check:** Run the deterministic replay scenario twice from a clean reset and compare all required hashes and records.

**Acceptance link:** `CP-ARCH-DETERMINISM`.

**Review focus:** Confirm that gameplay does not use ambient browser randomness or `Math.random`.

### Phase 46 — Complete journey

**Result:** One offline-style, single-player browser journey starts with frontier preparation. It resolves the timed defense Local Contract. It ends in the changed settlement with persistent human and material consequences.

**Requirements closed:** REQ-001.

**Phase check:** Run the early victory, late victory, and defeat journeys from new campaign to changed settlement. Confirm that every transition is legal and every consequence persists.

**Acceptance link:** `CP-SPEC-END-TO-END`.

**Review focus:** Confirm that each journey starts through public player input and ends without a retry path.

### Phase 47 — Representative gameplay quality

**Result:** Directional melee, personal Band leadership, and one visible Agent relationship or Grievance consequence have representative quality. A competent first complete playthrough takes 45 to 60 minutes. The bridge battle takes 3 to 5 active minutes. The settlement-center battle takes 4 to 6 active minutes.

**Requirements closed:** REQ-002, REQ-003, REQ-060.

**Phase check:** Run the fixed competent-player acceptance paths. Record full-play and battle durations. Review combat, command, and Agent-consequence evidence at representative quality.

**Acceptance link:** `CP-SPEC-END-TO-END`, `CP-PERFORMANCE`, `CP-UI-FATE`.

**Review focus:** Change tuning only when a measured target or representative-quality priority needs it.

### Phase 48 — Promised-row performance

**Result:** The seeded bridge battle runs on the promised row. Its average frame time is at most 16.67 milliseconds. Its 95th-percentile frame time is at most 33.33 milliseconds. Frame rate does not stay below 30 frames per second for more than 1.00 second.

**Requirements closed:** REQ-139, REQ-140.

**Phase check:** Run the fixed performance scenario at the promised viewport and device-pixel ratio. Record average frame time, 95th-percentile frame time, and every continuous interval below 30 frames per second.

**Acceptance link:** `CP-PERFORMANCE`.

**Review focus:** Accept a performance change only with measured evidence from the promised row.
