# Bold and Brave Playable Vertical Slice Requirements

This document specifies the active product, delivery, evidence, and scope requirements for the Playable Vertical Slice. Each source note links the requirement to `.scratch/playable-vertical-slice/spec.md`.

## REQ-001 — Complete playable journey

**Statement:** The product shall deliver one offline-style, single-player browser journey that starts with frontier preparation, resolves one timed defense Local Contract, and ends in the changed settlement with persistent human and material consequences.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-SPEC-END-TO-END`, a complete recorded run passes when it demonstrates one offline-style, single-player browser journey that starts with frontier preparation, resolves one timed defense Local Contract, and ends in the changed settlement with persistent human and material consequences. |

**Notes:** Source: `PVS-PUR-001`.

## REQ-002 — Representative-quality priorities

**Statement:** The product shall prioritize representative quality for directional melee, personal Band leadership, and a visible Agent relationship or Grievance consequence.

| Attribute | Value |
| --- | --- |
| Type | Quality (representative quality) |
| Status | Active |
| Verification | At `CP-SPEC-END-TO-END`, evidence passes when directional melee and personal Band leadership are each demonstrated as representative-quality priorities; at `CP-UI-FATE`, evidence passes when a visible Agent relationship or Grievance consequence is demonstrated as a representative-quality priority. |

**Notes:** Source: `PVS-PUR-002`.

## REQ-003 — First-playthrough duration

**Statement:** For representative-quality acceptance, a competent first complete playthrough shall take 45–60 minutes of real time.

| Attribute | Value |
| --- | --- |
| Type | Quality (duration) |
| Status | Active |
| Verification | At `CP-SPEC-END-TO-END`, a timed competent first complete playthrough passes when its elapsed real time is from 45 through 60 minutes. |

**Notes:** Source: `PVS-PUR-003`.

## REQ-004 — Deliberate scope simplicity

**Statement:** IF more detail does not improve a representative-quality priority, THEN the phase plan shall keep the Overworld, dialogue, settlement simulation, economy, and content volume deliberately simple unless it records the reason for departure and preserves all MUST behavior.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-SPEC-AUDIT`, each listed area passes when it remains deliberately simple where more detail does not improve a representative-quality priority, or when the phase plan records the reason for departure and shows that all MUST behavior is preserved. |

**Notes:** Source: `PVS-PUR-004`.

## REQ-005 — Self-contained contract

**Statement:** The contract shall be self-contained and shall not require a phase planner to reopen a resolved domain, architecture, evidence, tuning, or support decision.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable. This requirement is not an acceptance condition. |

**Notes:** Deprecated because phase planning cannot reliably guarantee that the contract contains every fact needed without reopening a decision. No replacement.

## REQ-006 — Frontier setting and player magic

**Statement:** The Playable Vertical Slice shall present a grounded low-fantasy, late-medieval frontier that feels dangerous, adventurous, and politically messy, with no magic available to the player.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-UI-HUD` and `CP-SPEC-AUDIT` pass when player-visible setting, content, capabilities, and text convey the specified frontier and provide no player magic. |

**Notes:** Source: `PVS-SCP-001`.

## REQ-007 — Playable population and spaces

**Statement:** The Playable Vertical Slice shall provide one compact settlement, one free-roaming 3D Overworld, one fixed Companion, four recruitable Troop candidates, one enemy Agent, five ordinary bandits, and five generic settlement residents.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-SPEC-END-TO-END` and `CP-PREP-RECRUIT` pass when the playable content contains the specified spaces and the exact specified counts and roles. |

**Notes:** Source: `PVS-SCP-002`.

## REQ-008 — Battle Band composition

**Statement:** The Playable Vertical Slice shall allow a battle Band consisting of the player character, the Companion, and zero to four recruited Troops.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-PREP-RECRUIT` and `CP-COMMAND-GROUPS` pass when battles allow the player character and Companion with each supported recruited-Troop count from zero through four. |

**Notes:** Source: `PVS-SCP-003`.

## REQ-009 — Required roles and resolutions

**Statement:** The Playable Vertical Slice shall include one-handed sword, shield, and staff roles; a bridge defense; a late settlement-center defense; survivor-fate resolution; Agent consequences; and one player Feat choice after victory.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-SPEC-END-TO-END` passes when an end-to-end run demonstrates all three roles, both defense locations in their applicable runs, survivor-fate resolution, Agent consequences, and exactly one post-victory player Feat choice. |

**Notes:** Source: `PVS-SCP-004`.

## REQ-010 — Local operation and campaign saves

**Statement:** The Playable Vertical Slice shall operate without an account, backend, or server-owned gameplay state and shall store campaign saves in the browser.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-SAVE-RESTORE` passes when a campaign save is stored in the browser and restores the campaign state, and `CP-SPEC-AUDIT` passes when operation requires no account or backend and uses no server-owned gameplay state. |

**Notes:** Source: `PVS-SCP-005`.

## REQ-011 — WebGPU-only rendering

**Statement:** The Playable Vertical Slice shall use Three.js with WebGPU-only rendering and reject Three.js WebGL fallback before gameplay.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-SUPPORT-GATE` passes when inspection and runtime evidence show that all gameplay rendering uses Three.js WebGPU, no WebGL rendering path enters gameplay, and a forced Three.js WebGL fallback is detected and rejected before gameplay. |

**Notes:** Source: `PVS-SCP-006`.

## REQ-012 — Promised machine

**Statement:** The support promise shall include only Chromium 151.0.7922.137 on Linux x64 with an NVIDIA RTX 2070 SUPER and driver 610.57.04 and shall exclude the Linux distribution version.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-SUPPORT-GATE` passes when the specified browser, operating-system architecture, GPU, and driver row passes the gate, and the recorded support promise names no Linux distribution version or other row. |

**Notes:** Source: `PVS-SCP-007`.

## REQ-013 — Promised-row test display

**Statement:** Acceptance testing of the promised row shall use a 1920 × 1080 CSS-pixel viewport and a device-pixel ratio no greater than 1.0.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-SUPPORT-GATE` and `CP-PERFORMANCE` pass when their promised-row evidence records a 1920 × 1080 CSS-pixel viewport and a device-pixel ratio of 1.0 or less. |

**Notes:** Source: `PVS-SCP-008`.

## REQ-014 — WebGPU startup gates

**Statement:** The Playable Vertical Slice shall require a secure context, a physical WebGPU adapter, a usable device, and core WebGPU capabilities only, and shall request the `high-performance` adapter preference as a hint.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-SUPPORT-GATE` passes when each of a secure context, a physical WebGPU adapter, and a usable device is required; each missing required condition, including selection of a software adapter, is rejected; device creation requests no capability beyond core WebGPU; and `high-performance` is supplied as a nonbinding adapter-preference hint that does not cause rejection of an otherwise qualifying adapter solely because the preference is unmet. |

**Notes:** Source: `PVS-SCP-009`.

## REQ-015 — Input and support exclusions

**Statement:** The Playable Vertical Slice shall support normal keyboard-and-mouse play without making a keyboard-only, touch, mobile, reduced-motion, other-browser, other-GPU, or other-driver support promise.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-SUPPORT-GATE` passes when normal keyboard-and-mouse input is usable on the promised row, and `CP-SPEC-AUDIT` passes when support materials make none of the excluded promises. |

**Notes:** Source: `PVS-SCP-010`.

## REQ-016 — Canonical player-facing terms

**Statement:** WHEN a canonical term appears in player-facing gameplay text, the Playable Vertical Slice shall use the term and meaning defined in `CONTEXT.md` and the specification terminology table.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-SPEC-AUDIT`, compare all player-facing gameplay text with the canonical terminology and pass when each governed term uses the canonical name and meaning. |

**Notes:** Source: `spec.md`, Section 2 canonical terminology contract.

## REQ-017 — New campaign start position

**Statement:** A new campaign shall start on the Overworld outside the settlement entry boundary, 1.5 world units or 0.5 Overworld day at normal movement speed from the settlement.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-FLOW-CONTRACT`, start a new campaign and confirm that the Band is on the Overworld, outside the settlement entry boundary, and that the route to the settlement is 1.5 world units and takes 0.5 Overworld day at normal movement speed. |

**Notes:** Source: `PVS-FLW-001`.

## REQ-018 — Overworld movement and time

**Statement:** The Overworld shall support direct click-to-move on traversable ground, camera rotation, and camera zoom; campaign time and Provisions consumption shall advance only while the Band moves and shall stop while the Band is stationary or paused.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-CONTRACT` and `CP-PREP-PROVISIONS`, click traversable Overworld ground and confirm direct Band movement, rotate and zoom the camera, and observe that campaign time and Provisions change during movement but remain unchanged while the Band is stationary or paused. |

**Notes:** Source: `PVS-FLW-002`.

## REQ-019 — Overworld pause and time speed

**Statement:** On the Overworld, `Space` shall pause or unpause movement and time, and keys `1`, `2`, `3`, and `4` shall select 1×, 2×, 3×, and 4× time speed and unpause a paused Overworld.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-CONTRACT`, use `Space` during Overworld movement and confirm that movement and time stop and resume; while paused, use each speed key and confirm that movement and time resume at the selected 1×, 2×, 3×, or 4× speed. |

**Notes:** Source: `PVS-FLW-003`.

## REQ-020 — Overworld time scaling

**Statement:** At 1× speed, one Overworld hour shall pass in 5 real-time seconds, and the selected speed multiplier shall apply equally to movement, campaign time, and Provisions consumption without changing the distance-based result.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-CONTRACT` and `CP-PREP-PROVISIONS`, confirm that 5 real-time seconds at 1× advances one Overworld hour, compare 1× through 4× travel over the same route, and confirm proportional movement, time, and Provisions rates with the same final distance-based Provisions result. |

**Notes:** Source: `PVS-FLW-004`.

## REQ-021 — Settlement Scene entry and layout

**Statement:** The Simulation shall load the one settlement Scene automatically when the Band crosses the settlement entry boundary and shall keep the bridge and settlement center as areas in that Scene.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-CONTRACT` and `CP-FLOW-LATE`, cross the settlement entry boundary and confirm automatic loading of one settlement Scene in which both the bridge and settlement center are reachable areas without another Scene load. |

**Notes:** Source: `PVS-FLW-005`.

## REQ-022 — Settlement contextual actions and dialogue

**Statement:** Settlement play shall provide `Talk`, `Wait`, `Journal`, and `Leave` as contextual actions and shall use short text-only dialogue without a branching conversation tree.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-FLOW-CONTRACT` and `CP-UI-HUD`, enter settlement play and confirm that all four contextual actions are available and that each dialogue is short, text-only, and has no branching conversation tree. |

**Notes:** Source: `PVS-FLW-006`.

## REQ-023 — Local Contract offer

**Statement:** Only `Talk` with the contract-giver Agent shall open the Local Contract offer, which shall show the objective, bridge, enemy Agent, five bandits, one-Feat victory reward, zero-Coin reward, settlement risk, and current Local Contract state before `Accept` or `Decline`.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-CONTRACT`, try each settlement action and confirm that only `Talk` with the contract-giver Agent opens the offer; before choosing `Accept` or `Decline`, confirm that every specified offer detail is visible. |

**Notes:** Source: `PVS-FLW-007`.

## REQ-024 — Settlement time advancement

**Statement:** Each `Wait` command shall advance campaign time by 1 Overworld hour while the Local Contract is Available or Accepted, and ordinary settlement interaction, bridge setup, and battle shall not advance campaign time.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-CONTRACT` and `CP-FLOW-EARLY`, use `Wait` while the Local Contract is Available and confirm an advance of 1 Overworld hour. While it is Accepted with at least 1 Overworld hour remaining before the Raid deadline, use `Wait` and confirm an advance of 1 Overworld hour. While it is Accepted with less than 1 Overworld hour remaining, use `Wait` and confirm that campaign time advances only to the exact Raid deadline and bridge setup starts. Perform ordinary settlement interaction, complete bridge setup, and run a battle, and confirm that these activities do not advance campaign time. |

**Notes:** Source: `PVS-FLW-008`.

## REQ-025 — Journal contents and preparation access

**Statement:** The Journal shall show the Local Contract state, the Raid deadline after acceptance, Band members, equipment, Coin, Provisions, saves, and persistent consequences and shall provide access to preparation.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-CONTRACT` and `CP-PREP-RECRUIT`, open the Journal before and after acceptance and confirm all specified information, including the deadline only after acceptance, and confirm that preparation is accessed through the Journal. |

**Notes:** Source: `PVS-FLW-009`.

## REQ-026 — Settlement exit

**Statement:** The `Leave` action shall return the Band to the Overworld at the settlement boundary without changing campaign time, Provisions, Local Contract state, or Band state.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-CONTRACT`, record campaign time, Provisions, Local Contract state, and Band state, use `Leave`, and confirm Overworld placement at the settlement boundary with all recorded values unchanged. |

**Notes:** Source: `PVS-FLW-010`.

## REQ-027 — Bridge setup

**Statement:** WHEN the Raid deadline is reached while the Band is in the settlement, bridge setup shall start and provide 15 real-time seconds to move and place Companion and Troop Hold markers without a separate deployment screen.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-EARLY`, reach the Raid deadline in the settlement and confirm immediate bridge setup in the current Scene, a 15-real-time-second setup interval, and the ability to move and place Companion and Troop Hold markers without opening a separate deployment screen. |

**Notes:** Source: `PVS-FLW-011`.

## REQ-028 — Late settlement entry battle

