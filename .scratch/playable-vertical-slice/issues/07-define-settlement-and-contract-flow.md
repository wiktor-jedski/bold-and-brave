Type: grilling
Status: resolved
Blocked by: 06

# Define settlement interaction and contract flow

## Question

What characters, contextual actions, short dialogues, panels, contract states, and changed post-contract interactions are required in the compact settlement Scene to carry the complete slice loop?

## Answer

Keep the first version to one defense path and two named settlement Agents: the contract-giver and the affected-resident Agent already defined by **Define Agent relationships, grievances, and enemy fates**. No other persistent settlement Agents are required. Generic armed and unarmed settlement residents can exist as battle targets without becoming part of the relationship model.

The settlement Scene uses four contextual actions: `Talk`, `Wait`, `Journal`, and `Leave`.

- `Talk` is the only route to the Local Contract. The player inspects the contract-giver's short text exchange and opens a panel with the objective, bridge location, enemy Agent, five bandits, expected reward, settlement risk, and current state. The player chooses `Accept` or `Decline`. Declining leaves the Local Contract `Available`, so the player can return later.
- `Journal` shows the Local Contract, its state, the Raid deadline after acceptance, Band members, equipment, Coin, and Provisions. It is also the access point for preparation; there is no separate `Prepare` settlement action.
- `Wait` is available in the settlement while the Local Contract is `Available` or `Accepted`. It advances local time. There is no raid timer while the contract is Available; after acceptance, crossing the Raid deadline begins the defense event.
- `Leave` exits the settlement without changing the Local Contract state. With an Accepted contract, the player may travel in the Overworld and return before or after the Raid deadline. Returning after the deadline starts the battle in the settlement center.

Use four Local Contract states: `Available`, `Accepted`, `Resolved`, and `Failed`. `Accept` changes Available to Accepted. A successful defense changes it to Resolved; Band defeat or the death of all settlement residents changes it to Failed. Failed is terminal for this slice and cannot be retried.

The Raid deadline changes the battle start within the one settlement Scene:

- If the player is in the settlement when the deadline is reached, the game starts bridge setup. The player gets the normal short deployment window and can place the Companion and Troop Hold markers.
- If the player enters the settlement from the Overworld after the deadline, the battle starts immediately in the settlement center. There is no deployment window; the enemy Agent and five bandits are already fighting settlement residents.

In the settlement-center battle, armed residents defend while above 20% health and flee below 20%; unarmed residents flee immediately. Both groups remain possible raid targets. The raiders seek to kill all settlement residents. The Band wins when all raiders are Downed or killed. The Band loses when all Band members are defeated or no settlement residents remain. A late victory still resolves the Local Contract and offers the two survivor-fate decisions, but the Settlement condition remains `Damaged` because the attack reached the settlement. An early bridge victory can leave it `Safe`.

Use short text-only dialogue with no voice and no branching conversation tree. After `Resolved` or `Failed`, the Journal is read-only and `Talk` with both named Agents shows the changed reaction for the outcome and enemy Agent fate. There is no retry in the slice.
