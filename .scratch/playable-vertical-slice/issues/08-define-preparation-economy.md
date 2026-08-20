Type: grilling
Status: resolved
Assignee: Codex

# Define recruitment, equipment, Coin, and Provisions

## Question

What minimal prices, inventory rules, recruitment choices, equipment persistence, and Provisions consumption create one meaningful preparation trade-off without implying a broader economy simulation?

## Answer

Use a fixed, deliberately small preparation model for the Playable Vertical Slice:

- The player character starts with `100 Coin` and `10 Provisions`.
- Miro (`poc-companion`) is the one fixed Companion. Miro does not cost Coin.
- The settlement offers four Troop candidates. The player may recruit any or all of them before the Raid.
- Each recruited Troop costs `25 Coin`.
- Every Troop has one predetermined `Staff` loadout. The player does not choose or change a Troop's equipment.
- The player character and Companion use predetermined authored equipment. Preparation does not include equipment selection.
- There is no equipment shop, item inventory, equipment durability, provision purchasing, resupply, or provision loot in the slice.
- All Band members consume `0.2 Provisions` per Overworld day. Consumption occurs only while the Band is in the Overworld; settlement interaction, deployment, and battle do not consume Provisions.
- Provisions are displayed and stored to one decimal place. Reaching zero Provisions does not block Overworld travel in this slice.
- A future Band morale decision may use missing Provisions, battle results and recency, Local Contract decisions, travel without camping, and entertainment. That decision is not part of this ticket.

Custom Troops that the player trains and equips are outside this Playable Vertical Slice and belong to future work.

## Comments

### Resolution — 2026-08-11

The human confirmed the fixed Troop equipment model, the recruitment price, starting resources, and Overworld-only Provisions consumption. Band morale was deliberately deferred, and custom Troops were ruled outside this slice.