**Statement:** WHEN the Raid deadline passes while the Band is outside the settlement, Overworld travel shall continue, and entry into the settlement after the deadline shall start the settlement-center battle immediately without a deployment window.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-LATE`, remain on the Overworld as the deadline passes and confirm uninterrupted travel; then enter the settlement and confirm that the settlement-center battle starts immediately with no deployment window. |

**Notes:** Source: `PVS-FLW-012`.

## REQ-029 — Combat outcome freeze

**Statement:** On the first Simulation tick that produces an outcome, active combat shall freeze and move directly to victory resolution or the defeat summary, with no further attacks, movement, damage, or Simulation time.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-EARLY` and `CP-FLOW-DEFEAT`, produce victory and defeat outcomes and confirm on the first outcome tick that combat freezes, the correct resolution view opens directly, and attacks, movement, damage, and Simulation time do not continue. |

**Notes:** Source: `PVS-FLW-013`.

## REQ-030 — Victory resolution sequence

**Statement:** After victory, the Simulation shall resolve the enemy Agent fate, resolve all Downed ordinary bandits with one aggregate choice when any exist, show the outcome summary, offer one Feat, and then return the Band to the changed settlement.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-EARLY` and `CP-FEAT`, win battles with and without Downed ordinary bandits and confirm the ordered sequence: enemy Agent fate, one aggregate bandit choice only when applicable, outcome summary, one Feat choice, and return to the changed settlement. |

**Notes:** Source: `PVS-FLW-014`.

## REQ-031 — Defeat resolution sequence

**Statement:** After defeat, the Simulation shall skip all survivor-fate choices and the Feat choice, show the current losses, and return the Band to the changed settlement.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-DEFEAT`, produce a defeat and confirm that no survivor-fate or Feat choice appears, that the current losses are shown, and that the Band returns to the changed settlement. |

**Notes:** Source: `PVS-FLW-015`.

## REQ-032 — Post-result restrictions and reactions

**Statement:** After a Resolved or Failed result, the Journal shall be read-only for contract and preparation changes, `Talk` with both named settlement Agents shall show their changed authored reactions, and no retry shall be available.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Deprecated |
| Verification | Not applicable; REQ-169 replaces this requirement. |

**Notes:** Source: `PVS-FLW-016`. Deprecated because the approved content decision removed the Affected-resident Agent and left Village Elder as the only settlement Agent with a relationship record. Replaced by REQ-169.

## REQ-033 — Bridge battlefield layout

**Statement:** The river shall be impassable except at the bridge; both banks shall have small staging and formation areas with limited flanking room and no alternate crossing; the Band and five residents shall start on the settlement side, and the six raiders shall start on the far bank.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-FLOW-EARLY`, confirm that movement cannot cross the river except by the bridge, that each bank has a small staging and formation area with limited flanking room, that no alternate crossing exists, and that the specified groups start on opposite banks. |

**Notes:** Source: `PVS-FLW-020`.

## REQ-034 — Outcome summary contents

**Statement:** Every outcome summary shall show victory or defeat, Band and resident casualties, resolved enemy survivor fates, Captive count, Settlement condition, and Local Contract state.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-SPEC-END-TO-END` and `CP-FLOW-DEFEAT`, open victory and defeat summaries, including a victory with resolved enemy survivors, and confirm that each summary shows every applicable specified field and value. |

**Notes:** Source: `PVS-FLW-021`.

## REQ-035 — Extensible free-roaming Overworld

**Statement:** The phase plan shall keep the Overworld free-roaming and keep its travel model able to add more locations without changing this slice's one-destination behavior, unless the phase plan records a reason for departure and preserves all source MUST behavior.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-SPEC-AUDIT`, inspect the phase plan and confirm either that it keeps the Overworld free-roaming and keeps its travel model able to add more locations without changing this slice's one-destination behavior, or that the phase plan records a reason for departure and preserves all source MUST behavior. |

**Notes:** Source: `PVS-FLW-022`.

## REQ-036 — Local Contract state transitions

**Statement:** The Local Contract shall implement exactly the state transitions and required results specified in the governed state table.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-CONTRACT`, `CP-FLOW-EARLY`, `CP-FLOW-LATE`, and `CP-FLOW-DEFEAT`, exercise every governed table row, including each guard boundary, and confirm the specified current state, trigger, guard, next state, deadline behavior, time change, battle or setup start, command rejection, and read-only result. For every Local Contract state, also exercise every contract command or event not enabled by a table row and every false-guard case, and confirm that no Local Contract state transition occurs. Inspect the implemented transition definition and confirm that it contains no transition outside the governed table. |

**Notes:** Source: `PVS-FLW-017`. Governed state table: Available + Enter settlement -> Available, normal settlement play, no Raid deadline; Available + Leave while in settlement -> Available, return to Overworld with no Local Contract change; Available + Decline while offer is open -> Available, close offer and create no deadline; Available + Wait while in settlement -> Available, advance 1 Overworld hour and do not create or advance a Raid timer; Available + Accept while offer is open -> Accepted, set deadline to current campaign time + 12 Overworld hours. Accepted + Wait while in settlement before deadline -> Accepted, advance up to 1 Overworld hour and start bridge setup at the exact deadline; Accepted + Leave while in settlement with no active battle -> Accepted, return to Overworld with the same deadline; Accepted + deadline reached while Band is in settlement -> Accepted, start bridge setup at the exact deadline; Accepted + deadline passes while Band is in Overworld -> Accepted, continue travel without interruption; Accepted + Enter settlement before deadline -> Accepted, normal settlement play; Accepted + Enter settlement at or after deadline -> Accepted, start settlement-center battle immediately; Accepted + battle victory when all raiders are Downed or killed and no defeat condition is true -> Resolved, start survivor-fate resolution; Accepted + battle defeat when all Band members are defeated or no settlement residents remain -> Failed, start defeat summary. Resolved or Failed + any contract command -> same state, reject command and keep contract record read-only.

## REQ-037 — Battle outcome state transitions

**Statement:** After all effects of each 60 Hz Simulation tick, the battle shall evaluate the outcome guards in priority order, apply the first true row, and retain a terminal outcome while ignoring gameplay input until a valid resolution command occurs.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-EARLY`, `CP-FLOW-LATE`, and `CP-FLOW-DEFEAT`, create each guard condition, including simultaneous victory and defeat conditions, and confirm evaluation after the tick, defeat priority, the specified state and Local Contract result, continued fixed ticks only when no guard is true, and ignored gameplay input after Victory or Defeat until a valid resolution command. |

**Notes:** Source: `PVS-FLW-018`. Governed state table after each 60 Hz tick: priority 1, Active battle + no active settlement resident -> Defeat, freeze battle, Local Contract Failed; priority 2, Active battle + every Band member Downed or killed -> Defeat, freeze battle, Local Contract Failed; priority 3, Active battle + enemy Agent and all five bandits Downed or killed -> Victory, freeze battle, Local Contract Resolved; priority 4, Active battle + no prior guard true -> Active battle, continue next fixed tick. Victory or Defeat + any battle input -> same terminal outcome, ignore gameplay input until the next valid resolution command.

## REQ-038 — Settlement condition transition

**Statement:** The Settlement condition shall remain unset before an outcome, shall transition once according to Raid location and battle outcome, and shall remain unchanged for the rest of the slice.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-EARLY`, `CP-FLOW-LATE`, and `CP-FLOW-DEFEAT`, confirm that Settlement condition is unset before an outcome; produce a bridge victory, a settlement-center victory, a bridge defeat, and a settlement-center defeat; confirm the specified Settlement condition and visible consequence in each case, and confirm that the condition does not change afterward. |

**Notes:** Source: `PVS-FLW-019`. Governed state table: Bridge + Victory -> Safe, show an intact changed settlement and successful reactions; Settlement center + Victory -> Damaged, show damage and apply successful-defense Agent and Feat rules; Bridge or settlement center + Defeat -> Damaged, show damage, hostile settlement-Agent reactions, and the defeat record. Unset before outcome is not a third Settlement condition.

## REQ-039 — Invalid gameplay command response

**Statement:** IF a campaign or battle command is illegal in the current state, THEN the Simulation shall keep the authoritative state unchanged and emit a typed invalid-action response.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FLOW-CONTRACT`, `CP-FLOW-EARLY`, `CP-FLOW-LATE`, `CP-FLOW-DEFEAT`, `CP-COMBAT-INPUT`, and `CP-COMMAND-GROUPS`, exercise each command outside its legal state or with a false guard and pass when state does not change and the invalid-action response occurs. |

**Notes:** Source: `spec.md`, Sections 3 and 4 failure contracts.

## REQ-040 — Combat camera and movement

**Statement:** The combat camera shall provide a stable over-the-shoulder view, camera-relative `WASD` movement, readable active exchanges and spacing, and no target lock.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-COMBAT-INPUT` and `CP-UI-HUD`, representative movement and combat pass when the view remains stable, `WASD` directions follow the camera, exchanges and spacing remain readable, and no target-lock control or state is available. |

**Notes:** Source: `PVS-COM-001`.

## REQ-041 — Directional attack input

**Statement:** WHEN the primary button is pressed, the attack shall start a preview at the pointer origin, ignore drag within a 24-CSS-pixel target dead zone, map further screen-relative drag to Up/Overhead, Left cut, Right cut, or Down/Thrust, preserve and revise the preview while held, and commit on release.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMBAT-INPUT`, controlled presses, drags, holds, revisions, and releases pass when preview starts at the pointer origin, drag through 24 CSS pixels does not select a sector, the preview and its current sector remain preserved while the button is held, further held drag can revise the preview to the corresponding one of four sectors, and release commits it. |

**Notes:** Source: `PVS-COM-002`.

## REQ-042 — Directional Guard input

**Statement:** WHILE the secondary button is held in Directional Guard mode, guard selection shall use the four-sector drag vocabulary, make a changed sector effective only after 0.25 seconds, and end on release.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMBAT-GUARD`, four-direction secondary-button drags pass when they select the matching sectors, each changed sector remains ineffective during the 0.25-second guard transition and becomes effective when that transition completes, and releasing the button ends the guard. |

**Notes:** Source: `PVS-COM-003`.

## REQ-043 — Fixed combat loadouts and guard modes

**Statement:** The player character shall have a fixed sword-and-shield loadout, use `Q` only while idle to toggle between sword Directional Guard and Shield Block, and attack with the sword in both modes; the Companion shall have a fixed sword loadout, and each Troop shall have a fixed staff loadout.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-COMBAT-GUARD` and `CP-PREP-RECRUIT`, loadout and input checks pass when the player character has the fixed sword-and-shield loadout, idle `Q` alternates the two guard modes, non-idle `Q` does not toggle them, both modes retain sword attacks, the Companion has the fixed sword loadout, every Troop has the fixed staff loadout, and attempts to change any of those fixed loadouts do not change them. |

**Notes:** Source: `PVS-COM-004`.

## REQ-044 — Shield Block behavior

**Statement:** Shield Block shall become active in 0.20 seconds, block all four sectors while held, drain stamina continuously, cause no attacker recoil, and end with a 0.40-second blocker stagger when stamina reaches zero.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMBAT-GUARD`, Shield Block passes when it becomes active after 0.20 seconds, blocks attacks from every sector while held, continuously reduces stamina, produces no attacker recoil, and at zero stamina ends and staggers the blocker for 0.40 seconds. |

**Notes:** Source: `PVS-COM-005`.

## REQ-045 — Directional Guard outcomes

**Statement:** A matching Directional Guard shall negate all damage and cause 0.30 seconds of attacker recoil, while a mismatched Directional Guard shall fail and apply full attack damage.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMBAT-GUARD`, attacks against each guard sector pass when matching sectors cause zero damage and 0.30 seconds of attacker recoil, while mismatched sectors cause the full fixed damage and no successful guard. |

**Notes:** Source: `PVS-COM-006`.

## REQ-046 — Attack commitment and guard cancellation

**Statement:** A committed attack shall charge stamina on release, permit cancellation into guard only during wind-up without a stamina refund, and continue through recovery after it becomes active.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMBAT-INPUT` and `CP-COMBAT-GUARD`, phase-controlled attacks pass when release deducts attack stamina, guard cancels only during wind-up and does not restore stamina, guard cannot cancel the active phase, and an active attack reaches and completes recovery. |

**Notes:** Source: `PVS-COM-007`.

## REQ-047 — Combat-action movement speeds

**Statement:** Movement shall remain available at 75% of base speed during preview or guard, 80% during wind-up, and 65% during active or recovery phases.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-COMBAT-INPUT`, measured movement in each action phase passes when movement remains possible and equals 75%, 80%, or 65% of the applicable base speed as specified. |

**Notes:** Source: `PVS-COM-008`.

## REQ-048 — Battle pause and unavailable actions

**Statement:** During battle, `Space` shall have no action, dodge shall be unavailable, `Escape` shall pause or resume active combat, and save and load shall remain unavailable until a save-safe point.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-COMBAT-INPUT` and `CP-SAVE-RESTORE`, battle input passes when `Space` causes no state change, no dodge can be initiated, repeated `Escape` pauses and resumes combat, and save and load remain unavailable before a save-safe point. |

**Notes:** Source: `PVS-COM-009`.

## REQ-049 — Weapon sector values

**Statement:** The combat model shall measure damage in health points and timing in seconds, apply the weapon-sector values and relative roles in the Notes, add 0.10 seconds to each matching sword wind-up for a staff, and use the same recovery for matching sword and staff sectors.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-COMBAT-DAMAGE`, all eight weapon-sector cases pass when damage, wind-up, and recovery equal the listed values; each staff wind-up is 0.10 seconds longer than its matching sword wind-up; matching sword and staff recoveries are equal; for each weapon, Overhead has the highest listed damage and a hit reaction at least as long as every other sector, Thrust has reach at least as long as every other sector, and Left cut and Right cut have the same listed damage, wind-up, and recovery. |

