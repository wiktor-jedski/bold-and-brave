# Task List

Valid Task statuses: OPEN, PREPARED, PASSED
ID: Use growing unique integers

## Phase 0 — Handoff gate

| ID | Architecture Component | Status | Description | Depends On (ID) | Verification |
| --- | --- | --- | --- | --- | --- |
| 1 | Specification audit | PASSED | Check required sections, contract fields, state tables, scenario seeds, checkpoint references, fixed units, exclusions, and completeness. | — | `bun run audit:spec`: valid specification passes. |
| 2 | Specification audit | PASSED | Block handoff for a controlled failure of each of the 12 checklist clauses. Clear each invalid check on rerun and restore the valid checks when the source is restored. | 1 | `bun run audit:spec`: all 12 invalid fixtures are blocked; their checks are cleared; restored fixtures pass. |

## Phase 1 — Scope fence

| ID | Architecture Component | Status | Description | Depends On (ID) | Verification |
| --- | --- | --- | --- | --- | --- |
| 3 | Scope audit | PASSED | Check the static content, controls, panels, scenario catalogue, and implementation plan against all eleven excluded-scope clauses. | 2 | `bun run audit:scope`: all static checks pass; `test-results/scope-audit.json` records the inputs and results. |

## Acceptance evidence

The source now includes the browser game and its deterministic Simulation. Generated core and browser reports under `test-results/` identify their verified behavior and missing coverage. A successful build or functional test run does not accept an unreviewed visual or audio checkpoint. Do not mark later implementation phases PASSED from the build alone.

### Verification record — 2026-09-05 UTC

- `bun run test`: 103 tests passed in nine files. This includes combat boundaries, Feat timing, public-command Player recovery, terminal combat-input silence, mouse-input interactions, Arena isolation, focused Pause-panel travel shortcuts, and the automated controller's low-stamina guard-loop regression. TypeScript also passed.
- `bun run build`: TypeScript and the production build passed. Vite reports a large-bundle warning.
- `bun run audit:scope`: all static excluded-scope checks passed.
- `bun run audit:spec`: the valid document and all 12 invalid-fixture recovery checks passed.
- `bun run scenarios`: all 13 core recipes and their replay checks passed. Browser and document scenarios are not counted as core passes.
- Current core evidence: `test-results/core-evidence/2026-09-05T16-15-01-013Z-114210/manifest.json`. All 13 core recipes and replay checks passed after the controller fix. The separate four-Troop Player-recovery path is in `test-results/player-recovery-public.json`.
- Before the player-feedback changes, the full isolated browser run in `test-results/browser-final-contract/` passed all 30 checks. All six complete outcome journeys reached their real terminal result and changed-settlement return. That historical run does not verify the revised human model, mouse controls, or Arena.
- Earlier presentation evidence is in `test-results/browser-release-check/`. The corrected save-panel layouts passed four focused checks in `test-results/browser-save-layout/`: manual restore, denied storage, full storage, and old/corrupt saves. Reviewed error views have a stable Journal heading, one inline storage error, and no duplicate error notice.
- The direct kneeling PNG and 7.508-second battle-to-fate clip were visually reviewed. Both knees reach the ground and the lower legs fold behind the body. The clip contains real game audio; listening quality is not accepted from signal measurements.
- Browser checks use a separate copy on port 4181. They do not control, reload, or close the player window on port 5174.
- Later focused checks passed for the five revised outcome views, zero-Provisions travel, and all three manual slots with non-zero fractional remainder. See `test-results/browser-outcome-views/`, `test-results/browser-zero-provisions/`, and `test-results/browser-three-slots/`. The outcome-view run also preserves the first failed zero-Provisions check; it sent the speed key before Journal closure was processed. The corrected check waits for the visible input state and passes separately.
- Hold indicators originally overlapped Command controls. The regression failed in `test-results/browser-marker-overlap-before/` and passed in the full browser run after the indicators moved to the screen edge. The corrected PNG was reviewed.
- Damaged-settlement captures exposed a floating chimney. Its shaft now reaches the wall top. Capture, late victory, and the metrics-only run passed in `test-results/browser-chimney-fix/`; the repaired damaged-house PNG was reviewed.
- Journal consequence captures scroll the section into view and retain the browser scrollbar. Capture, Execute, and Failure reaction text was reviewed from the real PNGs. The outcome-specific dialogue assertions remain part of the required acceptance matrix.
- `tests/combat-matrix.test.ts` checks all weapon/sector mappings, multi-target and friendly-fire rules, matched/mismatched guards, shield approaches, recoil lock, all six casualty roles, and the closest representable draws around the 0.20 threshold.
- `tests/feat-timing.test.ts` obtains each Feat through a real victory, then compares its persisted effect with base timings in a component fixture. The one-contract Simulation has no playable second battle after the Feat choice; these checks do not claim one.
- Player-feedback checks are separate from the original acceptance matrix. `test-results/player-feedback/smoke-manifest.json` records actual Settlement mouse turning and sidesteps, natural Duel defeat, silent terminal combat input, restart, Team Victory, and exact campaign/manual-save/autosave preservation on exit. These checks use Chromium 151.0.7922.173, not the older promised support row.
- The revised human was built through Blender MCP and exported with the existing named joints and Walk/Idle clips. Two consecutive authoring runs produced the same GLB hash. Skin and leather now use correctly converted linear glTF material colours. The Arena and human PNGs were inspected in the game.
- Silent visual recordings in `test-results/player-feedback/` show the revised Thrust and right-mouse guard. They are animation evidence, not audio acceptance. The black first recording and software-adapter startup rejection are preserved as failed capture/setup evidence.
- Rendering and animation acceptance is being renewed against `assets/reference/character.png`. The user rejected the previous Blender character. Audio verification and validation are assigned to the user; no further automated or listening acceptance is claimed here.
- Renewed verification found a real Pause-panel shortcut regression. The UI focus guard rejected travel speed keys before their handler. The reduced input test failed before the correction and passed after it; the actual recruitment/travel/bridge browser journey also passed.
- The recorded browser controller stalled with Player health 100, opponent health 8, and too little stamina for its unnecessary two-attack reserve. Exact command replay reproduced the stall for 6,000 further ticks. Using the actual 12-stamina attack cost produced natural Victory after 45 further ticks. A reduced real-combat regression fails before this controller-only fix and passes after it. Gameplay constants and outcome rules did not change.
- `test-results/browser-controller-capture-fix/` passed both the travel/bridge journey and full natural bridge Victory through fate, Feat, and changed-settlement return on Chromium 151.0.7922.137. The original CDP transition clip retained a stale scene; it is not accepted visual evidence. The corrected capture reads the real WebGPU pixels under the real DOM for each sample. Its deadline-to-setup clip was inspected and shows both scenes and the camera transition.
- The first renewed run against production used a development-only observation interface and failed for that reason. This does not prove a production gameplay failure. Production UI verification must use visible controls, not `window.boldAndBrave`.

