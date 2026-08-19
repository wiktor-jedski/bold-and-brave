Type: grilling
Status: resolved

# Define Agent relationships, grievances, and enemy fates

## Question

What is the smallest persistent relationship and grievance model that makes the enemy Agent's and settlement Agents' reactions meaningfully reflect victory, defeat, and the Release/Capture/Execute decisions for Downed survivors?

## Answer

Use a small, authored relationship model attached only to three named Agents: the settlement contract-giver, one settlement Agent representing the people harmed or protected, and the enemy Agent leading the raid.

- An Agent relationship is the combination of a current Disposition toward the player character or Band and that Agent's active typed Grievances. Dispositions are `Friendly`, `Neutral`, or `Hostile`; there is no numeric relationship score and no shared settlement or faction attitude.
- A Grievance is a persistent fixed-cause record. The slice uses `Settlement harmed`, `Agent captured`, and `Agent executed`; once created, a Grievance is not cleared during the slice.
- Agent fate is separate from relationship: `Active`, `Captive`, or `Executed`. Only an Active Agent has a current Disposition. Relationship changes apply immediately when a post-battle fate decision is confirmed, even though they are first shown to the player on return to the settlement.
- Initial state: the contract-giver and affected-resident Agents are `Neutral` with no Grievances; the enemy Agent is `Hostile` with no Grievances.
- On a successful interception, the settlement Agents would otherwise become `Friendly`, but the enemy Agent's fate supplies the explicit social trade-off:
  - Release: the enemy Agent remains `Active` and becomes `Neutral` with no new Grievance; the contract-giver is `Friendly`, while the affected-resident Agent is `Neutral`.
  - Capture: the enemy Agent becomes `Captive`, receives `Agent captured`, and has no active Disposition; both settlement Agents are `Friendly`.
  - Execute: the enemy Agent becomes `Executed` and has no active Disposition; the contract-giver becomes `Hostile` with `Agent executed`, while the affected-resident Agent is `Friendly`.
- On a failed interception or Band defeat, both settlement Agents become `Hostile` with `Settlement harmed`; the enemy Agent remains `Active` and `Hostile` with no new Grievance.
- Release/Capture/Execute decisions for ordinary Downed bandits do not affect named-Agent relationships; their aggregate survivor and Captive consequences belong to battle-flow and preparation decisions.
