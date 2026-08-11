# Prompt: Bold and Brave visual-language prototype

Create throwaway, standalone browser prototypes for the **Bold and Brave** Playable Vertical Slice. This is a visual decision artifact, not production code.

## Decision question

Which concrete low-poly shapes, proportions, palette, lighting, animation treatment, user-interface treatment, and Downed presentation make the grounded frontier coherent and combat readable within a browser budget?

## Shared scenario

Use one compact bridge-defense Scene as the comparison context:

- The player character leads a Band containing one Companion and a small number of Troops.
- The enemy force contains one enemy Agent and ordinary bandits.
- A visible Hold position marker, directional attack or guard telegraph, stamina, and resident-protection status must be readable.
- The encounter ends in post-battle survivor resolution. A Downed combatant remains visually inert and non-identifying during battle; the post-battle view may expose Release, Capture, or Execute as a separate decision.
- Use the canonical language in `CONTEXT.md`: Band, Command group, Hold position, Companion, Agent, Downed, Captive, Scene, Local Contract, Settlement condition, and related terms.

## Deliverables

Produce **three separate versions** with **three unique human-readable names** per version set. Each version must be a separate HTML file with its name visible in the page and in the filename. Do not collapse the variants into one file.

Each prototype must:

1. Run as a standalone local HTML file with no network, backend, account, or external runtime dependency.
2. Use low-poly or deliberately flat geometry and a small palette; do not depend on final art assets.
3. Make silhouettes, role colors, attack or guard telegraphs, the Hold position marker, and the Downed/post-battle distinction inspectable.
4. Include enough motion or state switching to judge animation treatment, but keep the implementation throwaway.
5. Include a compact player-facing interface treatment for the Local Contract, time/deadline, stamina, Band status, and settlement condition.
6. State the intended tradeoff of the version in a short visible note. The human reviewer must be able to compare versions without reading source code.

## Role-specific emphasis

### Developer set

Create three technically simple, interaction-focused versions. Give each a distinct visual name. Prioritize deterministic state switching, URL or button-selectable battle states, visible input feedback, accessible labels, and a clear browser-budget story. Keep geometry and logic intentionally small and easy to discard.

Write only under `.scratch/playable-vertical-slice/prototypes/developer/`.

### Designer set

Create three visually distinct treatments. Give each a distinct visual name. Explore materially different combinations of silhouette proportions, palette, lighting, animation language, HUD density, and Downed/post-battle presentation. Prioritize visual hierarchy, combat readability at a glance, and a clear mood for a grounded low-fantasy frontier.

Write only under `.scratch/playable-vertical-slice/prototypes/designer/`.

## Boundaries

- Do not edit production source; there is no production game implementation in this repository yet.
- Do not resolve the issue or claim that a human selected a direction.
- Do not add tests, formatters, linters, or project-wide validation. The parent session will smoke-check the artifacts.
- Preserve the existing `.scratch/playable-vertical-slice/prototypes/12-visual-language.html`; add the new named versions beside it.
- Report the exact paths and names of the three files you created.