The following table reconciles each specification checkpoint. “Partial” means that recorded assertions passed, but the complete checkpoint has not been accepted. A screenshot or a typed audio log alone is not evidence of complete presentation quality.

| Checkpoint | Verified evidence | Remaining acceptance |
| --- | --- | --- |
| `CP-SPEC-END-TO-END` | All six core/browser outcome journeys, summaries, persistent consequences, and recorded real durations. | Representative-quality review. Automated timing is not a human first-playthrough measurement. No duration bound applies. |
| `CP-SUPPORT-GATE` | Real promised browser/GPU/driver/viewport/DPR, WebGPU backend, five rejected startup conditions, and reviewed ready/error PNGs. | None for the exercised gate states. |
| `CP-SUPPORT-LOAD` | Download failure, stopped loading, explicit Retry, Scene-entry rollback, and restore rollback. | Review of all loading-stage records and transition clips. |
| `CP-FLOW-CONTRACT` | Decline, Accept, deadline, Wait, travel speed, pause, and resource equivalence. | Review of offer, Journal, and speed-transition artifacts. |
| `CP-FLOW-EARLY` | Core bridge setup and resolution; live browser victory, confirmed Release, Feat, and Safe return. | Review of the complete setup and transition artifact set. |
| `CP-FLOW-LATE` | Core and browser deadline crossing, immediate center battle, natural victory, and Damaged return. The western damaged-house view was reviewed after the chimney repair. | Complete boundary-transition clip review. |
| `CP-FLOW-DEFEAT` | Core and browser Band-defeat and resident-loss routes freeze combat and return Failed/Damaged. Component tests prove Defeat priority when either protected team and Raiders reach zero together. Terminal combat input is silent; resolution choices still work. | Trigger-to-summary clips for both campaign defeat routes; the existing short return clips do not prove the trigger. |
| `CP-COMBAT-INPUT` | Sector selection, dead zone, stamina charge, feint, committed recovery, every movement-state multiplier, and key-release regressions. | Complete named-scenario selected-sector PNG and feint-clip matrix. |
| `CP-COMBAT-GUARD` | Four matched sectors, mismatch/full damage, four shield approaches, recoil lock, drain, exhaustion, and base/modified shield damage checks one tick before and at readiness. | Reviewed mismatch/exhaustion artifacts for the named scenarios. |
| `CP-COMBAT-DAMAGE` | All eight weapon/sector mappings, multi-target swings, once-per-attack damage, friendly-fire exclusion, and complete movement-state multipliers. | Reviewed multi-target clip. |
| `CP-COMBAT-CASUALTY` | Six-role/threshold matrix, inactive immunity, concealed Troop losses and persistence. A real public-command victory restores the Downed Player to 25 health and permits movement. The Capture browser run records Companion recovery from 0 to 25 health. | Complete concealed/revealed battle-body artifact pair. |
| `CP-COMMAND-GROUPS` | Four Troops, independent Follow/Hold/Engage state, invalid-point preservation, next-tick retargeting, and reviewed screen-edge indicators clear of Command controls. | Reviewed order-transition clip. |
| `CP-COMMAND-AI` | Recorded formation, resident, targeting, and attack-pressure invariants. | Complete target-loss return and resident-flee presentation evidence. |
| `CP-REL-RELEASE` | Exact Agent relationship and Grievance results; live browser confirmed Release and returned reactions. | Review of the complete choice and reaction artifact set. |
| `CP-REL-CAPTURE` | Natural browser victory, confirmed Capture, exact Captive count/Agent facts, and reviewed Capture reactions and scrolled Journal. | Complete choice/summary visual acceptance record. |
| `CP-REL-EXECUTE` | Natural browser victory, confirmed Execute, exact Agent facts, and reviewed execution reactions and scrolled Journal. | Complete choice/summary visual acceptance record. |
| `CP-REL-FAILURE` | Both natural browser defeats; exact Hostile relationships and `Settlement harmed`; reviewed summary and both returned reactions. | None for the exercised summary/reaction views. |
| `CP-FEAT` | Confirmed persistent choices, reviewed Feat/Journal PNGs, all three before/after component timing comparisons, and contact blocking exactly at modified shield readiness. | Before/after timing WebM. Post-choice component evidence does not claim a second playable battle. |
| `CP-PREP-RECRUIT` | Zero through four Troops, fixed cost, confirmation, and insufficient-Coin rejection. | Review of before/after Journal PNGs. |
| `CP-PREP-PROVISIONS` | Exact consumption, speed/pause equivalence, real three-slot fractional restore, and reviewed 10.0/0.0 Journal views. Actual travel continues at zero with unchanged Band health/equipment. | None for these resource and display boundaries. |
| `CP-UI-HUD` | Contextual controls and silent passive updates exercised through browser journeys. | Complete named settlement, preview, guard, and Journal visual matrix. |
| `CP-UI-FATE` | Pending choice, cancellation, confirmation, concealed survival state, and reviewed kneeling geometry. | Reviewed battle bodies, DOM composite, and complete named-scenario artifacts. |
| `CP-AUDIO` | Historical master-output recordings, sector logs, readiness failure/Retry, and silent passive updates are retained. | User-owned verification and validation. Not an assistant completion gate for the current rendering and animation work. |
| `CP-ARCH-DETERMINISM` | Identical core replay hashes and immutable projection checks. | Browser artifact-metadata determinism and broader adapter-isolation evidence. |
| `CP-SAVE-BOUNDARY` | Core unsafe-boundary rejection and browser disabled battle controls. | Complete visible control matrix across every boundary. |
| `CP-SAVE-RESTORE` | Real IndexedDB separation and reload of all three manual slots, complete campaign equality with non-zero remainder, and autosave launch recovery. | Full Scene-transition artifact review. |
| `CP-SAVE-FAILURE` | Old/corrupt entries, denied/full storage, Retry, confirmed deletion/reset, retained live campaign, and reviewed corrected error layouts. | Complete confirmation-artifact review. |
| `CP-DELIVERY-DEVICE-LOSS` | Real active-battle device loss freezes ticks and offers Reload; startup repeats. | Visual review of the complete transition clip. |
| `CP-PERFORMANCE` | Current model/controller, seed 1803, Chromium 151.0.7922.137, RTX 2070 SUPER, driver 610.57.04: 1,118 Battle frames; 16.666011 ms average; 16.8 ms p95; no below-30-fps interval. Natural Victory after 18.6326 recorded unpaused seconds. `test-results/browser-current-performance/` passed without image/video encoding. | None for this measured run. Instrumentation overhead remains unquantified; this is not a guarantee under every machine-load condition. No duration limit applies. |
| `CP-SPEC-AUDIT` | All document and negative-fixture checks passed. | None for this document-only checkpoint. |

