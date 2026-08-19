Type: grilling
Status: resolved
Assignee: Codex
Blocked by: 01, 12

# Define the audio language and feedback priorities

## Question

Which sounds and mix priorities communicate directional attacks, blocks, damage, commands, movement, settlement state, Agent reaction, and interface state without speech or an adaptive score?

## Answer

Use a grounded, combat-first audio model without spoken dialogue or an adaptive score:

- Mix priorities are directional attacks, blocks, hits, damage, and other combat-critical feedback first; Command cues and Band responses second; Agent Downed feedback and settlement-state outcomes third; movement and interaction fourth; interface cues fifth; ambience and music last. Duck ambience and music during combat-critical events.
- Each of the four attack and guard sectors has a short, distinct pitch contour layered with the weapon's material sound. Sword and staff share the sector vocabulary but use different material layers.
- Use separate cues for attack committed, correct directional block, hit received, attack blocked, and attack missed or interrupted.
- Issuing an order uses a short, dry centered cue. The Companion gives one nearby nonverbal response and the Troops give one grouped movement or equipment response. Do not repeat confirmation after an order; movement and formation changes show completion. An invalid or unavailable order uses a low, muted error cue.
- Keep one simple, unvaried footstep and equipment layer. Do not vary it by surface or movement state. Do not play a Scene-entry cue. Play cues for interacting with a character and opening or closing the Journal.
- Play settlement-state cues only for Local Contract accepted, Raid deadline reached, victory, and defeat.
- Play an authored Agent reaction sound only when an Agent becomes Downed. Do not add other Agent reaction sounds in this slice.
- Use sparse, quiet interface cues for focus or selection, confirm, cancel or close, invalid action, completed save, completed load, and Feat or survivor-fate choice. Do not sound passive HUD updates or timer ticks.
- Use one restrained looping ambient music layer outside active combat. Keep it low under movement and interaction, duck it during combat and major outcome cues, and fade it out for survivor-fate choice. Keep location ambience continuous but below gameplay feedback.
- Spatialize attacks, blocks, hits, Downed sounds, nearby Band responses, movement, and settlement ambience from their world positions. Keep player-input, Journal, save/load, Feat, and survivor-fate cues centered and non-spatial, using simple distance attenuation for world audio.

## Comments

### Resolution — 2026-08-17

The human confirmed the combat-first mix, directional sector cues, nonverbal command model, constrained movement and settlement cues, Downed-only Agent reaction, sparse interface feedback, single non-adaptive music layer, and simple world-versus-interface spatialization.

