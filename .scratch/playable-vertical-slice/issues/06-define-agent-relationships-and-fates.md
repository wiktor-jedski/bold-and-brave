Type: grilling
Status: resolved

# Define Agent relationships, grievances, and enemy fates

## Question

What is the smallest persistent relationship and grievance model that makes the enemy Agent's and settlement Agent's reactions meaningfully reflect victory, defeat, and the Release/Capture/Execute decisions for Downed survivors?

## Answer

Use a small, authored relationship model attached only to two named Agents: Village Elder (`poc-contract-giver`), the settlement Contract-giver Agent, and Varek (`poc-enemy-agent`), the Enemy Agent leading the raid.

- An Agent relationship is the combination of a current Disposition toward the player character or Band and that Agent's active typed Grievances. Dispositions are `Friendly`, `Neutral`, or `Hostile`; there is no numeric relationship score and no shared settlement or faction attitude.
- A Grievance is a persistent fixed-cause record. The slice uses `Settlement harmed`, `Agent captured`, and `Agent executed`; once created, a Grievance is not cleared during the slice.
- Agent fate is separate from relationship: `Active`, `Captive`, or `Executed`. Only an Active Agent has a current Disposition. Relationship changes apply immediately when a post-battle fate decision is confirmed, even though they are first shown to the player on return to the settlement.
- Initial state: Village Elder is `Neutral` with no Grievances; Varek is `Hostile` with no Grievances.
- On a successful interception, Varek's fate supplies the explicit social trade-off:
  - Release: Varek remains `Active` and becomes `Neutral` with no new Grievance; Village Elder becomes `Friendly`.
  - Capture: Varek becomes `Captive`, receives `Agent captured`, and has no active Disposition; Village Elder becomes `Friendly`.
  - Execute: Varek becomes `Executed` and has no active Disposition; Village Elder becomes `Hostile` with `Agent executed`.
- On a failed interception or Band defeat, Village Elder becomes `Hostile` with `Settlement harmed`; Varek remains `Active` and `Hostile` with no new Grievance.
- Release/Capture/Execute decisions for ordinary Downed bandits do not affect named-Agent relationships; their aggregate survivor and Captive consequences belong to battle-flow and preparation decisions.
