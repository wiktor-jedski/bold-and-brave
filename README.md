# Bold and Brave

A browser game with an Overworld, a settlement, and a Local Contract to stop a raid.

## Run

Use Bun 1.3.14 and a browser with hardware WebGPU support:

```sh
bun install
bun run dev
```

Open `http://localhost:5173`. Select **Start new campaign** to enable audio and start the game.
Use localhost or HTTPS. There is no WebGL or software-rendering fallback.
`bun run build` creates the production files in `dist/`.

The verified Linux browser uses the Vulkan flags below. Apply them when starting a new Chromium process if normal startup reports **Unsupported**:

```sh
chromium --enable-unsafe-webgpu --enable-features=Vulkan --use-angle=vulkan --ozone-platform=x11 http://localhost:5173/
```

## Play

- Click the settlement on the Overworld to travel. Keys **1–4** set travel speed. **Space** pauses travel.
- In a Scene, move the mouse to turn the character and camera together. **W/S** move forward/backward; **A/D** sidestep. The mouse wheel zooms.
- Middle click toggles continuous mouse look. **Escape** releases the mouse first. Menus and Hold placement also release it.
- **J** opens the Journal. Scroll through it for recruitment, equipment, relationships, and saves.
- Talk to **Mara Venn** to accept the Local Contract. Use **Wait** to advance one campaign hour.
- Stay in the settlement until the deadline to defend the bridge. A late return starts the battle in the settlement center.
- In combat, hold the left mouse button and move up, left, right, or down. Release to attack. Down selects **Thrust**, a forward sword stab.
- Hold the **right mouse button** to defend. In Directional Guard mode, move the mouse to match the incoming attack direction. **Q** switches between Directional Guard and Shield Block while idle. Shield Block does not need a direction and consumes stamina while held.
- Select the **Companion** with **1** or **Troops** with **2**. Use **F** for Follow, **H** for Hold, or **E** for Engage. Click the ground to place a Hold marker.
- **Escape** closes an open panel or pauses the game.

Player movement is **7 world units/second**. Initial travel takes **15 seconds at 1×**, or **3.75 seconds at 4×**. Travel consumes the same campaign time and Provisions at each speed. Attack and guard timing does not change with travel speed.

The game includes victory and defeat, confirmed Agent and bandit fates, persistent relationships and Grievances, a Feat choice, three manual save slots, and an autosave. Saves use this browser's IndexedDB storage.

### Arena practice

Choose **Arena practice** at the start screen, or open **Arena** in the settlement. **Duel** is one against one. **Team battle** gives the Player a Companion and four Troops, with 15 seconds to position them before six opponents advance. Both modes use the game's combat, AI, and Command groups.

Pause or finish a round to restart, change mode, or exit. The Arena does not change campaign time, health, resources, relationships, or saves. It gives no Feat or campaign reward. Exit returns to the start menu or the unchanged settlement campaign, according to where you entered.

### Character source

The editable character is `assets/ranger.blend`. It has a new mesh and a new 17-bone rig, built from `assets/reference/character.png`. The `Walk` and `Idle` clips use the named joints required by the renderer. To export the saved Blender model:

```sh
blender --background assets/ranger.blend --python assets/export-ranger.py
```

To rebuild the model, rig, materials, and clips from source, then export them:

```sh
blender --background assets/ranger.blend --python assets/author-ranger.py --python assets/export-ranger.py
```

Rebuilding replaces edits in the character Scene. The exporter groups meshes by material and keeps the authoring model separate. The game loads `public/assets/frontier-human.glb`; it does not need Blender or MCP. `assets/reference/style.png` is the reference for the wider Scene.

## Checks

```sh
bun run audit:spec
bun run audit:scope
bun run test
bun run scenarios
bun run test:browser
```

Vitest and Playwright remain the test runners. Bun installs dependencies and runs the package commands. Set `CHROMIUM_PATH` to a Chromium executable for browser checks; they require a desktop session and hardware WebGPU.

The specified support row is Chromium **151.0.7922.137**, Linux x64, NVIDIA GeForce RTX 2070 SUPER, driver **610.57.04**, at **1920×1080**, DPR **1**. The browser checks measure the actual row rather than assume support.

Evidence is written under `test-results/`. Passing tests do not accept every visual or audio checkpoint. Browser records include actual WebGPU/DOM captures, real master-output audio, and reviewed fate, save, Hold-marker, and damaged-settlement views. Journey and battle durations are recorded without minimum or maximum bounds; automated timings are not human first-playthrough measurements. The [implementation task list](docs/implementation/task-list.md#acceptance-evidence) records verified coverage and the remaining acceptance work.

See [the playable specification](.scratch/playable-vertical-slice/spec.md), [requirements](docs/requirements.md), and [implementation plan](docs/implementation/plan.md).

## Original game concept

The longer-term concept below is not the scope of this playable build:
- directional combat (Mount and Blade, Gothic)
- ability to build on the map in certain areas (Fallout 4)
- terrain or location based battles (Mount and Blade)
- main map is simple, each notable location is a scene (Mount and Blade)
- other agents in the world with ability to form relations and grievances (Mount and Blade, Shadow of Mordor)
- simple trading system (Sid Meier's Pirates!)
- covert ops missions
- equipment, quirks and feats, weapon proficiency
- raise troops and educate them to be able to use different equipment
- companions - can join the band or be delegated to do stuff
- steward - can solve simple things like recruitment or trade to avoid walking into the city
- camping - provide recreation for troops, can walk around and ask about stuff
- tournaments - fight to gain the prize and renown
- nickname - let NPCs call you out
- simple interactions a'la RDR2 that can evolve into conversation or combat or some kind of reaction
- horses, vehicles, siege equipment
- bows, blades, axes, pikes, spears
- each location has one quest at a time - keep it meaningful but simple
- assemble armies featuring agents
- simple diplomacy
- bandit missions
- different parts of the day
- simple NPCs can have their daily schedules in towns/villages (TES: Oblivion)
- 3D in whatever tech that enables AI generation
- provide food and money for troops
