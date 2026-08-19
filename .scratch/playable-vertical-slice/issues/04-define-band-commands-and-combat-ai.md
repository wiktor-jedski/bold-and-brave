Type: grilling
Status: resolved
Blocked by: 03

# Define Band commands and combatant behavior

## Question

What minimal command vocabulary and ally/enemy behavior rules let the player fight personally while meaningfully leading one Companion and up to four Troops against an Agent and five bandits?

## Answer

Use two independently selectable Command groups—a single Companion and the grouped Troop formation—but give both groups the same simple tactical behavior. The Companion is not a special autonomous combat system in this slice; its distinction is that the player can order it separately.

The player has three orders:

- `Follow`: maintain the group's formation around the player and attack only nearby threats; do not chase enemies away from the player.
- `Hold`: anchor the group to a designated position in the battlefield Scene, form around a visible world-space marker, defend locally, and do not advance. A subtle off-screen compass/UI indicator helps the player locate the marker in third-person view.
- `Engage`: advance toward and attack the nearest active enemy threatening the group. The player does not select an individual target.

The Companion follows close to the player's flank; the Troops maintain a compact line behind or beside the player. `Hold` and `Engage` preserve these role-appropriate formations. When a current target becomes Downed or killed, an `Engage` group immediately selects the nearest remaining active threat; a `Follow` group returns to formation, and a `Hold` group returns to its marker unless a nearby enemy requires self-defense.

The enemy Agent is the raid's field commander. The five ordinary bandits share the Agent's current objective of pressuring the player's Band. Each bandit chooses the nearest hostile combatant within that objective, but only a limited number commit attacks at once; the rest circle, reposition, or guard nearby allies to avoid a readable dogpile. The enemy Agent primarily engages the player and may briefly reposition to protect a threatened bandit cluster or reopen the raid's escape route.