**Notes:** Source: `PVS-COM-010`. Values: Sword—Overhead: 24 health points, 0.65-second wind-up, 0.55-second recovery, highest sword damage and longest hit reaction; Left cut: 20, 0.55, 0.45, balanced side path; Right cut: 20, 0.55, 0.45, balanced side path; Thrust: 16, 0.45, 0.60, longest sword reach. Staff—Overhead: 20 health points, 0.75-second wind-up, 0.55-second recovery, highest staff damage and longest hit reaction; Left cut: 16, 0.65, 0.45, balanced side path; Right cut: 16, 0.65, 0.45, balanced side path; Thrust: 13, 0.55, 0.60, longest staff reach.

## REQ-050 — Weapon-path damage

**Statement:** Each committed attack shall sweep its authored weapon path against every valid enemy, apply full fixed damage without target falloff, and damage each target no more than once.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMBAT-DAMAGE`, multi-target path sweeps pass when the authored weapon path is tested against every valid enemy, each unblocked valid enemy hit by the path receives the full fixed damage without reduction for distance or target order, and no target receives attack damage more than once from the committed attack. Successful guards and blocks shall produce the outcomes specified by `PVS-COM-005` and `PVS-COM-006`. |

**Notes:** Source: `PVS-COM-011`.

## REQ-051 — Health and damage exclusions

**Statement:** Each Combatant shall use one health value, without hit zones, armor calculations, or friendly fire, and a missed or interrupted attack shall cause no damage.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-COMBAT-DAMAGE`, damage cases pass when each Combatant exposes one health value, impact location does not change damage, no armor calculation occurs, allied strikes cause zero damage, and missed or interrupted attacks leave health unchanged. |

**Notes:** Source: `PVS-COM-012`.

## REQ-052 — Stamina values

**Statement:** Every Combatant shall have 100 maximum stamina, spend 12 stamina per committed attack, start regeneration after a 1.2-second delay, regenerate 25 stamina per second, spend 6 stamina per second on Directional Guard, and spend 18 stamina per second on Shield Block.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-COMBAT-GUARD`, measured stamina traces pass when the maximum is 100, each committed attack deducts 12, regeneration starts after 1.2 seconds and proceeds at 25 per second, Directional Guard drains 6 per second, and Shield Block drains 18 per second. |

**Notes:** Source: `PVS-COM-013`.

## REQ-053 — Zero-stamina exhaustion

**Statement:** WHEN stamina reaches zero, the Combatant shall end any guard, disable attack and guard actions, start regeneration after 1.2 seconds without stamina spending, and re-enable combat actions when stamina reaches 12.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMBAT-GUARD`, exhaustion traces pass when zero stamina immediately ends guard and rejects attack and guard input, uninterrupted regeneration begins after 1.2 seconds, actions remain disabled below 12 stamina, and they become available at 12. |

**Notes:** Source: `PVS-COM-014`.

## REQ-054 — Combatant base values

**Statement:** Each Combatant role shall use the maximum health, base movement, and zero-health result in the Notes, with movement measured in world units per real-time second and health measured in health points.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-COMBAT-DAMAGE`, `CP-COMBAT-CASUALTY`, and `CP-COMMAND-AI`, each role passes when its maximum health equals the listed value, one real-time second of unobstructed base movement covers the listed world-unit distance, and zero health produces the listed result, including the seeded draw for probabilistic rows. |

**Notes:** Source: `PVS-COM-015`. Base values: Player character—100 health points, 3.5 world units/second, Downed; Companion—100, 3.4, Downed; Troop—70, 3.0, 20% Downed and 80% killed from the seeded draw; Enemy Agent—110, 2.8, Downed; Ordinary bandit—40, 2.6, 20% Downed and 80% killed from the seeded draw; Settlement resident—100, 2.0, killed.

## REQ-055 — Engage pressure and enemy strikes

**Statement:** The Companion shall have a baseline Engage pressure of 5 health points per second, each Troop shall have 8 health points per second, and each enemy strike shall deal 12 health points, show its sector for 0.80 seconds, and use a 2.1-second baseline strike interval.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-COMMAND-AI`, sustained Engage behavior and enemy strikes pass when Companion and Troop baseline pressure rates are 5 and 8 health points per second respectively, each successful unblocked enemy strike deals 12 health points, the sector telegraph lasts 0.80 seconds, and the baseline strike interval is 2.1 seconds. Guarded and blocked strikes shall produce the outcomes specified by `PVS-COM-005` and `PVS-COM-006`. |

**Notes:** Source: `PVS-COM-016`.

## REQ-056 — Seeded casualty draw

**Statement:** Each Troop or ordinary-bandit zero-health event shall use one seeded random value, with a value below 0.20 producing Downed and a value at or above 0.20 producing killed.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMBAT-CASUALTY`, controlled seeded draws pass when each qualifying zero-health event consumes exactly one value, values below 0.20 produce Downed, and values of 0.20 or greater produce killed. |

**Notes:** Source: `PVS-COM-017`.

## REQ-057 — Inactive casualty state

**Statement:** Downed and killed Combatants shall leave active combat immediately, remain non-targetable, invulnerable, and visually indistinguishable from each other until post-battle resolution, and receive no revival during battle.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMBAT-CASUALTY` and `CP-UI-FATE`, both casualty states pass when they immediately leave active combat, cannot be selected or damaged, remain visually indistinguishable from each other until post-battle resolution, and are not revived during battle. |

**Notes:** Source: `PVS-COM-018`.

## REQ-058 — Post-victory casualty results

**Statement:** WHEN victory occurs, a Downed player character or Companion shall return with 25 health points, a Downed Troop shall remain at 0 health points and unavailable, and a killed Troop shall be removed from the Band.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMBAT-CASUALTY`, victory resolution passes when each Downed player character or Companion has 25 health points, each Downed Troop has 0 health points and cannot be used, and each killed Troop no longer appears in the Band. |

**Notes:** Source: `PVS-COM-019`.

## REQ-059 — Settlement resident setup and behavior

**Statement:** Each battle setup shall include five settlement residents, with two armed residents who defend above 20 health points and flee at or below 20 health points, three unarmed residents who flee from the start, and all five remaining valid raid targets.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-FLOW-LATE` and `CP-COMMAND-AI`, each setup passes when it contains exactly two armed and three unarmed residents, armed residents switch from defense to flight at 20 health points or less, unarmed residents flee immediately, and every resident remains selectable by raiders as a valid target. |

**Notes:** Source: `PVS-COM-020`.

## REQ-060 — Battle completion time

**Statement:** For representative-quality acceptance, a competent player who commands the Band and uses directional defense shall complete the bridge battle in 3–5 minutes and the settlement-center battle in 4–6 minutes of active real time.

| Attribute | Value |
| --- | --- |
| Type | Quality (performance) |
| Status | Active |
| Verification | At `CP-PERFORMANCE` and `CP-SPEC-END-TO-END`, representative competent-player runs pass when the player commands the Band and uses directional defense, the bridge battle completes within 3–5 minutes, and the settlement-center battle completes within 4–6 minutes, excluding paused time. |

**Notes:** Source: `PVS-COM-021`.

## REQ-061 — Command group selection and orders

**Statement:** The Simulation shall expose the Companion and recruited Troops as two independently selected Command groups and apply the order behavior and feedback in the Notes; when no Troop is recruited, it shall reject selection of or an order to the Troop group and keep the current state, and when a group has no active member, it shall reject selection of or an order to that group and keep the current state.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMMAND-GROUPS`, selection and order sequences pass when the two groups can be selected independently, each valid `Follow`, `Hold`, and `Engage` order produces its listed transition, behavior, and feedback, and each absent or inactive group rejects selection or orders without changing the current state. |

**Notes:** Source: `PVS-CMD-001`. `Follow`: cancel the prior Hold marker or Engage target; keep the Companion near the player's flank; form Troops in a compact line behind or beside the player; attack only nearby threats without chasing away from the player; show formation movement and one nonverbal response after issue. `Hold`: enter marker placement; accept one traversable world position; anchor the group around the visible marker; defend locally without advancing; show the marker, group movement, and an off-screen direction indicator. `Engage`: cancel the Hold marker; advance in role-appropriate formation toward the nearest active enemy that threatens the group without player selection of one enemy; show formation advance and a target change in state projection.

## REQ-062 — Invalid Hold point

**Statement:** WHEN a proposed Hold point is on impassable ground, the order shall be rejected, the previous order and Hold marker shall remain unchanged, the proposed marker shall show the invalid state, and the invalid-order cue shall occur.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMMAND-GROUPS`, an attempted Hold placement on impassable ground passes when the group retains its previous order and marker, the proposed marker visibly changes to the invalid state, and the invalid-order cue occurs. |

**Notes:** Source: `PVS-CMD-002`.

## REQ-063 — Group behavior after target loss

**Statement:** WHEN an Engage target leaves active combat, the Engage group shall select the nearest remaining active threat on the next fixed tick. A Follow group shall return to formation. A Hold group shall return to its marker unless a nearby enemy requires self-defense.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMMAND-GROUPS`, an Engage target-loss case passes when the Engage group selects the nearest remaining active threat on the next fixed tick. Separate Follow and Hold cases pass when a Follow group returns to formation and a Hold group returns to its marker unless a nearby enemy requires self-defense. |

**Notes:** Source: `PVS-CMD-003`.

## REQ-064 — Raider target selection

**Statement:** The enemy Agent shall coordinate pressure and primarily engage the player, remain able to protect a threatened bandit cluster briefly or reopen the raid escape route, and make each bandit select the nearest hostile Combatant within the raid objective.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMMAND-AI`, raid behavior passes when the Agent coordinates raider pressure and primarily engages the player, can briefly switch to protect a threatened bandit cluster or reopen the raid escape route, and each bandit selects the nearest hostile Combatant within the raid objective. |

**Notes:** Source: `PVS-CMD-004`.

## REQ-065 — Raider attack concurrency

**Statement:** At most two raiders shall be in committed attack wind-up or active phases at one time, and all other raiders shall circle, reposition, or guard nearby allies.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-COMMAND-AI`, raid combat passes when the combined count of raiders in committed wind-up or active phases never exceeds two and every other raider is observably circling, repositioning, or guarding a nearby ally. |

**Notes:** Source: `PVS-CMD-005`.

## REQ-066 — Raider and resident objectives

**Statement:** Raiders shall try to kill all settlement residents, armed residents shall defend according to their health rule, and unarmed residents shall flee.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMMAND-AI` and `CP-FLOW-DEFEAT`, raid runs pass when raiders continue to pursue the death of all settlement residents, armed residents defend above 20 health points and flee at or below 20, and unarmed residents flee from the start. |

**Notes:** Source: `PVS-CMD-006`.

## REQ-067 — Initial named-Agent state

**Statement:** The relationship model shall create only the Contract-giver Agent as `Active` and `Neutral` with no Grievances, the Affected-resident Agent as `Active` and `Neutral` with no Grievances, and the Enemy Agent as `Active` and `Hostile` with no Grievances, and exclude generic residents from the model.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable; REQ-167 replaces this requirement. |

**Notes:** Source: `PVS-REL-001`. Deprecated because the approved content decision removed the Affected-resident Agent and defined exact identities for the two remaining relationship records. Replaced by REQ-167.

## REQ-068 — Agent fate transitions

**Statement:** The Agent fate logic shall make the Enemy Agent Downed rather than killed at zero health in battle and apply only the governed fate transitions, guards, Disposition rules, and command rejections.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-REL-RELEASE`, `CP-REL-CAPTURE`, `CP-REL-EXECUTE`, and `CP-REL-FAILURE`, transition runs show that zero health makes the Enemy Agent Downed rather than killed; every row of the governed table produces exactly its specified next Agent fate, Disposition rule, Grievance side effect, and rejection result when its trigger and guard apply; and no current-fate/trigger combination absent from the table, or listed transition whose guard is false, produces an Agent fate, Disposition, or Grievance change. |

**Notes:** Source: `PVS-REL-002`. Governed state table: `Active` + becomes Downed in battle, while battle remains active, → `Active` and retains the current Disposition until resolution; `Active` + battle defeat, while the Enemy Agent is active or Downed, → `Active` and sets `Hostile` from the failure relationship outcome; `Active` + `Release`, while the Enemy Agent is Downed after victory, → `Active` and sets the relationship-table outcome Disposition; `Active` + `Capture`, while the Enemy Agent is Downed after victory, → `Captive`, removes the Disposition, and adds `Agent captured`; `Active` + `Execute`, while the Enemy Agent is Downed after victory, → `Executed` and removes the Disposition; `Captive` + any fate command → `Captive`, rejects the command, and has no Disposition; `Executed` + any fate command → `Executed`, rejects the command, and has no Disposition.

## REQ-069 — Relationship outcomes

**Statement:** The relationship state shall apply the governed changes when the Enemy Agent fate choice is confirmed or the contract fails, show the changes first when the player returns to the settlement, and retain all Grievances during the slice.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Deprecated |
| Verification | Not applicable; REQ-168 replaces this requirement. |

**Notes:** Source: `PVS-REL-003`. Deprecated because the approved content decision removed every Affected-resident Agent outcome. Replaced by REQ-168.

## REQ-070 — Ordinary-bandit survivor choice

**Statement:** The victory flow shall, after the Enemy Agent decision, present one aggregate `Release`, `Capture`, or `Execute` choice for all Downed ordinary bandits when at least one is Downed and otherwise skip the step.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-REL-RELEASE`, `CP-REL-CAPTURE`, and `CP-REL-EXECUTE`, a victory with Downed ordinary bandits shows one aggregate three-option choice after the Enemy Agent decision, while a victory with none Downed proceeds without that choice. |

