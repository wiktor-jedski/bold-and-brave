Type: prototype
Status: resolved
Assignee: Codex

# Find the visual language and readability bar

## Question

Which concrete low-poly shapes, proportions, palette, lighting, animation treatment, user-interface treatment, and Downed/dead presentation make the grounded frontier coherent and combat readable within a browser budget?

## Comments

### 2026-08-11 — Prototype assets

The first comparison artifacts were rejected during human review. The final decision is recorded below.

#### Parent comparison

- [Visual Language Comparison Board](../prototypes/12-visual-language.html)

#### Own prototypes

- [Ironbridge Ink](../prototypes/own/12-ironbridge-ink.html)
- [Clay and Cinder](../prototypes/own/12-clay-and-cinder.html)
- [Lantern Watch](../prototypes/own/12-lantern-watch.html)

#### Developer prototypes

- [Blade Clock](../prototypes/developer/12-visual-language-dev-blade-clock.html)
- [Ticker Tape](../prototypes/developer/12-visual-language-dev-ticker-tape.html)
- [State Rail](../prototypes/developer/12-visual-language-dev-state-rail.html)

#### Designer prototypes

- [Lanternlight](../prototypes/designer/12-visual-language--lanternlight.html)
- [Highsun Heraldry](../prototypes/designer/12-visual-language--highsun-heraldry.html)
- [Mire and Mist](../prototypes/designer/12-visual-language--mire-and-mist.html)

#### Reusable prompt

- [Visual-language prototype prompt](../prompts/12-visual-language-prototype-prompt.md)

The parent session smoke-checked all nine HTML artifacts locally. The first visual direction was rejected; the final decision is recorded below.

### 2026-08-11 — Resolution

**Decision:** Use a restrained third-person woodcut presentation with no explanatory HUD copy.

- **Camera:** Use a third-person view of the player character in the Scene.
- **Health:** Place a red health bar at the bottom of the screen. Show no label or explanation beside it.
- **Contract and time:** Keep only `Defend the settlement` and the active time at the top-left of the screen.
- **Directional action:** When Attack or Block is triggered, show the four-sector directional control in the center of the screen. Render the control white and semi-transparent; render the chosen direction opaque.
- **Stamina:** Place a small white, semi-transparent stamina bar directly below the directional control.
- **HUD discipline:** Do not add explanatory text or additional status panels.
- **Post-battle resolution:** Show the enemy Agent kneeling in an open field, with an adjacent option box for Release, Capture, or Execute.
- **Palette:** Use woodcut colors with strong silhouettes and restrained flat shading.

This closes the visual-language decision. Production implementation remains out of scope for the map.
