Type: grilling
Status: resolved
Assignee: Codex
Blocked by: 15, 17

# Structure the Playable Vertical Slice handoff specification

## Question

What structure and completeness rules should the decision-complete Playable Vertical Slice specification use so another team can plan implementation without reopening resolved domain, architecture, evidence, tuning, or support-envelope decisions?

## Answer

Use one canonical `.scratch/playable-vertical-slice/spec.md` as a self-contained normative contract. Organize it by subsystem, with these required sections:

- purpose and destination;
- scope, support envelope, and canonical terminology;
- campaign and Scene flow;
- combat, Band commands, and Combatant behavior;
- Agent relationships, fates, and player progression;
- preparation, Coin, and Provisions;
- presentation, interface, and audio;
- architecture, persistence, and browser delivery;
- deterministic scenarios and evidence;
- out-of-scope boundaries; and
- a completeness checklist.

Use explicit requirement classes: `MUST` for contract and support commitments, `TARGET` for authored tuning and performance goals, `SHOULD` for implementation guidance, and `OUT OF SCOPE` for exclusions. Every section must state its purpose, authoritative state and data, inputs and commands, transitions, outputs and player-visible feedback, failure and edge behavior, fixed values or targets, and evidence checkpoints.

Express `Local Contract`, `Agent fate`, `Settlement condition`, save-safe boundaries, and battle outcomes with state tables. Use one end-to-end flow diagram for the player journey. Every acceptance claim must map to a named deterministic scenario, seed policy, checkpoint, machine-readable assertion, and visual-artifact rule. Use screenshots for static visual claims and short clips only for transitions or timing.

The handoff must contain no in-scope `TBD` or unresolved decision. Keep unresolved map fog outside the specification and point to the map for that future work. Include technical decisions as contract-level constraints, not file layouts, phase tickets, class designs, or task order.

Maintainers may edit the specification directly without a traceability requirement. This permits divergence from closed ticket answers; the map retains the existing decision history.

## Comments

### Resolution — 2026-08-18

The human confirmed the single self-contained specification, subsystem-first structure, explicit requirement classes, contract-tuple completeness gate, state-table and flow-diagram format, checkpoint evidence traceability, contract-level technical detail, and exclusion of unresolved map fog.