**Notes:** Source: `PVS-REL-004`.

## REQ-071 — Ordinary-bandit survivor outcomes

**Statement:** The aggregate ordinary-bandit choice shall record all affected bandits as released after `Release`, add their count to Captives after `Capture`, or record them as executed after `Execute`, while leaving killed bandits unchanged.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-REL-CAPTURE` and `CP-REL-EXECUTE`, outcome records for the three choice permutations show every affected Downed bandit as released, added to the Captive count, or executed as selected, and show no change to killed bandits. |

**Notes:** Source: `PVS-REL-005`.

## REQ-072 — Named-Agent isolation from ordinary-bandit choice

**Statement:** The aggregate ordinary-bandit choice shall not change any named-Agent Disposition or Grievance.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-REL-RELEASE`, `CP-REL-CAPTURE`, and `CP-REL-EXECUTE`, named-Agent Disposition and Grievance snapshots taken before and after each aggregate ordinary-bandit choice are identical. |

**Notes:** Source: `PVS-REL-006`.

## REQ-073 — Victory Feat selection and effects

**Statement:** The victory flow shall, after both applicable survivor decisions and the victory summary, require exactly one choice from `Rapid Guard`, `Rapid Attack`, or `Rapid Stamina` before normal settlement play resumes, apply the selected governed effect immediately and permanently for this slice, and show the selection in the Journal.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FEAT`, the Feat choice appears after both applicable survivor decisions and the victory summary and before normal settlement play resumes; it offers exactly `Rapid Guard`, `Rapid Attack`, and `Rapid Stamina` and permits exactly one selection. The selected effect is applied immediately, remains in force for the rest of the slice, and is shown in the Journal. `Rapid Guard` multiplies Directional Guard transition time and Shield Block raise time by 0.80 and yields base values of 0.20 seconds and 0.16 seconds; `Rapid Attack` multiplies every player-character attack wind-up and recovery time by 0.80 without changing damage or stamina cost; and `Rapid Stamina` changes regeneration from 25 to 30 stamina per second without changing the 1.2-second regeneration delay. |

**Notes:** Source: `PVS-FEA-001`. Governed Feats: `Rapid Guard` multiplies Directional Guard transition time and Shield Block raise time by 0.80, making the base values 0.20 seconds and 0.16 seconds respectively; `Rapid Attack` multiplies all player-character attack wind-up and recovery times by 0.80 without changing damage or stamina cost; `Rapid Stamina` increases player-character stamina regeneration from 25 to 30 stamina per second and keeps the 1.2-second regeneration delay.

## REQ-074 — Victory Feat eligibility

**Statement:** Each bridge or settlement-center victory shall be eligible for one Feat, including a victory that leaves the settlement `Damaged`.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-FEAT`, bridge and settlement-center victory runs, including a run with the settlement left `Damaged`, each proceed to one Feat selection. |

**Notes:** Source: `PVS-FEA-002`.

## REQ-075 — Feat and Troop progression limits

**Statement:** The progression flow shall grant no Feat after defeat and, during the slice, offer neither a second Feat nor any Troop progression.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-FEAT` and `CP-REL-FAILURE`, a defeat run shows no Feat choice or grant, and a completed victory run exposes no second Feat choice and no Troop progression during the slice. |

**Notes:** Source: `PVS-FEA-003`.

## REQ-076 — Feat action scope

**Statement:** Each Feat shall modify only an existing player action and add neither a new control nor a broader progression tree.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-FEAT`, each selected Feat changes only its specified existing player action, and the available controls and progression choices contain no additions. |

**Notes:** Source: `PVS-FEA-004`.

## REQ-077 — Initial preparation resources

**Statement:** The initial campaign state shall give the player character 100 Coin and 10.0 Provisions and add Miro (`poc-companion`) as the one fixed Companion for 0 Coin.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-PREP-RECRUIT` passes when a new campaign shows 100 Coin, 10.0 Provisions, and Miro (`poc-companion`) as the fixed Companion, with no Coin deducted for Miro. |

**Notes:** Source: `PVS-PRP-001`.

## REQ-078 — Troop recruitment cost

**Statement:** Before battle, preparation shall offer four fixed Troop candidates, permit recruitment of zero to four Troops, charge 25 Coin exactly once for each recruited Troop, and prevent a negative Coin value.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-PREP-RECRUIT` passes when four fixed Troop candidates are available before battle, selections from zero through four are accepted, each recruited Troop causes one 25-Coin deduction, and no recruitment can reduce Coin below zero. |

**Notes:** Source: `PVS-PRP-002`.

## REQ-079 — Fixed equipment

**Statement:** The equipment configuration shall give every Troop the fixed staff loadout, the Companion the fixed sword loadout, and the player character the fixed sword-and-shield loadout, with no equipment selection.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-PREP-RECRUIT` and `CP-COMBAT-GUARD` pass when every Troop has the fixed staff loadout, the Companion has the fixed sword loadout, the player character has the fixed sword-and-shield loadout, and no equipment-selection function is provided. |

**Notes:** Source: `PVS-PRP-003`.

## REQ-080 — Journal recruitment availability

**Statement:** WHILE the Local Contract is Available or Accepted and no battle is active, the Journal shall make recruitment available and shall immediately persist recruited Band membership and the Coin cost.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-PREP-RECRUIT` and `CP-SAVE-RESTORE` pass when recruitment is available from the Journal while the Local Contract is Available or Accepted and no battle is active, and a recruitment immediately persists both the new Band membership and the Coin deduction, including across save and restore. |

**Notes:** Source: `PVS-PRP-004`.

## REQ-081 — Default battle preparation

**Statement:** For representative-quality acceptance, the default authored battle preparation shall include the Companion and two recruited Troops, cost 50 Coin, and leave 50 Coin.

| Attribute | Value |
| --- | --- |
| Type | Quality (suitability) |
| Status | Active |
| Verification | `CP-PREP-RECRUIT` and `CP-PERFORMANCE` pass for the representative authored preparation when the battle starts with the Companion and two recruited Troops and the campaign state records a 50-Coin total cost and 50 Coin remaining. |

**Notes:** Source: `PVS-PRP-005`.

## REQ-082 — Moving travel consumption rate

**Statement:** During moving Overworld travel, Provisions consumption shall be 0.2 Provisions per current Band member per Overworld day, counting the player character, the Companion, and recruited non-killed Troops and excluding Captives.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-PREP-PROVISIONS` passes when one moving Overworld day reduces Provisions by 0.2 times the count of the player character, Companion, and recruited non-killed Troops, with no consumption contribution from Captives. |

**Notes:** Source: `PVS-PRP-006`.

## REQ-083 — Consumption remainder

**Statement:** Moving travel shall accumulate Band-member-days, subtract 0.1 Provisions and 0.5 Band-member-day from the remainder for each accumulated 0.5 Band-member-day, and persist the remainder without consumption changes across save and load.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-PREP-PROVISIONS` and `CP-SAVE-RESTORE` pass when each accumulated 0.5 Band-member-day causes one 0.1-Provision deduction and a 0.5 reduction of the remainder, and interrupted travel with save and load produces the same remainder and total consumption as uninterrupted travel. |

**Notes:** Source: `PVS-PRP-007`.

## REQ-084 — Provisions floor and display

**Statement:** Provisions shall be stored and shown to one decimal place, clamped at 0.0, and, at 0.0, shall not block travel or add any morale, health, speed, combat, or relationship effect.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-PREP-PROVISIONS` passes when stored and displayed Provisions use one decimal place, attempted consumption below zero leaves 0.0, travel remains available at 0.0, and no listed effect or modifier is applied. |

**Notes:** Source: `PVS-PRP-008`.

## REQ-085 — Non-moving consumption exclusions

**Statement:** Provisions shall not be consumed during stationary Overworld time, Overworld pause, settlement interaction, Scene loading, bridge setup, battle, or post-battle resolution.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-PREP-PROVISIONS` passes when the Provisions value and consumption remainder remain unchanged throughout each listed non-moving state. |

**Notes:** Source: `PVS-PRP-009`.

## REQ-086 — Local Contract reward

**Statement:** The Local Contract shall give no Coin or Provisions reward and shall describe the one victory Feat as the expected mechanical reward.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-FLOW-CONTRACT` and `CP-FEAT` pass when Local Contract completion adds no Coin or Provisions and the displayed reward description identifies the one victory Feat as the expected mechanical reward. |

**Notes:** Source: `PVS-PRP-010`.

## REQ-087 — Excluded preparation systems

**Statement:** The phase plan shall not add an equipment shop, item inventory, equipment durability, Provisions purchase, resupply, provision loot, custom Troop equipment, or Troop progression.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable. This requirement is not an acceptance condition. |

**Notes:** Deprecated because `OUT OF SCOPE` clauses are no longer normative acceptance requirements. No replacement.

## REQ-088 — Recruitment interaction and failure

**Statement:** WHEN the player recruits a named Troop candidate through the Journal, the interface shall require confirmation of the 25-Coin cost; IF the Band has less than 25 Coin or the raid has started, THEN recruitment shall fail without changing campaign state.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-PREP-RECRUIT`, select each named candidate, confirm the displayed 25-Coin cost, and pass when valid recruitment updates the Band and Coin once; attempts with less than 25 Coin or after the raid starts pass when they show rejection and leave candidate availability, Band membership, and Coin unchanged. |

**Notes:** Source: `spec.md`, Section 6 input and failure contracts.

## REQ-089 — Representative visual language

**Statement:** The presentation shall use stylized low-poly realism, strong silhouettes, woodcut colors, restrained flat shading, and exaggerated combat readability, and generated assets shall be development aids only and not runtime dependencies.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-UI-HUD`, representative Scenes show all specified visual traits; at `CP-SPEC-AUDIT`, the runtime dependency record and a production build show no generated-asset dependency. |

**Notes:** Source: `PVS-UI-001`.

## REQ-090 — Scene camera and health display

**Statement:** Scenes shall use a third-person camera and shall show one unlabeled red health bar at the bottom of the screen.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-UI-HUD`, each representative Scene uses a third-person view and shows exactly one red health bar at the screen bottom with no label. |

**Notes:** Source: `PVS-UI-002`.

## REQ-091 — Accepted Local Contract HUD

**Statement:** WHILE the Local Contract is Accepted, the top-left display shall show only `Defend the settlement` and the current campaign time in 24-hour `HH:MM` form, with no other passive status panel.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-UI-HUD`, an Accepted Local Contract shows the exact objective text and the current campaign time value rendered in 24-hour `HH:MM` form; the top-left area contains only those two items, and the rest of the display contains no additional passive status panel. |

**Notes:** Source: `PVS-UI-003`.

## REQ-092 — Sector control and stamina display

**Statement:** WHILE Attack preview or Directional Guard selection is active, the display shall show at screen center one white semi-transparent four-sector control with an opaque selected sector and one small white semi-transparent stamina bar directly below it, and shall otherwise hide the control.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-UI-HUD` and `CP-COMBAT-INPUT`, Attack preview and Directional Guard selection each show the specified centered control, selected-sector opacity, and stamina-bar placement; all other sampled states show no four-sector control. |

**Notes:** Source: `PVS-UI-004`.

## REQ-093 — Combat result readability

**Statement:** The presentation shall distinguish attack sector, correct Directional Guard, Shield Block, hit, struck, missed, interrupted, Downed, and killed results through pose, motion, flash, or audio combinations, without explanatory combat text.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMBAT-GUARD` and `CP-AUDIO`, each listed result produces an observable combination that is distinct from the other listed results, and no sampled result displays explanatory combat text. |

**Notes:** Source: `PVS-UI-005`.

## REQ-094 — Hold position markers

**Statement:** The presentation shall show each active Hold position as a visible world-space marker and, WHEN a marker is off-screen, shall show a subtle direction indicator without an explanatory status panel.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-COMMAND-GROUPS`, every active Hold position has a world-space marker when visible; moving each marker off-screen produces a subtle direction indicator and no explanatory status panel. |

**Notes:** Source: `PVS-UI-006`.

## REQ-095 — Combatant fate concealment

**Statement:** The presentation shall use the same battle-pose family for Downed and killed Combatants and shall not reveal which ordinary Combatants survived before post-battle resolution.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-COMBAT-CASUALTY` and `CP-UI-FATE`, sampled Downed and killed Combatants use the same battle-pose family, and no presentation channel—including visuals, text, or audio—identifies which ordinary Combatants survived before post-battle resolution. |

**Notes:** Source: `PVS-UI-007`.

## REQ-096 — Enemy Agent fate choice

**Statement:** The presentation shall show the enemy Agent fate beside the kneeling Agent in an open field, with an adjacent DOM option box containing `Release`, `Capture`, and `Execute`, and shall require confirmation before the state transition.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-UI-FATE`, the fate view places the choice beside the kneeling Agent in an open field, shows all three exact options in an adjacent DOM box, and leaves state unchanged until the selected option is confirmed. |

**Notes:** Source: `PVS-UI-008`.

## REQ-097 — Semantic DOM panels

**Statement:** The Journal, Local Contract, save controls, error states, Feat choice, and survivor-fate choices shall use plain semantic HTML and CSS DOM panels, with essential text and actions outside the canvas.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-UI-HUD` and `CP-SUPPORT-GATE`, markup and rendered views for every listed panel use semantic HTML with CSS and expose all essential text and actions as DOM content outside the canvas. |

**Notes:** Source: `PVS-UI-009`.

## REQ-098 — Text-only dialogue

**Statement:** Dialogue shall use text only and shall not use speech.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-UI-HUD` and `CP-AUDIO`, every representative dialogue event displays text and produces no spoken-dialogue audio. |

