Type: prototype
Status: resolved
Assignee: Codex
Blocked by: 03, 04, 05, 07, 08, 09, 10, 12, 13, 14

# Tune the Playable Vertical Slice encounter

## Question

What concrete health, stamina, damage, timing, movement, recruitment, Raid deadline, and encounter values make one 45–60 minute defense slice readable, fair, and representative without implying a broader balance model?

## Answer

Use the following as the initial authored tuning target for the Playable Vertical Slice. These values target a readable representative scenario; they do not define a broader balance model.

### Preparation and time

- The default preparation has the fixed Companion and two recruited Troops. Starting resources are `100 Coin` and `10 Provisions`; two Troops cost `50 Coin`, leaving `50 Coin`.
- The four Troop candidates remain available at `25 Coin` each. Each Troop uses the fixed Staff loadout.
- The authored Overworld route is `1.5` travel units at `3` units/day. The Raid deadline is `12` hours. This scale keeps an early bridge response possible instead of making the `1`-hour deadline always force the late start.
- Bridge setup lasts `15` seconds. The Band movement targets are `3.5` units/sec for the player, `3.4` for the Companion, `3.0` for Troops, `2.8` for the enemy Agent, `2.6` for bandits, and `2.0` for settlement residents.
- The late settlement-centre scenario starts with five generic residents.

### Combat values

- Health is `100` for the player and Companion, `70` for each Troop, `110` for the enemy Agent, `40` for each ordinary bandit, and `100` for each settlement resident.
- Every combatant has `100` maximum stamina. Use `12` stamina per committed attack, a `1.2`-second regeneration delay, and `25` stamina/sec regeneration. Directional Guard costs `6` stamina/sec while held; Shield Block costs `18` stamina/sec.
- Use `5` damage/sec for the Companion and `8` damage/sec for each Troop under the baseline `Engage` pressure model. Enemy strikes deal `12` damage.
- Sword damage is `24` for Overhead, `20` for either side cut, and `16` for Thrust. Staff damage is `20` for Overhead, `16` for either side cut, and `13` for Thrust. Thrust keeps the longest reach despite its lower damage.
- Sword timing is Overhead `0.65`/`0.55` sec, side cut `0.55`/`0.45` sec, and Thrust `0.45`/`0.60` sec for wind-up/recovery. Staff adds `0.10` sec to each wind-up and keeps the same recovery. Directional Guard transition is `0.25` sec; Shield Block raises in `0.20` sec; an enemy attack telegraph is `0.80` sec; the enemy strike interval is `2.1` sec.
- A competent player who commands the Band and uses directional defense should finish the bridge battle in `3–5` minutes and the late settlement-centre battle in `4–6` minutes. The enemy engagement cap from **Define Band commands and combatant behavior** remains in force so the interval does not become five simultaneous hits.

### Prototype evidence

- The human drove the browser prototype through baseline and pressed bridge/late scenarios, with zero and four Troops, and judged the baseline pressure close.
- Prototype branch: `prototype/17-slice-tuning`, commits `38a1b22` and `ad60caa`. Run it with `python3 -m http.server 4173 --directory .scratch/playable-vertical-slice/prototypes` and open `17-slice-tuning.html`.

## Comments

### Resolution — 2026-08-17

The human selected the baseline pressure, player-advantage movement, the simple directional damage profile, readable attack and guard timings, five late-scenario residents, a 12-hour deadline aligned with the travel scale, all-combatant 100 stamina, a 6 stamina/sec Directional Guard cost, and a 3–5 minute competent battle target. The browser prototype remains on the throwaway branch; production implementation remains out of scope for this map.