The approved shorter slice keeps one Local Contract and the fixed combat and movement values. Journey and battle duration are record-only. `REQ-167` and `REQ-168` replace the deprecated duration bounds in `REQ-003` and `REQ-060`. No minimum, maximum, forced delay, or Simulation-tick substitute applies.

Each browser `manifest.json` contains `durationEvidence`: monotonic-clock boundaries, complete-journey elapsed seconds including pauses/loading, unpaused Battle frame intervals through a natural outcome, automated input provenance, recording overhead, and measurement limits. A null journey end means that the run did not record a complete return. Boundary precision is one delivered frame. Recording overhead is included and unquantified; deferred artifact encoding is excluded. A harness watchdog failure is not a duration-acceptance failure.

Historical measurements remain in `test-results/browser-performance-1803/` and `test-results/browser-performance-defensive-1803/`: 36.17 s for natural Defeat and 34.25 s for natural Victory. Their old duration assertions do not apply to the current contract. `test-results/browser-recorded-journeys/` preserves the 25/28 run, including its 16.694744 ms average-frame failure. That failure remains a failure; later passing runs do not erase it. The full 30-check run measured 1,207 Battle frames at 16.665949 ms average and 16.7 ms p95, with no below-30-fps interval and a natural Victory after 20.1158 s.

The separate CPU profile in `test-results/browser-cpu-profile/` is diagnosis only. Its `profile-context.json` records the additional profiler overhead and substantial idle time. It is not frame acceptance evidence and did not justify a character-rendering rewrite.