**Notes:** Source: `PVS-UI-010`.

## REQ-099 — Audio mix priority

**Statement:** The audio mix shall rank, from highest to lowest, combat-critical feedback; command cues and Band responses; Agent Downed feedback and settlement outcome cues; movement and interaction; interface cues; and ambience and music, and combat-critical events shall duck all lower groups.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-AUDIO`, simultaneous playback preserves the specified six-level order, and each combat-critical event causes an observable level reduction in every lower group for its duration. |

**Notes:** Source: `PVS-AUD-001`. Combat-critical feedback includes directional attacks, blocks, hits, damage, and other combat-critical cues.

## REQ-100 — Sector pitch and weapon materials

**Statement:** The audio presentation shall use exactly four short, mutually distinct sector pitch contours, one for each sector, and shall use the same sector-to-contour vocabulary for attack and guard cues. Sword and staff cues shall layer different material sounds while keeping that same sector vocabulary.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-AUDIO`, recordings show exactly four short, mutually distinct sector pitch contours and the same sector-to-contour mapping for attack and guard cues. Paired sword and staff recordings preserve that mapping and layer observably different material sounds. |

**Notes:** Source: `PVS-AUD-002`.

## REQ-101 — Combat action cues

**Statement:** The audio presentation shall use separate cues for attack committed, correct Directional Guard, hit received, attack blocked, and attack missed or interrupted.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-AUDIO`, attack committed, correct Directional Guard, hit received, attack blocked, and the attack-missed-or-interrupted category each produce a cue separate from the other listed categories; both missed and interrupted outcomes are tested without requiring those two outcomes to use different cues. |

**Notes:** Source: `PVS-AUD-003`.

## REQ-102 — Order response cues

**Statement:** WHEN an order is valid, the audio presentation shall play one short dry centered cue followed by either one nearby Companion response or one grouped Troop movement or equipment response, without repeated confirmation; WHEN an order is invalid or unavailable, it shall play one low muted cue.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-AUDIO` and `CP-COMMAND-GROUPS`, each valid order produces exactly one short, dry, centered cue, followed by exactly one nearby Companion response or one grouped Troop movement/equipment response, and does not repeat confirmation. Each invalid or unavailable order produces one low muted cue. |

**Notes:** Source: `PVS-AUD-004`.

## REQ-103 — Movement and interaction cues

**Statement:** The audio presentation shall use one unvaried footstep and equipment layer across all surfaces and movement states, shall not play a Scene-entry cue, and shall play cues for character interaction and Journal open and close.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-AUDIO`, sampled surfaces and movement states use the same unvaried footstep and equipment layer; entering a Scene produces no distinct Scene-entry cue, without treating permitted continuous ambience or music as a Scene-entry cue; character interaction, Journal open, and Journal close each produce a cue. |

**Notes:** Source: `PVS-AUD-005`.

## REQ-104 — Settlement-state cue triggers

**Statement:** Settlement-state cues shall play only when the Local Contract is accepted, the Raid deadline is reached, victory occurs, or defeat occurs.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-AUDIO`, for every sampled settlement-state cue, verify that its trigger is Local Contract acceptance, the Raid deadline being reached, victory, or defeat; sampled state changes outside those transitions produce no settlement-state cue. |

**Notes:** Source: `PVS-AUD-006`.

## REQ-105 — Agent Downed reaction

**Statement:** WHEN an Agent becomes Downed, the audio presentation shall play one authored Agent reaction and shall play no other Agent reaction sound.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-AUDIO`, asset and event inspection plus Downed transitions for multiple Agents show that exactly one authored Agent reaction sound exists and is assigned, that it plays exactly once only when an Agent becomes Downed, and that no other Agent state or continued observation after the transition plays an Agent reaction sound. |

**Notes:** Source: `PVS-AUD-007`.

## REQ-106 — Sparse interface cues

**Statement:** The audio presentation shall use sparse cues for focus or selection, confirm, cancel or close, invalid action, completed save, completed load, and Feat or survivor-fate choice, and shall not sound passive HUD updates or timer ticks.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-AUDIO` and `CP-SAVE-RESTORE`, each listed action or completion produces its applicable sparse cue, while passive HUD updates and timer ticks remain silent. |

**Notes:** Source: `PVS-AUD-008`.

## REQ-107 — Ambient music behavior

**Statement:** Outside active combat, the audio presentation shall use one restrained looping ambient music layer below movement and interaction, shall duck it during combat and major outcomes, shall fade it out for survivor-fate choice, and shall not use an adaptive score.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-AUDIO`, audio-asset and audio-graph inspection shows exactly one looping ambient music layer and no additional music stems, segments, state-selected variations, or music-transition logic. Outside active combat, measured playback keeps that layer below movement and interaction; active combat and each major outcome reduce its level; survivor-fate choice ramps it to silence. |

**Notes:** Source: `PVS-AUD-009`.

## REQ-108 — Spatial and centered audio

**Statement:** Location ambience shall remain continuous and below gameplay feedback; attacks, blocks, hits, Downed sounds, nearby Band responses, movement, and settlement ambience shall use spatial audio with simple distance attenuation; and input, Journal, save and load, Feat, and survivor-choice cues shall remain centered and non-spatial.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-AUDIO`, location ambience continues across representative play and remains below gameplay feedback; every listed world sound changes position and level with listener direction and distance; every listed input or choice cue remains centered with no spatial shift. |

**Notes:** Source: `PVS-AUD-010`.

## REQ-109 — Audio readiness gate

**Statement:** Web Audio shall start only after an explicit user gesture; before campaign start, the presentation shall expose `Audio not ready`, `Audio ready`, or `Audio failed`; and IF initialization fails, THEN it shall show Retry and prevent gameplay entry until audio is ready.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-AUDIO`, launch without a user gesture does not start Web Audio and shows `Audio not ready`; a successful gesture starts it and shows `Audio ready`; forced initialization failure shows `Audio failed` and Retry, blocks gameplay entry, and permits entry only after a successful retry reaches `Audio ready`. |

**Notes:** Source: `PVS-AUD-011`.

## REQ-110 — Presentation authority

**Statement:** Rendering, DOM panels, the HUD, and audio shall use read-only Simulation projections and typed feedback events, shall store no gameplay result, and shall not change authoritative state when visual or audio feedback is missing.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-ARCH-DETERMINISM`, `CP-UI-HUD`, `CP-UI-FATE`, and `CP-AUDIO`, dependency inspection and fault-injection runs pass when presentation adapters cannot mutate authoritative projections, store no gameplay result, and dropped visual or audio feedback leaves Simulation state and outcomes unchanged. |

**Notes:** Source: `spec.md`, Section 7 authoritative-state and failure contracts.

## REQ-111 — Authoritative Simulation seam

**Statement:** The Vite and TypeScript browser application shall use one deep, platform-neutral `Simulation` as the authoritative gameplay seam.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-ARCH-DETERMINISM` passes when the browser build runs and all mutable campaign and battle results originate from the single platform-neutral `Simulation`. |

**Notes:** Source: `PVS-ARC-001`.

## REQ-112 — Simulation inputs and outputs

**Statement:** The `Simulation` shall accept target-tick typed commands, advance one fixed tick at a time, expose read-only projections and typed feedback events, and restore only validated plain-state snapshots.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-ARCH-DETERMINISM` and `CP-SAVE-RESTORE` pass when commands execute on their target ticks, direct advances execute exact ticks, projections reject mutation, feedback is typed, valid plain snapshots restore, and invalid snapshots do not restore. |

**Notes:** Source: `PVS-ARC-002`.

## REQ-113 — Fixed-tick execution

**Statement:** The `Simulation` shall run at 60 fixed ticks per Simulation second, process accumulated `requestAnimationFrame` time at no more than five catch-up ticks per rendered frame without dropping Simulation ticks, and let scenario runners call exact ticks directly.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-ARCH-DETERMINISM` and `CP-PERFORMANCE` pass when a timed run advances at 60 ticks per Simulation second, a delayed rendered frame processes no more than five ticks while retaining remaining ticks, and a scenario runner advances the requested exact tick count. |

**Notes:** Source: `PVS-ARC-003`.

## REQ-114 — Simulation-owned gameplay

**Statement:** The `Simulation` shall own combat, Band orders, behavior, travel, settlement interaction, Local Contract transitions, survivor fates, Feat choice, and save-safe transitions.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-ARCH-DETERMINISM` passes when deterministic scenarios show that combat, Band orders, behavior, travel, settlement interaction, Local Contract transitions, survivor fates, Feat choice, and save-safe transitions are implemented and decided inside the `Simulation`. |

**Notes:** Source: `PVS-ARC-004`.

## REQ-115 — Seeded randomness

**Statement:** The `Simulation` shall use one injected seeded random source, shall not use `Math.random` or ambient browser randomness for gameplay, and shall persist random-source state when later gameplay can consume it.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-ARCH-DETERMINISM` and `CP-SAVE-RESTORE` pass when equal seeds and commands produce equal traces, gameplay execution makes no call to `Math.random` or ambient browser randomness, and save restoration continues the same random sequence when future gameplay consumes it. |

**Notes:** Source: `PVS-ARC-005`.

## REQ-116 — Main-thread physics

**Statement:** The `Simulation` and Rapier 3D shall run on the main thread, and Rapier shall provide authoritative capsule movement, collision, and queries.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-ARCH-DETERMINISM` passes when execution traces place `Simulation` and Rapier work on the main thread and movement, collision, and query outcomes match Rapier results. |

**Notes:** Source: `PVS-ARC-006`.

## REQ-117 — Replaceable navigation

**Statement:** Navigation shall start with authored anchors and deterministic local steering behind a replaceable navigation port.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-COMMAND-AI` and `CP-ARCH-DETERMINISM` pass when a seeded navigation scenario follows authored anchors with repeatable local steering and a replacement navigation port can be selected without changing core gameplay code. |

**Notes:** Source: `PVS-ARC-007`.

## REQ-118 — Three.js presentation role

**Statement:** Three.js shall be a strict presentation adapter for WebGPU rendering, camera, glTF loading, `AnimationMixer`, interpolation, and visual feedback, and shall not store authoritative state or decide combat, relationship, or fate results.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-ARCH-DETERMINISM` and `CP-SUPPORT-GATE` pass when Three.js is used strictly as the presentation adapter for WebGPU rendering, camera, glTF loading, `AnimationMixer`, interpolation, and visual feedback; inspection confirms that Three.js stores no authoritative state; and presentation changes cannot alter combat, relationship, or fate results. |

**Notes:** Source: `PVS-ARC-008`.

## REQ-119 — Unified command input

**Statement:** Pointer Events, keyboard input, and DOM actions shall be normalized into the same target-tick command stream.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-ARCH-DETERMINISM` and `CP-COMBAT-INPUT` pass when equivalent Pointer Events, keyboard input, and DOM actions produce equivalent typed commands with the same target ticks. |

**Notes:** Source: `PVS-ARC-009`.

## REQ-120 — Ports and typed manifests

**Statement:** The implementation shall use an event-driven audio adapter, a versioned persistence port with an IndexedDB adapter, and readonly typed manifests for Agents, Troops, weapons, Feats, settlement data, contract data, and scenarios.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-ARCH-DETERMINISM`, `CP-SAVE-RESTORE`, and `CP-AUDIO` pass when typed events drive audio, a versioned persistence port round-trips validated snapshots through IndexedDB, and compile-time assertions confirm that every listed manifest is typed and readonly. |

**Notes:** Source: `PVS-ARC-010`.

## REQ-121 — Platform-neutral dependency direction

**Statement:** The phase plan shall keep domain, `Simulation`, content, and scenarios platform-neutral and shall point rendering, interface, audio, persistence, navigation, and browser bootstrap dependencies toward ports owned by the core, unless the phase plan records a reason for departure and preserves all source MUST behavior.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-SPEC-AUDIT` passes when the phase plan follows the stated platform-neutrality and dependency-direction guidance, or the phase plan records a reason for each departure and demonstrates that all source MUST behavior is preserved. |

**Notes:** Source: `PVS-ARC-011`.

## REQ-122 — Verification tool use

**Statement:** Vitest shall provide browser-independent `Simulation`, schema, persistence-port, and scenario assertions, and Playwright browser contexts shall provide browser checkpoints, screenshots, and short clips.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-ARCH-DETERMINISM` and `CP-SPEC-AUDIT` pass when Vitest produces passing assertions for all four listed areas and Playwright produces browser-checkpoint results with the required screenshots and short clips. |

**Notes:** Source: `PVS-ARC-012`.

## REQ-123 — Combatant state and policies

**Statement:** Battle participation shall use common `Combatant` state with explicit player-character, Companion, Troop, Agent, bandit, and resident behavior policies, while social identity, Agent relationship, and Agent fate shall remain outside the common battle role.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-ARCH-DETERMINISM` passes when each listed participant uses common `Combatant` state and its explicit behavior policy, while schema and deterministic battle traces keep social identity, Agent relationship, and Agent fate outside that state. |

**Notes:** Source: `PVS-ARC-013`.

## REQ-124 — Save-safe state transitions

**Statement:** Manual save and load shall be enabled only in `Safe non-combat`, and save-safe state transitions and effects shall follow the governed state table.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-SAVE-BOUNDARY` passes when each governed trigger produces its specified next state, save and load availability, state-retention result, autosave result, feedback, and retry behavior. |

