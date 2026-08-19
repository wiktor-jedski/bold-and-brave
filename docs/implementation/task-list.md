# Task List

Valid Task statuses: OPEN, PREPARED, PASSED
ID: Use growing unique integers

| ID | Architecture Component | Status | Description | Depends On (ID) | Verification Criteria |
| --- | --- | --- | --- | --- | --- |
| 1 | None — repository documentation | OPEN | Replace the obsolete feature list in `README.md` with a short description of the Playable Vertical Slice. Use the canonical terms from [CONTEXT.md](../../CONTEXT.md), link the normative [requirements](../requirements.md) and [architecture](../architecture.md), and do not add implementation details or duplicate either contract. This produces the [repository-description result](plan.md#phase-1--repository-description). |  | Manual review passes when the rendered `README.md` gives a concise Playable Vertical Slice description, uses the canonical terms, links all three normative sources, contains none of the obsolete feature-list entries, and makes no product promise outside the current slice. No automated test or command applies because this task changes repository documentation only; see the recorded testing coverage deviation. |
