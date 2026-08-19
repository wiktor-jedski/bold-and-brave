Type: prototype
Status: resolved

# Find the directional combat control and feedback model

## Question

Which attack-direction, block-direction, camera, movement, timing, and immediate feedback model makes one-handed sword, shield, and staff combat feel readable and satisfying with keyboard and mouse in a Three.js browser prototype?

## Answer

Use **Drag & Release** as the slice's directional combat interaction model.

- **Movement and camera:** `WASD` provides camera-relative movement under a stable over-the-shoulder combat camera. The camera keeps both combatants and their spacing readable rather than requiring continuous free-look during an exchange.
- **Attack direction:** pressing the primary mouse button starts an aiming gesture at the pointer's origin. Dragging beyond a small dead zone selects one of four screen-relative sectors: up for overhead, left or right for the corresponding cut, and down for thrust. Releasing commits the attack. Holding preserves the preview without attacking.
- **Block direction:** holding the secondary mouse button enters guard selection. The same four-sector drag vocabulary selects and visibly maintains the guard; releasing ends the guard. A block succeeds when its sector matches the incoming attack sector, subject to the stamina, timing, and shield rules decided by **Define the combat model and equipment roles**.
- **Timing:** direction selection is deliberate and reversible while the button is held; commitment begins on release. Wind-up, active frames, recovery, feints or cancellation, stamina costs, and weapon-specific timing are tuning decisions for **Define the combat model and equipment roles**, not part of this prototype verdict.
- **Immediate feedback:** while aiming or guarding, the selected reticle sector highlights and the weapon pose previews the direction. The HUD exposes current action state, direction, and stamina. Enemy attacks visibly telegraph their sector; hit, struck, and correctly matched block outcomes receive distinct high-contrast callouts and animation reactions. Final presentation may replace the prototype text, but must preserve that immediate distinction.
- **Dodge:** `Space` remains a separate emergency movement action so it cannot be confused with directional attack or guard input; its exact rules remain a combat-model decision.

The comparison prototype is preserved on branch `prototype/directional-combat` at commit `f0a1f37`. It compared Drag & Release with Look & Flick and Explicit Direction Keys in the same Three.js sparring scene. The human selected Drag & Release after trying the alternatives.