**Notes:** Source: `PVS-SAV-001`. Governed state table: `Safe non-combat` + start Scene transition -> `Transitioning`; disable manual save and load. `Safe non-combat` + start manual-slot or autosave load of a current validated entry -> `Restoring snapshot`; disable manual save and load before state replacement. `Safe non-combat` + select an old, corrupt, or unreadable entry -> `Safe non-combat`; keep the current campaign unchanged and show the unavailable reason. `Transitioning` + Scene load and state entry both succeed -> `Safe non-combat`; write the rolling autosave, then enable manual save and load. `Transitioning` + Scene load fails -> `Load failed`; keep save and load disabled and show the load error. `Restoring snapshot` + snapshot restoration and runtime rebuild succeed -> `Safe non-combat`; enable manual save and load and do not write an autosave. `Restoring snapshot` + snapshot restoration or runtime rebuild fails -> `Safe non-combat`; keep the prior campaign unchanged, enable valid actions, and show the load failure. `Safe non-combat` + start bridge setup or settlement-center battle -> `Battle and resolution`; disable manual save and load before the first battle tick. `Battle and resolution` + battle freezes for victory or defeat -> `Battle and resolution`; keep save and load disabled through survivor choices, summary, and Feat choice. `Battle and resolution` + enter changed normal settlement play -> `Safe non-combat`; enable manual save and load, and do not write a Scene-transition autosave because the Scene did not change. `Safe non-combat` + open Journal or pause menu -> `Safe non-combat`; permit manual save and load. `Load failed` + user selects Retry -> `Transitioning`; restart the failed Scene load from its first stage.

## REQ-125 — Save-slot allocation

**Statement:** Persistence shall provide three manual save slots and one separate rolling autosave, and autosave data shall never overwrite a manual slot.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-SAVE-RESTORE` passes when three distinct manual slots and one distinct rolling autosave can be written and read, and repeated autosaves leave all manual-slot data unchanged. |

**Notes:** Source: `PVS-SAV-002`.

## REQ-126 — Persisted campaign state

**Statement:** A snapshot shall store the current Scene, exact position and campaign time, Band membership, health, availability, and equipment, Coin, Provisions and consumption remainder, Local Contract state and Raid deadline, optional pre-outcome or final Settlement condition, Agent relationships and fates, ordinary-bandit survivor result and Captive count, player Feat, and gameplay random-source state.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-SAVE-RESTORE` passes when a snapshot round trip preserves exact equality for every listed value, including each optional condition when present. |

**Notes:** Source: `PVS-SAV-003`.

## REQ-127 — Excluded snapshot state

**Statement:** A snapshot shall not serialize active battle, bridge setup, post-battle resolution, transient interface or camera state, an open dialogue, Rapier objects, Three.js objects, or audio runtime state.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-SAVE-BOUNDARY` and `CP-SAVE-RESTORE` pass when snapshots produced from eligible states contain none of the listed excluded data or runtime objects and restore without them. |

**Notes:** Source: `PVS-SAV-004`.

## REQ-128 — Transition autosave

**Statement:** The rolling autosave shall be written only after a successful Overworld-to-Scene or Scene-to-Overworld transition and shall be offered as a recovery choice at launch.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-SAVE-RESTORE` passes when successful transitions in both directions write the rolling autosave only after completion, failed or other transitions do not write it, and launch presents the autosave recovery choice. |

**Notes:** Source: `PVS-SAV-005`.

## REQ-129 — Validated snapshot restoration

**Statement:** Loading shall accept only the current validated schema, restore the exact saved non-combat campaign state, and rebuild physics, rendering, interface, and audio presentation from that state.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-SAVE-RESTORE` passes when a current validated snapshot restores an exact field-by-field non-combat state and newly rebuilds all four listed runtime areas, while a snapshot outside the current validated schema does not load. |

**Notes:** Source: `PVS-SAV-006`.

## REQ-130 — Unavailable save entries

**Statement:** An older-schema, corrupt, or unreadable entry shall be marked unavailable with its reason, shall not be migrated, and shall not be silently reset.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-SAVE-FAILURE` passes when each older-schema, corrupt, and unreadable entry is marked unavailable, displays its reason, is not migrated, and is not silently reset. |

**Notes:** Source: `PVS-SAV-007`.

## REQ-131 — Storage failure handling

**Statement:** IF storage is denied, unavailable, or full, THEN the current campaign shall remain playable in memory, a persistent saving-unavailable state shall be shown, save and load actions shall be disabled, success shall not be reported, and an explicit Retry shall be available after storage becomes available.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-SAVE-FAILURE` passes when each listed storage failure leaves in-memory play active, keeps the unavailable indication visible, disables save and load, produces no success feedback, and allows a successful explicit Retry after storage recovery. |

**Notes:** Source: `PVS-SAV-008`.

## REQ-132 — Confirmed local-data deletion

**Statement:** The player shall be able to delete one manual slot or reset all local campaign data, including autosave, only after confirmation, and starting a new campaign shall not delete existing entries.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-SAVE-FAILURE` passes when cancellation preserves data, confirmation deletes only the selected manual slot or all local campaign data as selected, full reset includes autosave, and new-campaign creation leaves existing entries unchanged. |

**Notes:** Source: `PVS-SAV-009`.

## REQ-133 — Manual save and load access

**Statement:** WHEN the save-safe state is `Safe non-combat`, the Journal and pause menu shall expose manual save and load in both the Overworld and settlement.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-SAVE-BOUNDARY` passes when both the Journal and pause menu expose working manual save and load actions in both the Overworld and settlement whenever the boundary is `Safe non-combat`. |

**Notes:** Source: `PVS-SAV-010`.

## REQ-134 — Ordered browser delivery states

**Statement:** Browser startup, Scene loading, load failure, readiness, rendering-device loss, retry, and reload shall follow the governed ordered delivery state table.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-SUPPORT-GATE`, `CP-SUPPORT-LOAD`, and `CP-DELIVERY-DEVICE-LOSS` pass when every governed check or event produces its specified next state, request behavior, progress or failure feedback, tick behavior, retry behavior, and reload behavior in the stated order. |

**Notes:** Source: `PVS-WEB-001`. Governed state table: `Startup` + insecure context -> `Unsupported`; show secure-context failure and do not request assets. `Startup` + absent `navigator.gpu` -> `Unsupported`; show WebGPU-unavailable failure. `Startup` + null or software adapter -> `Unsupported`; show physical-adapter failure. `Startup` + failed core device request -> `Unsupported`; show device-initialization failure. `Startup` + Three.js selects a non-WebGPU backend -> `Unsupported`; show WebGPU-backend failure and reject fallback. `Startup` + every gate passes -> `Loading Scene`; show Scene loading progress and begin console diagnostics. `Loading Scene` + one asset stage fails -> `Load failed`; stop at the first error, show the error and Retry, and do not retry automatically. `Load failed` + user selects Retry -> `Loading Scene`; restart the failed Scene load from its first stage. `Loading Scene` + download, decode, GPU upload, and state entry succeed -> `Ready`; enter the Scene and complete the transition. `Loading Scene` or `Ready` + `GPUDevice.lost` resolves -> `Device lost`; stop Simulation ticks immediately and show failure and Reload. `Device lost` + user selects Reload -> browser reload; run the complete startup gate again.

## REQ-135 — Core WebGPU request

**Statement:** The browser application shall request core WebGPU only, shall not require an optional GPU feature, and shall inspect the selected adapter and tested limits before device use.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-SUPPORT-GATE` passes when device-request records contain no required optional feature and show the selected adapter and tested limits evaluated before first device use. |

**Notes:** Source: `PVS-WEB-002`.

## REQ-136 — Scene asset loading progress

**Statement:** Assets shall load by Scene without an elapsed-time limit, and progress shall be shown for asset download, decode, GPU upload, and Scene readiness.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-SUPPORT-LOAD` passes when asset manifests and load traces confirm that assets load by Scene, inspection confirms that no elapsed-time limit is configured for Scene loading, and a delayed Scene load visibly reports progress for asset download, decode, GPU upload, and Scene readiness. |

**Notes:** Source: `PVS-WEB-003`.

## REQ-137 — Scene-load diagnostics

**Statement:** The browser console shall record detailed entries for each Scene load, asset download and decode, GPU upload, progress update, completion, and failure, with the Scene and asset identifiers.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-SUPPORT-LOAD` passes when successful and failed Scene-load runs produce console records for every listed event and each applicable record contains both Scene and asset identifiers. |

**Notes:** Source: `PVS-WEB-004`.

## REQ-138 — Rendering-device loss stop

**Statement:** WHEN the rendering device is lost, the `Simulation` shall stop and shall not advance hidden gameplay while no frame can be shown.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-DELIVERY-DEVICE-LOSS` passes when induced rendering-device loss stops the Simulation tick counter immediately and the counter and gameplay state remain unchanged while frames cannot be shown. |

**Notes:** Source: `PVS-WEB-005`.

## REQ-139 — Seeded bridge-battle frame-time target

**Statement:** For representative-quality acceptance, the seeded bridge battle on the promised row shall have an average frame time no greater than 16.67 milliseconds and a 95th-percentile frame time no greater than 33.33 milliseconds, with both values reported.

| Attribute | Value |
| --- | --- |
| Type | Quality (performance) |
| Status | Active |
| Verification | `CP-PERFORMANCE` passes when the representative-quality seeded bridge-battle run on the promised row reports both metrics, with average frame time at or below 16.67 milliseconds and 95th-percentile frame time at or below 33.33 milliseconds. |

**Notes:** Source: `PVS-WEB-006`.

## REQ-140 — Sustained frame-rate floor

**Statement:** In the seeded bridge battle, the delivered frame rate shall not remain below 30 frames per second for any contiguous interval longer than 1.00 second.

| Attribute | Value |
| --- | --- |
| Type | Quality (performance) |
| Status | Active |
| Verification | `CP-PERFORMANCE` passes when the seeded bridge-battle frame trace contains no contiguous interval longer than 1.00 second during which delivered frame rate stays below 30 frames per second. |

**Notes:** Source: `PVS-WEB-007`.

## REQ-141 — Acceptance scenario definition

**Statement:** Each acceptance scenario shall have one stable name, one explicit unsigned 32-bit seed, one reset command, one target-tick input transcript, and fixed checkpoint IDs.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-ARCH-DETERMINISM`: Pass when each acceptance scenario record contains exactly one stable name, one explicit unsigned 32-bit seed, one reset command, one target-tick input transcript, and fixed checkpoint IDs. |

**Notes:** Source: `PVS-EVD-001`.

## REQ-142 — Deterministic scenario replay

**Statement:** The same scenario, seed, build, and input transcript shall produce the same actors, timing, state snapshots, and outcomes; a different diagnostic seed shall not replace the acceptance seed.

| Attribute | Value |
| --- | --- |
| Type | Quality (determinism) |
| Status | Active |
| Verification | `CP-ARCH-DETERMINISM`: Pass when repeated clean runs of each acceptance scenario with the same scenario, seed, build, and input transcript produce identical actors, timing, state snapshots, and outcomes, and the acceptance evidence continues to use the specified acceptance seed after any diagnostic run. |

**Notes:** Source: `PVS-EVD-002`.

## REQ-143 — Checkpoint snapshots and assertions

**Statement:** At every required checkpoint, the evidence process shall emit a validated machine-readable snapshot and conventional assertions for each claimed campaign-state, combat-transition, command, fate, resource, persistence, delivery, or performance result.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-SPEC-AUDIT`: Pass when every checkpoint covered by this requirement has a linked machine-readable snapshot that passes validation and conventional assertions for every applicable claimed campaign-state, combat-transition, command, fate, resource, persistence, delivery, or performance result. |

**Notes:** Source: `PVS-EVD-003`.

## REQ-144 — Generated evidence manifest

**Statement:** The generated evidence manifest shall contain the build identifier, specification content hash, environment row, render backend, scenario, seed, input-transcript hash, checkpoint, Simulation tick, expected assertions, actual assertion results, outcome, state path, artifact type, artifact path, and frame metrics when applicable.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-SPEC-AUDIT`: Pass when manifest validation finds every specified field; all required snapshots, assertion results, environment records, and artifact records are linked; every state path and every applicable non-`none` artifact path resolves to harness-generated evidence for the recorded build, specification, environment, render backend, scenario, seed, transcript, checkpoint, and Simulation tick; an artifact-path field associated with the artifact rule `none` is not required to resolve to a visual file; applicable frame metrics are present; and no missing, stale, manually captured, or unlinked evidence is accepted. |

**Notes:** Source: `PVS-EVD-004`.

## REQ-145 — Visual evidence format

**Statement:** The evidence process shall capture a PNG screenshot for a static visual claim and shall capture a WebM clip only when the claim depends on a transition or timing; each clip shall show context, input, outcome, and the settled result within 8 seconds.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-UI-HUD`, `CP-UI-FATE`, and `CP-AUDIO`: Pass when each static visual claim is evidenced by a PNG screenshot, a WebM clip is used only when the claim depends on a transition or timing, and each clip shows context, input, outcome, and the settled result and lasts no more than 8 seconds. |

**Notes:** Source: `PVS-EVD-005`.

## REQ-146 — Stable screenshot capture

