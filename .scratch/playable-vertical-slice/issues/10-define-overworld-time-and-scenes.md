Type: grilling
Status: resolved
Assignee: Codex

# Define Overworld travel, time, and Scene transitions

## Question

How do real-time-with-pause click-to-move travel, time advancement, visible locations, entry into separate 3D Scenes, and return travel work within the single-contract slice?

## Answer

Use a small free-roaming 3D Overworld and one settlement Scene:

- The Band starts about `0.5 Overworld day` outside the settlement.
- The Overworld is a simple 3D strategic space inspired by Mount & Blade. The player can rotate the camera and zoom in or out.
- The Overworld is free-roaming even though the slice has only one destination. Its structure must support adding more locations later.
- The player uses direct click-to-move across traversable ground. The Band moves at one fixed speed, and travel time is calculated from distance.
- Overworld time advances while the Band is moving. It pauses automatically when the Band is stationary.
- `Space` pauses or unpauses. While paused, the Band stops, the clock stops, and Provisions consumption stops. Camera rotation and zoom remain available.
- `1`, `2`, `3`, and `4` set time speed to 1×, 2×, 3×, and 4×. When paused, pressing one of these keys also unpauses; when unpaused, it only changes speed.
- The settlement entry boundary automatically loads the single settlement Scene. There is no separate bridge Scene or bridge travel.
- The bridge and settlement center are areas in that same settlement Scene.
- Entering the settlement before the Raid deadline is normal settlement play. When the deadline is reached while the Band is in the settlement, the game starts bridge setup.
- If the deadline passes while the Band is in the Overworld, travel continues without an interruption. Entering the settlement after the deadline starts the battle in the settlement center.
- `Leave` returns the Band to the Overworld at the settlement boundary while preserving current time, Provisions, Local Contract state, and Band state.

## Comments

### Resolution — 2026-08-11

The human selected a free-roaming 3D Overworld with direct click-to-move, distance-based travel time, camera rotation, zoom, manual pause, four time-speed controls, automatic settlement entry, and one settlement Scene for both bridge setup and settlement-center battle starts.
