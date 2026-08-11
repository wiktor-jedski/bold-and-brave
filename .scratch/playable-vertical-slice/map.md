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
- [Define the combat model and equipment roles](issues/03-define-combat-model.md) — Use Mount & Blade-style committed attacks with guard-cancel feints, directional sword/staff guards, omnidirectional stamina-limited shields, multi-target weapon paths, and explicit Downed/death rules.
- [Define Band commands and combatant behavior](issues/04-define-band-commands-and-combat-ai.md) — Use separately ordered Companion and Troop groups with Follow, visible-marker Hold, and automatic-target Engage orders; the enemy Agent coordinates readable bandit pressure.
- [Define the raid interception and battle flow](issues/05-define-raid-battle-flow.md) — Use a bridge setup or late settlement-center emergency, resident-protection victory conditions, binary Safe/Damaged settlement consequences, and immediate victory-resolution or defeat-summary exits.
- [Define Agent relationships, grievances, and enemy fates](issues/06-define-agent-relationships-and-fates.md) — Use per-Agent Friendly/Neutral/Hostile dispositions, persistent typed grievances, and separate Active/Captive/Executed fates with authored reactions to battle outcomes and survivor decisions.
- [Define settlement interaction and contract flow](issues/07-define-settlement-and-contract-flow.md) — Use Talk, Wait, Journal, and Leave around one defense Local Contract, with a visible Raid deadline that selects bridge setup or a late settlement-center emergency.
- [Define recruitment, equipment, Coin, and Provisions](issues/08-define-preparation-economy.md) — Use four fixed Staff Troop candidates at 25 Coin each, 100 starting Coin, 10 starting Provisions, and a single 0.2-per-member-per-Overworld-day upkeep rate.
- [Define Overworld travel, time, and Scene transitions](issues/10-define-overworld-time-and-scenes.md) — Use a free-roaming 3D Overworld with direct click-to-move, distance-based time, Space pause, 1×–4× speed controls, and one settlement Scene for both battle starts.
- [Define player Feat progression](issues/09-define-player-feat-progression.md) — Any victory unlocks one permanent choice among Rapid Guard, Rapid Attack, and Rapid Stamina after survivor-fate resolution; defeat grants none.
- [Find the visual language and readability bar](issues/12-prototype-visual-language.md) — Use a third-person camera and minimal white translucent HUD: bottom red health bar, top-left settlement defense/time, center four-sector Attack/Block control with opaque selected direction and stamina below; resolve Agent fate beside a kneeling Agent in a field with woodcut colors.

## Not yet specified

- Exact tuning targets, content values, and encounter balance cannot be specified until combat, Band AI, economy, and contract-flow decisions are resolved.
- Browser performance budgets, supported browser/device envelope, loading strategy, and accessibility baseline depend on the technical architecture and implementation constraints.
- The final set of deterministic acceptance scenarios and their observable rubrics depends on the resolved game-state model and vision-evidence prototype.
- The precise organization of the handoff specification will become visible as subsystem decisions accumulate in this map.
- The future Band morale model, including how battle outcomes, missing Provisions, Local Contract decisions, travel without camping, and entertainment affect Band retention, is not yet specified.

## Out of scope

- Implementing the slice or breaking its implementation into phase tickets; that begins after this decision map reaches its destination.
- An open-approach interception terrain variant; the first version uses the bridge only and can revisit the alternative in a later effort.
- A playable path that joins or assists the raiders; the first version only lets the Band defend the settlement.
- Building on the Overworld, covert operations, trade simulation and trade routes, camping, tournaments, nicknames, horses, vehicles, siege equipment, bows, axes, or pikes.
- Large armies, diplomacy, delegated Companion work, stewards, troop education or progression, custom Troops trained and equipped by the player, quirks, multiple contracts, and NPC daily schedules.
- Multiplayer, accounts, backend services, server-owned state, runtime generative AI, spoken dialogue, and adaptive music.
- Detailed Captive management, ransom, forced labor or enslavement systems, and captive trading.