**Statement:** Each screenshot shall be captured only after the checkpoint state is stable for two rendered frames; a state-only claim shall require no visual artifact and shall record `none` as its artifact rule.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-SPEC-AUDIT`: Pass when each screenshot is captured only after the checkpoint state remains stable for two rendered frames and each state-only claim records `none` as its artifact rule. A visual artifact is not required for a state-only claim. |

**Notes:** Source: `PVS-EVD-006`.

## REQ-147 — Failure evidence preservation

**Statement:** WHEN an evidence run fails, it shall preserve the state snapshot, input transcript, failed assertion, browser-console records, and the relevant visual artifact; the evidence rules shall not require a clip at every checkpoint.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | `CP-SPEC-AUDIT`: Pass when an induced assertion failure moves the evidence run to failed and, for every failed evidence run, the retained diagnostics include the state snapshot, input transcript, failed assertion, browser-console records, and the relevant visual artifact when the applicable artifact rule is not `none`. A checkpoint does not require a clip unless its claim depends on a transition or timing; a static visual claim uses its required PNG, and a state-only claim records `none`. |

**Notes:** Source: `PVS-EVD-007`.

## REQ-148 — Acceptance scenario catalog

**Statement:** The acceptance scenario manifest shall contain the exact 20 scenario names, seeds, and required paths in the governed catalog.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-SPEC-AUDIT`, compare the typed scenario manifest with the governed catalog and pass when all 20 tuples match exactly, no tuple is missing, and no acceptance tuple has changed. |

**Notes:** Source: `spec.md`, Section 9 named acceptance scenarios.

| Scenario | Seed | Required path |
| --- | ---: | --- |
| `SCN-01-FULL-EARLY-RELEASE` | 1101 | New campaign, two Troops, Accepted contract, bridge victory, Release enemy Agent, Release ordinary bandits, choose Rapid Guard, return to Safe settlement |
| `SCN-02-FULL-EARLY-CAPTURE` | 1102 | Bridge victory, Capture enemy Agent and ordinary bandits, choose Rapid Stamina, return to Safe settlement |
| `SCN-03-FULL-EARLY-EXECUTE` | 1103 | Bridge victory, Execute enemy Agent and ordinary bandits, choose Rapid Attack, return to Safe settlement |
| `SCN-04-FULL-LATE-VICTORY` | 1201 | Deadline passes on Overworld, settlement-center victory, Damaged settlement, survivor choices, Feat, return |
| `SCN-05-BAND-DEFEAT` | 1202 | All Band members defeated before all raiders, no survivor or Feat choice, Damaged settlement |
| `SCN-06-RESIDENT-LOSS` | 1203 | Last settlement resident killed while a Band member remains active, immediate defeat |
| `SCN-07-COMBAT-SECTOR-MATRIX` | 1301 | All sword and staff sectors, preview revisions, feint, hit, miss, multi-target path, and matched or mismatched Directional Guard |
| `SCN-08-SHIELD-EXHAUSTION` | 1302 | Shield raise, omnidirectional blocks, continuous drain, zero-stamina release, stagger, regeneration, and re-enable |
| `SCN-09-CASUALTY-MATRIX` | 1303 | Player, Companion, Troop, enemy Agent, bandit, and resident zero-health rules with random draws around 0.20 |
| `SCN-10-COMMAND-GROUPS` | 1401 | Follow, valid and invalid Hold, off-screen marker, Engage retarget, formations, unavailable group, and raider engagement cap |
| `SCN-11-PREPARATION-TRAVEL` | 1501 | Recruit zero through four Troops, verify Coin boundaries, travel at all speed controls, pause, save, reload, and reach zero Provisions |
| `SCN-12-FEAT-MATRIX` | 1601 | Compare base and post-choice values for all three Feats; verify defeat gives none |
| `SCN-13-SAVE-RESTORE` | 1701 | Three manual slots, rolling autosave, exact restoration in Overworld and settlement, launch recovery, delete, and reset confirmation |
| `SCN-14-SAVE-FAILURES` | 1702 | Old schema, corrupt data, denied storage, full storage, Retry, and in-memory continuation |
| `SCN-15-WEBGPU-STARTUP-LOAD` | 1801 | Promised-row success plus secure-context, adapter, device, fallback, and Scene-load failure gates |
| `SCN-16-WEBGPU-DEVICE-LOSS` | 1802 | Device loss during active battle, stopped Simulation tick, visible failure, and Reload |
| `SCN-17-PERFORMANCE-BRIDGE` | 1803 | Default seeded bridge battle at the promised viewport, device-pixel ratio, browser, GPU, and driver |
| `SCN-18-PRESENTATION-AUDIO` | 1901 | HUD states, woodcut Scene, Downed ambiguity, fate view, sector sounds, mix priority, music fade, and audio-init failure |
| `SCN-19-DETERMINISTIC-REPLAY` | 2001 | Two clean runs with identical state, event, artifact-metadata, and outcome hashes |
| `SCN-20-SPEC-AUDIT` | 0 | Deterministic document check for required sections, contract tuples, state transitions, units, and requirement evidence links |

## REQ-149 — Acceptance checkpoint catalog

**Statement:** The evidence harness shall implement every checkpoint-to-scenario mapping, machine-readable pass condition, and visual-artifact rule in the governed checkpoint catalog.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-SPEC-AUDIT`, compare the generated evidence definitions with the governed catalog and pass when every row and field matches, every required assertion is executable, and each checkpoint applies its exact visual-artifact rule. |

**Notes:** Source: `spec.md`, Section 9 checkpoint traceability matrix.

| Checkpoint | Scenario and seed | Machine-readable pass condition | Visual-artifact rule |
| --- | --- | --- | --- |
| `CP-SPEC-END-TO-END` | `SCN-01-FULL-EARLY-RELEASE`/1101, `SCN-04-FULL-LATE-VICTORY`/1201, `SCN-05-BAND-DEFEAT`/1202 | The state trace follows only legal flow transitions; early victory ends Resolved/Safe, late victory ends Resolved/Damaged, and defeat ends Failed/Damaged. Each summary contains outcome, Band and resident casualties, applicable enemy survivor fates, Captive count, Settlement condition, and Local Contract state. A competent full run records 45–60 minutes. | Start and changed-settlement PNG screenshots; no full-run clip |
| `CP-SUPPORT-GATE` | `SCN-15-WEBGPU-STARTUP-LOAD`/1801 | Each failed gate stops before asset loading; the promised row selects a physical core-WebGPU device and confirms the WebGPU backend at 1920 × 1080 CSS pixels and device-pixel ratio 1.0. | PNG for each distinct unsupported state and one ready state |
| `CP-SUPPORT-LOAD` | `SCN-15-WEBGPU-STARTUP-LOAD`/1801 | Progress and console records contain download, decode, GPU upload, readiness, and first-error stop events with Scene and asset IDs; no automatic retry event exists. | WebM for one successful load and one first-error transition |
| `CP-FLOW-CONTRACT` | `SCN-01-FULL-EARLY-RELEASE`/1101, `SCN-11-PREPARATION-TRAVEL`/1501 | Available has no deadline; Decline keeps Available; Accept sets exactly current time plus 12 Overworld hours; Wait adds 1 Overworld hour; keys and pause preserve distance, time, and Provisions equivalence. | PNG of offer and Journal; WebM of one pause/speed transition |
| `CP-FLOW-EARLY` | `SCN-01-FULL-EARLY-RELEASE`/1101 | Deadline in settlement enters exactly 15 real-time seconds of bridge setup. Collision and setup state show one bridge crossing, impassable river, no alternate crossing, five residents and the Band on the settlement side, and six raiders on the far bank. Victory freezes once and resolves fates, summary, Feat, and Safe return in order. | PNG of the settled bridge setup; WebM of deadline-to-setup and battle-to-resolution transitions |
| `CP-FLOW-LATE` | `SCN-04-FULL-LATE-VICTORY`/1201 | Deadline passes without Overworld interruption; entry starts settlement-center battle with five residents and no setup; victory ends Resolved/Damaged. | WebM from boundary entry through settled battle start; PNG of damaged return |
| `CP-FLOW-DEFEAT` | `SCN-05-BAND-DEFEAT`/1202, `SCN-06-RESIDENT-LOSS`/1203 | Defeat triggers on the first valid priority guard, freezes once, skips survivor and Feat choices, and returns Failed/Damaged. The summary contains outcome, Band and resident casualties, Captive count, Settlement condition, and Local Contract state. | WebM of each defeat trigger through settled summary |
| `CP-COMBAT-INPUT` | `SCN-07-COMBAT-SECTOR-MATRIX`/1301 | Input states, 24-CSS-pixel dead zone, sector changes, stamina charge, wind-up cancel, committed recovery, movement multipliers, and no-dodge behavior equal the contract. | PNG of each selected sector; WebM of preview-to-commit and feint |
| `CP-COMBAT-GUARD` | `SCN-07-COMBAT-SECTOR-MATRIX`/1301, `SCN-08-SHIELD-EXHAUSTION`/1302 | Matching guard deals 0 health points and recoils for 0.30 seconds; mismatch deals full damage; shield raises in 0.20 seconds, blocks every sector, drains at 18 stamina/second, and releases at zero. | PNG of Directional Guard and Shield Block; WebM of mismatch and exhaustion transitions |
| `CP-COMBAT-DAMAGE` | `SCN-07-COMBAT-SECTOR-MATRIX`/1301 | Every weapon-sector damage, wind-up, recovery, single-target, multi-target, once-per-attack, health, and movement value equals its table; friendly targets take 0 health points. | WebM of one multi-target weapon path with settled health result |
| `CP-COMBAT-CASUALTY` | `SCN-09-CASUALTY-MATRIX`/1303 | Each role reaches its required zero-health result; recorded random values below 0.20 are Downed and values at or above 0.20 are killed; inactive Combatants receive no later damage. | PNG that does not reveal Downed versus killed; PNG of post-battle reveal |
| `CP-COMMAND-GROUPS` | `SCN-10-COMMAND-GROUPS`/1401 | Both groups follow their order tables; invalid Hold keeps prior state; markers and off-screen indication track the authoritative position; retarget occurs on the next tick. | PNG of Hold and off-screen indicator; WebM of Follow/Hold/Engage transitions |
| `CP-COMMAND-AI` | `SCN-10-COMMAND-GROUPS`/1401 | Formation roles, resident behavior, target choice, pressure values, and two-raider committed-attack cap hold for every sampled tick. | WebM that shows readable capped pressure and resident flee behavior |
| `CP-REL-RELEASE` | `SCN-01-FULL-EARLY-RELEASE`/1101 | Release produces Varek as exact `Active`/`Neutral`, Village Elder as exact `Friendly`, and unchanged Grievance sets. | PNG of the kneeling choice and returned Village Elder reaction |
| `CP-REL-CAPTURE` | `SCN-02-FULL-EARLY-CAPTURE`/1102 | Capture produces Varek as `Captive` with no Disposition and `Agent captured`; Village Elder is `Friendly`; aggregate Captive count is exact. | PNG of choice, outcome summary, and Journal result |
| `CP-REL-EXECUTE` | `SCN-03-FULL-EARLY-EXECUTE`/1103 | Execute produces Varek as `Executed` with no Disposition; Village Elder is `Hostile` with `Agent executed`. | PNG of choice, outcome summary, and changed Village Elder reaction |
| `CP-REL-FAILURE` | `SCN-05-BAND-DEFEAT`/1202 | Village Elder is `Hostile` with `Settlement harmed`; Varek remains `Active`/`Hostile`; survivor and Feat commands are unavailable. | PNG of defeat summary and changed Village Elder reaction |
| `CP-FEAT` | `SCN-12-FEAT-MATRIX`/1601 | Rapid Guard values are 0.20 and 0.16 seconds; Rapid Attack uses a 0.80 multiplier; Rapid Stamina is 30 stamina/second with a 1.2-second delay; exactly one victory choice persists; defeat has none. | PNG of Feat choice and Journal; WebM of one before/after timing comparison |
| `CP-PREP-RECRUIT` | `SCN-11-PREPARATION-TRAVEL`/1501 | A new campaign has Miro (`poc-companion`), 100 Coin, and 10.0 Provisions with no Companion deduction; candidate count, membership, fixed loadouts, 25-Coin cost, zero-Coin rejection, and default 50-Coin remainder equal the contract. | PNG of Journal before and after default recruitment |
| `CP-PREP-PROVISIONS` | `SCN-11-PREPARATION-TRAVEL`/1501 | Moving member-days consume exactly 0.2 Provisions/member/day in 0.1 steps; speed and pause are equivalent; non-travel states consume 0.0; save/load preserves remainder; zero does not block travel. | PNG of Journal at 10.0 and 0.0 Provisions; no clip |
| `CP-UI-HUD` | `SCN-18-PRESENTATION-AUDIO`/1901 | DOM and projection states contain only the required passive HUD elements and contextual panels; time is `HH:MM`; the render backend reports the required camera and visual manifest. | PNG at settlement, attack preview, Directional Guard, and Journal checkpoints |
| `CP-UI-FATE` | `SCN-18-PRESENTATION-AUDIO`/1901 | Fate input remains pending until confirmation; the Agent pose, three actions, and resulting state agree; battle presentation does not expose ordinary survival. | PNG of battle bodies and kneeling fate view |
| `CP-AUDIO` | `SCN-18-PRESENTATION-AUDIO`/1901 | Typed event log contains the exact sector, material, command, interface, outcome, spatial/centered, duck, music-fade, readiness, failure, and Retry events in priority order; forbidden events are absent. | WebM with audio for sector contrast, combat ducking, fate fade, and audio failure |
| `CP-ARCH-DETERMINISM` | `SCN-19-DETERMINISTIC-REPLAY`/2001 | Two clean runs have identical command, checkpoint-state, feedback-event, random-state, and outcome hashes. Common Combatant records use explicit role policies without replacing social identity or Agent fate. Platform adapters cannot mutate authoritative projections. | `none`; state-only claim |
| `CP-SAVE-BOUNDARY` | `SCN-13-SAVE-RESTORE`/1701 | Save/load enablement follows every boundary row. Manual controls are enabled in safe Overworld and settlement states and disabled in setup, battle, resolution, transition, and restoration states. No unsafe snapshot exists; changed-settlement return becomes safe. | PNG of enabled Overworld and settlement controls and disabled battle controls |
| `CP-SAVE-RESTORE` | `SCN-13-SAVE-RESTORE`/1701 | All three manual slots and autosave remain separate; each listed field and random state restores exactly; runtime adapters rebuild; launch offers autosave recovery. | PNG of slot list and restored Journal; WebM of one Scene-transition autosave |
| `CP-SAVE-FAILURE` | `SCN-14-SAVE-FAILURES`/1702 | Old and corrupt entries are unavailable without migration; denial and full storage keep in-memory play, disable actions, persist failure, and never emit success; Retry recovers; confirmed delete/reset affects only specified entries. | PNG for each failure state and confirmation state |
| `CP-DELIVERY-DEVICE-LOSS` | `SCN-16-WEBGPU-DEVICE-LOSS`/1802 | The Simulation tick at loss equals every later tick before Reload; no gameplay event follows loss; visible state offers Reload; reload repeats startup gates. | WebM from active frame through device-loss settled state |
| `CP-PERFORMANCE` | `SCN-17-PERFORMANCE-BRIDGE`/1803 | Manifest reports average and 95th-percentile frame time; average targets at most 16.67 milliseconds; 95th percentile targets at most 33.33 milliseconds; no below-30-frames/second interval exceeds 1.00 second; bridge battle lasts 3–5 active minutes. | `none`; metrics and state-only claim |
| `CP-SPEC-AUDIT` | `SCN-20-SPEC-AUDIT`/0 | All 10 required top-level sections, eight contract-tuple fields per section, required state tables, one flow diagram, requirement classes, fixed-value units, checkpoint links, and scenario seeds are present; no in-scope unresolved marker exists. | `none`; document claim |

## REQ-150 — Acceptance scenario execution

**Statement:** WHEN an acceptance scenario runs, the harness shall reset it to the same initial state, apply its exact target-tick public gameplay commands, stop at its fixed checkpoints, and shall not use a test-only action after start to force an outcome.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-ARCH-DETERMINISM`, inspect each transcript and run repeated scenarios; pass when reset state and checkpoints are stable, all post-start inputs use public gameplay commands, test-only setup only selects a valid preset before start, and no test-only action forces an outcome. |

