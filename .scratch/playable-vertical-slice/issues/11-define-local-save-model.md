Type: grilling
Status: resolved
Assignee: Codex
Blocked by: 02, 07, 10

# Define local campaign saves and restoration

## Question

What state belongs in the three browser-local manual save slots and Scene-transition autosave, exactly when may saving and loading occur, and how are versioning, corruption, storage denial, and reset handled for the slice?

## Answer

Use three manual save slots and one separate rolling autosave. Every entry stores the complete campaign state at a non-combat safe point:

- current `Scene` and exact position and time;
- Band membership, member health, and equipment;
- Coin and Provisions;
- Local Contract state and Raid deadline;
- Settlement condition;
- Agent relationships, including Disposition and active Grievances, plus Agent fate; and
- the player character's Feat.

Active battle, transient UI and camera state, and in-progress dialogue are not serialized. Manual save and load are available from the Journal or pause menu whenever no battle is active, in either the Overworld or settlement. The autosave overwrites its dedicated entry only after a successful Scene transition; it does not overwrite manual slots. The launch flow offers the autosave for recovery. Loading restores the exact saved non-combat state and rebuilds presentation from it.

Each entry accepts only the current validated schema. Older versions and corrupt or unreadable data are reported as unavailable; no migration or silent reset is attempted. If browser storage is denied, unavailable, or full, the current campaign remains playable in memory with a persistent saving-unavailable state; save and load actions are disabled, and the game never reports a save as successful. The player can retry after storage is available.

The player can explicitly delete one manual slot or reset all local campaign data, including the autosave, with confirmation. Starting a new campaign does not automatically delete existing entries.

## Comments

### Resolution — 2026-08-17

The human confirmed the complete save boundary, timing, autosave, restoration, validation, storage-failure, and reset policy above.

