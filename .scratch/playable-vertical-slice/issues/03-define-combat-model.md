Type: grilling
Status: resolved

# Define the combat model and equipment roles

## Question

Given the proven directional controls, what exact rules govern attacks, blocks, shields, staffs, damage, stamina or poise, friendly fire, Downed versus dead outcomes, and the distinct tactical role of each item?

## Answer

Adopt a Mount & Blade-style committed attack model with the following slice rules:

- Sword and staff use the shared four-sector attack vocabulary: overhead, left cut, right cut, and thrust. Each sector has its own timing, reach, and modest damage profile. Overheads deal the most damage and stagger, thrusts reach farthest with lower damage, and side cuts are balanced.
- Sword and staff use four-sector directional guards. A matching guard fully negates the incoming attack and briefly staggers the attacker. A mismatch fails completely and deals full damage. Guard direction can be changed while held, with the new sector becoming effective after its pose completes.
- The shield is defensive-only. It blocks every direction, has a slightly faster raise than weapon guard, drains stamina continuously while held, and automatically releases with a brief stagger at zero stamina. It negates attacks but does not stagger the attacker.
- Attacks can be held before release and may be canceled into guard during wind-up, enabling feints. Once active, an attack commits through recovery. Movement remains available throughout, with phase-based speed reductions. There is no target lock; the attack path follows player facing and weapon motion.
- An attack damages every valid enemy target in its path, with full fixed damage and no per-target falloff, but each target can receive damage only once per committed attack. Friendly fire is disabled.
- Damage uses one health value per combatant, with no hit zones or armor calculations. Exact values remain tuning work. Stamina is shared across attacks, weapon guards, and shield blocks; attacks and guards use discrete or hold costs, exhaustion temporarily disables combat actions, and stamina regenerates automatically after a short delay when not spending it. Dodging is not part of the slice.
- Player and Companion casualties become Downed and cannot be killed or revived during the battle. Troops and ordinary bandits use a probabilistic lethal outcome: 20% Downed and 80% killed. The enemy Agent cannot be killed in battle and becomes Downed when defeated. Downed combatants leave active combat, become non-targetable and invulnerable, and remain so until post-battle resolution.