**Notes:** Source: `spec.md`, Section 9 input, transition, and failure contracts.

## REQ-151 — Generated evidence provenance

**Statement:** The acceptance process shall reject missing, stale, manually captured, or unlinked evidence and shall accept only harness-generated evidence linked to its build, specification, environment, scenario, seed, transcript, checkpoint, and Simulation tick.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-SPEC-AUDIT`, validate conforming evidence and controlled missing, stale, manual, and unlinked fixtures; pass when only the conforming generated and fully linked evidence is accepted. |

**Notes:** Source: `spec.md`, Section 9 failure contract.

## REQ-152 — Exclude implementation planning details

**Statement:** The phase plan shall not add implementation, phase tickets, task order, file layouts, class designs, or an implementation schedule; the handoff specification shall contain contract-level constraints only.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable. This requirement is not an acceptance condition. |

**Notes:** Deprecated because `OUT OF SCOPE` clauses are no longer normative acceptance requirements. No replacement.

## REQ-153 — Exclude alternate terrain and crossing variants

**Statement:** The phase plan shall not add an open-approach interception terrain variant or an alternate river crossing.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable. This requirement is not an acceptance condition. |

**Notes:** Deprecated because `OUT OF SCOPE` clauses are no longer normative acceptance requirements. No replacement.

## REQ-154 — Exclude a raider-aligned path

**Statement:** The phase plan shall not add a playable path that joins or helps the raiders.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable. This requirement is not an acceptance condition. |

**Notes:** Deprecated because `OUT OF SCOPE` clauses are no longer normative acceptance requirements. No replacement.

## REQ-155 — Exclude additional world and equipment systems

**Statement:** The phase plan shall not add more Overworld locations, covert operations, trade simulation, trade routes, camping, tournaments, nicknames, horses, vehicles, siege equipment, bows, axes, or pikes.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable. This requirement is not an acceptance condition. |

**Notes:** Deprecated because `OUT OF SCOPE` clauses are no longer normative acceptance requirements. No replacement.

## REQ-156 — Exclude large-scale and delegated systems

**Statement:** The phase plan shall not add large armies, diplomacy, delegated Companion work, stewards, Troop education, Troop progression, custom Troops, quirks, multiple Local Contracts, or resident daily schedules.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable. This requirement is not an acceptance condition. |

**Notes:** Deprecated because `OUT OF SCOPE` clauses are no longer normative acceptance requirements. No replacement.

## REQ-157 — Exclude Band morale and related needs

**Statement:** The phase plan shall not add Band morale, retention, missing-Provisions penalties, camping needs, or entertainment.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable. This requirement is not an acceptance condition. |

**Notes:** Deprecated because `OUT OF SCOPE` clauses are no longer normative acceptance requirements. No replacement.

## REQ-158 — Exclude detailed Captive systems

**Statement:** The phase plan shall not add detailed Captive management, ransom, forced labor, enslavement, recruitment of Captives, or Captive trade.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable. This requirement is not an acceptance condition. |

**Notes:** Deprecated because `OUT OF SCOPE` clauses are no longer normative acceptance requirements. No replacement.

## REQ-159 — Exclude online and remote-state systems

**Statement:** The phase plan shall not add multiplayer, accounts, backend services, server-owned state, cloud saves, or online synchronization.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable. This requirement is not an acceptance condition. |

**Notes:** Deprecated because `OUT OF SCOPE` clauses are no longer normative acceptance requirements. No replacement.

## REQ-160 — Exclude generative and adaptive media

**Statement:** The phase plan shall not add runtime generative AI, spoken dialogue, or adaptive music.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable. This requirement is not an acceptance condition. |

**Notes:** Deprecated because `OUT OF SCOPE` clauses are no longer normative acceptance requirements. No replacement.

## REQ-161 — Exclude unsupported rendering and input modes

**Statement:** The phase plan shall not add WebGL rendering fallback, software rendering, mobile support, touch controls, keyboard-only support, reduced-motion support, or support promises outside the named Chromium/Linux/GPU/driver row.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable. This requirement is not an acceptance condition. |

**Notes:** Deprecated because `OUT OF SCOPE` clauses are no longer normative acceptance requirements. No replacement.

## REQ-162 — Exclude additional progression and recovery behavior

**Statement:** The phase plan shall not add Renown behavior, a broad progression tree, Agent relationship scores, shared faction attitude, partial settlement damage, contract retry, or Agent-Grievance removal.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable. This requirement is not an acceptance condition. |

**Notes:** Deprecated because `OUT OF SCOPE` clauses are no longer normative acceptance requirements. No replacement.

## REQ-163 — Excluded-system enforcement

**Statement:** Each excluded system shall have zero playable paths and zero acceptance checkpoints other than `CP-SPEC-AUDIT`, shall have no control, panel, placeholder text, or disabled affordance, and shall cause a phase ticket that adds it to fail the scope check.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable. This requirement is not an acceptance condition. |

**Notes:** Deprecated because `OUT OF SCOPE` clauses are no longer normative acceptance requirements. No replacement.

## REQ-164 — Explicit scope change

**Statement:** A future effort shall move an excluded system into scope only through a new explicit specification decision.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Deprecated |
| Verification | Not applicable. This requirement is not an acceptance condition. |

**Notes:** Deprecated because `OUT OF SCOPE` clauses are no longer normative acceptance requirements. No replacement.

## REQ-165 — Specification completeness gate

**Statement:** The specification shall not be handed to iterative phase planning unless every following item remains checked: (1) the purpose, destination, playable boundary, and 45–60-minute target are explicit; (2) the support row, WebGPU gate, viewport, device-pixel ratio, controls promise, loading behavior, and performance floor are explicit; (3) canonical terms agree with `CONTEXT.md`; (4) every top-level section contains purpose, authoritative state and data, inputs and commands, transitions, outputs and player-visible feedback, failure and edge behavior, fixed values or targets, and evidence checkpoints; (5) Local Contract, Agent fate, Settlement condition, save-safe boundary, and battle outcome transitions are complete state tables; (6) one end-to-end diagram covers early victory, late victory, Band defeat, resident loss, survivor decisions, Feat choice, and return; (7) every numeric gameplay, timing, distance, rate, resource, viewport, frame, and duration value has its unit or is explicitly a unitless count, ratio, key, seed, or version; (8) every in-scope normative acceptance claim has a stable requirement ID, class, named checkpoint, named scenario, seed policy, machine-readable assertion, and visual-artifact rule; (9) screenshots are limited to static visual claims, and short clips are limited to transition, timing, or audio claims; (10) failure checkpoints cover invalid commands, defeat priority, save boundaries, storage denial, corrupt data, loading failure, unsupported rendering, audio failure, and device loss; and (11) no unresolved in-scope decision or placeholder remains.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | `CP-SPEC-AUDIT`: Run the deterministic specification audit on this file. Pass only when the audit validates structure and references, establishes that each of the 11 checklist clauses in the statement is true and checked, and blocks handoff to iterative phase planning whenever any one of those clauses is false or unchecked. Exercise the gate with a conforming fixture and with a controlled failing fixture for each checklist clause; every conforming run must permit the gate and every failing run must keep the handoff ineligible. |

**Notes:** Source: `PVS-CMP-001`.

## REQ-166 — Specification audit lifecycle

**Statement:** WHEN a normative specification edit occurs, the deterministic specification audit shall run again and shall clear each completeness item that is no longer true; the checklist result shall add no gameplay interface.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-SPEC-AUDIT`, make a controlled normative edit that invalidates one item and pass when the rerun clears that item and blocks handoff; restore the source and pass when all valid items return, with no gameplay interface added by the checklist. |

**Notes:** Source: `spec.md`, Section 10 transition and output contracts.

## REQ-167 — Initial named-Agent identities and state

**Statement:** The relationship model shall create exactly Village Elder (`poc-contract-giver`), the Contract-giver Agent, as `Active` and `Neutral` with no Grievances and Varek (`poc-enemy-agent`), the Enemy Agent, as `Active` and `Hostile` with no Grievances, and shall create no relationship record for Miro, a generic settlement resident, or any other character.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-REL-RELEASE`, reset two campaigns and pass when each initial plain-state projection contains exactly the Village Elder and Varek relationship records with the specified IDs, names, roles, Agent fates, Dispositions, and empty Grievance sets, when both projections are value-equal, and when Miro and generic settlement residents have no relationship record. |

**Notes:** Source: `PVS-REL-001`. Replaces REQ-067.

## REQ-168 — Relationship outcomes for Village Elder and Varek

**Statement:** WHEN Varek's Enemy Agent fate choice is confirmed or the Local Contract fails, the relationship state shall apply only the governed Village Elder and Varek changes, retain all Grievances, and first show the changes when the player returns to the settlement.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-REL-RELEASE`, `CP-REL-CAPTURE`, and `CP-REL-EXECUTE`, confirm each choice and pass when the exact governed Village Elder and Varek state applies immediately but first becomes visible after return to the settlement. At `CP-REL-FAILURE`, run separate Band-defeat and resident-loss cases and pass when each produces the governed failure state after return. In every run, all pre-existing Grievances remain present and no other relationship record changes. |

**Notes:** Source: `PVS-REL-003`. Governed outcomes: Resolved + `Release` → Village Elder `Friendly` with no new Grievance; Varek `Active`, `Neutral`, with no new Grievance. Resolved + `Capture` → Village Elder `Friendly` with no new Grievance; Varek `Captive`, adds `Agent captured`, and has no Disposition. Resolved + `Execute` → Village Elder `Hostile` and adds `Agent executed`; Varek `Executed` with no Disposition. Failed by Band defeat or resident loss → Village Elder `Hostile` and adds `Settlement harmed`; Varek `Active`, `Hostile`, with no new Grievance. Replaces REQ-069.

## REQ-169 — Post-result restrictions and Village Elder reaction

**Statement:** After a Resolved or Failed result, the Journal shall be read-only for contract and preparation changes, `Talk` with Village Elder shall show the changed authored reaction, and no retry shall be available.

| Attribute | Value |
| --- | --- |
| Type | Behavior |
| Status | Active |
| Verification | At `CP-REL-FAILURE` and `CP-SPEC-END-TO-END`, reach both Resolved and Failed results and pass when the Journal permits no contract or preparation change, `Talk` with Village Elder shows the authored reaction for the result and Varek outcome, and no retry control or transition is available. |

**Notes:** Source: `PVS-FLW-016`. Replaces REQ-032.

## REQ-170 — Overworld view and Band representation

**Statement:** The Overworld shall use a top-down strategic 3D view and shall represent the whole Band as one Band pawn that is a small-scale version of the player character, without rendering separate individual Band members.

| Attribute | Value |
| --- | --- |
| Type | Constraint |
| Status | Active |
| Verification | At `CP-FLOW-CONTRACT` and `CP-UI-HUD`, inspect the built product and pass when camera rotation and zoom retain the top-down strategic 3D view, exactly one Band pawn visually matches the player character at a smaller scale and represents and moves the whole Band, and no separate player-character, Companion, or Troop model appears on the Overworld. |

**Notes:** Source: `PVS-FLW-002`.
