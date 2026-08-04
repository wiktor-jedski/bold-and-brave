Label: wayfinder:map

# Chart the Bold and Brave Playable Vertical Slice

## Destination

A decision-complete specification for a 45–60 minute Three.js browser-game slice that proves Bold and Brave's defining Band contract loop and is ready to hand to iterative phase planning.

The slice begins with preparation in a frontier settlement, offers a meaningful choice of raid-interception terrain, resolves a small directional-combat battle, and ends with persistent human and material consequences.

## Notes

- Domain: grounded low-fantasy late-medieval frontier; dangerous, adventurous, politically messy, and without playable magic in the slice.
- Consult `CONTEXT.md` for canonical language. Use the Grilling and Domain Modeling skills for human decisions, Prototype for questions of feel or presentation, and Research for current facts outside the repository.
- Delivery: offline-style single-player play in a browser, with no account, backend, or server-owned gameplay state; saves live locally in the browser.
- Technology: Three.js is fixed. Other libraries, build tooling, and browser APIs remain decisions.
- Representative-quality priorities: directional melee, personally leading and commanding a small Band, and a visible post-contract relationship or grievance consequence.
- Deliberately simple presentation is acceptable for the Overworld, dialogue, settlement simulation, economy, and content volume.
- Scope scenario: the player recruits and equips a Band in one compact settlement, chooses a bridge or open approach to intercept a raid, fights one enemy Agent and five ordinary bandits, resolves the fate of survivors, and returns to the changed settlement.
- Battle size: player character, one Companion, and up to four Troops against one Agent and five bandits.
- Weapons: one-handed sword, shield, and staff.
- A combatant may be Downed or killed in battle, but both states deliberately share the same battle presentation. After battle, Release/Capture/Execute is chosen separately for the Downed Agent and once for all Downed ordinary bandits. Captured survivors become Captives.
- Preparation uses Coin and Provisions. Troops do not gain progression in the slice; only the player gains a Feat.
- Art: stylized low-poly realism with strong silhouettes, restrained earth tones, and exaggerated combat readability. Generative AI is a development aid only, not a runtime dependency.
- Audio: functional combat, movement, command, interface, ambience, and nonverbal-reaction sound, plus one ambient music layer; no spoken dialogue or adaptive score.
- Persistence: three manual save slots outside active combat plus autosave at Scene transitions.
- Verification: every playable phase must expose seeded, reproducible scenarios with explicit visual checkpoints, screenshot and short-video evidence for AI vision review, and conventional assertions for state and logic.
- Wayfinder plans decisions rather than implementing the slice. Once this map is decision-complete, hand it to phase planning.

## Decisions so far

## Not yet specified

- Exact tuning targets, content values, and encounter balance cannot be specified until combat, Band AI, economy, and contract-flow decisions are resolved.
- Browser performance budgets, supported browser/device envelope, loading strategy, and accessibility baseline depend on the technical architecture and visual prototypes.
- The final set of deterministic acceptance scenarios and their observable rubrics depends on the resolved game-state model and vision-evidence prototype.
- The precise organization of the handoff specification will become visible as subsystem decisions accumulate in this map.

## Out of scope

- Implementing the slice or breaking its implementation into phase tickets; that begins after this decision map reaches its destination.
- Building on the Overworld, covert operations, trade simulation and trade routes, camping, tournaments, nicknames, horses, vehicles, siege equipment, bows, axes, or pikes.
- Large armies, diplomacy, delegated Companion work, stewards, troop education or progression, quirks, multiple contracts, and NPC daily schedules.
- Multiplayer, accounts, backend services, server-owned state, runtime generative AI, spoken dialogue, and adaptive music.
- Detailed Captive management, ransom, forced labor or enslavement systems, and captive trading.

