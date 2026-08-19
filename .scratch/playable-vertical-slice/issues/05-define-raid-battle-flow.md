Type: grilling
Status: resolved
Blocked by: 03, 04

# Define the raid interception and battle flow

## Question

How does the timed defense at the bridge or in the settlement alter deployment, terrain, enemy behavior, victory and defeat, settlement damage, post-battle resolution, and return-to-settlement consequences?

## Answer

Use two possible Raid starts in one settlement Scene: bridge setup when the Raid deadline is reached while the Band is in the settlement, or the settlement center after a late arrival from the Overworld. The river is impassable except at the bridge; both banks provide small staging areas, formation space, and limited flanking room, but no alternate crossing. The open-approach terrain variant is out of scope for this map.

- At the bridge, the Band starts on the settlement side and the raiders start on the far bank. Before contact, the player has a short real-time deployment window to move and place the Companion and Troop Hold markers. There is no separate deployment screen.
- If the Band is in the settlement when the Raid deadline is reached, the game starts bridge setup in the same settlement Scene. If the player enters the settlement from the Overworld after the deadline, the battle starts in the settlement center with no deployment window and the enemy Agent and five bandits already fighting settlement residents.
- The raiders' objective is to kill all settlement residents, both armed and unarmed. Armed residents defend while above 20% health and flee below 20%; unarmed residents flee immediately. The Band wins when every enemy combatant—the enemy Agent and all five ordinary bandits—is Downed or killed. The Band loses when every Band member is defeated or no settlement residents remain.
- The battle ends immediately when either condition is met. Active combat freezes and transitions directly to victory resolution or the defeat summary.
- Settlement condition is binary for the resulting state: an early bridge victory leaves the settlement `Safe`; a late victory or any defeat leaves it `Damaged`. There is no partial settlement damage in the slice.
- After victory, the game presents two sequential fate decisions: Release/Capture/Execute for the Downed enemy Agent, then one Release/Capture/Execute decision for all Downed ordinary bandits. The relationship effects are defined by **Define Agent relationships, grievances, and enemy fates**.
- After victory, friendly Downed members survive as injured. The player and Companion recover enough to continue; Downed Troops remain unavailable, and killed Troops are removed. After defeat, the game skips survivor fate decisions, shows the loss summary, preserves the current casualties, and returns to the settlement.
- Both outcomes show a short summary before entering the settlement Scene with the outcome, casualties, survivor fates, and Settlement condition. The changed settlement interactions and Agent reactions are handled by the settlement and relationship decisions.
