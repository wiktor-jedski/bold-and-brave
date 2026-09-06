import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fields = ['Purpose', 'Authoritative state and data', 'Inputs and commands', 'Transitions', 'Outputs and player-visible feedback', 'Failure and edge behavior', 'Fixed values or targets', 'Evidence checkpoints'];
const all = (text, tokens) => tokens.every(token => text.includes(token));
const block = (text, heading) => text.split(`### ${heading}\n`)[1]?.split(/^#{2,3} /m)[0] ?? '';

export function auditSpec(text, context) {
 const body = text.split('## 11. Completeness checklist')[0];
 const sections = text.split(/^## /m).slice(1);
 const rows = body.split('\n').filter(x => /^\| PVS-/.test(x));
 const checkpoints = [...body.matchAll(/^\| `(CP-[^`]+)` \|/gm)].map(x => x[1]);
 const scenarios = [...body.matchAll(/^\| `(SCN-\d{2}-[^`]+)` \| (\d+) \|/gm)];
 const terms = [...context.matchAll(/^\*\*([^*]+)\*\*:/gm)].map(x => x[1]);
 const definitions = block(body, 'Canonical terminology');
 const tables = [
  ['Local Contract state table', 15, ['`Available`', '`Accepted`', '`Resolved`', '`Failed`']],
  ['Battle outcome state table', 5, ['No settlement resident', 'Every Band member', 'Enemy Agent and all five bandits']],
  ['Settlement condition state table', 3, ['Bridge', 'Settlement center', '`Safe`', '`Damaged`']],
  ['Agent fate state table', 7, ['`Active`', '`Captive`', '`Executed`']],
  ['Save-safe boundary state table', 12, ['`Safe non-combat`', '`Transitioning`', '`Restoring snapshot`', '`Load failed`', '`Battle and resolution`']],
 ];
 const flow = block(body, 'End-to-end player journey');
 const checks = [
  all(body, ['frontier preparation', 'persistent human and material consequences', 'one timed defense Local Contract', 'one compact settlement', 'four recruitable Troop candidates', 'Record complete-run elapsed real time in seconds', 'from new-campaign preparation through changed-settlement return, including pauses and intervening loading', 'Record unpaused battle real time in seconds for bridge and settlement-center runs', 'excluding setup, paused time, and post-battle resolution', 'measured start/end boundaries', 'whether input is automated or human', 'capture/recording overhead', 'measurement limits', 'Simulation time is not elapsed real time', 'automated timing is not competent-human pacing evidence', 'Duration is record-only: no minimum or maximum duration and no forced delay to meet a duration', 'A watchdog timeout is a harness failure, not duration acceptance']),
  all(body, ['Chromium 151.0.7922.137', 'Linux x64', 'RTX 2070 SUPER', '610.57.04', '1920 × 1080', 'device-pixel ratio', 'secure context', 'physical WebGPU adapter', 'normal keyboard-and-mouse', 'download, decode, GPU upload', '1.00 second']),
  terms.length === 32 && terms.every(term => definitions.includes(`| ${term} |`)) && all(definitions, ['Only an Active Agent has a Disposition', 'It is not a settlement or faction score', 'same presentation as a dead Combatant', 'no active system in this slice']),
  sections.length === 11 && sections.every((section, i) => section.startsWith(`${i + 1}. `) && fields.every(field => section.includes(`| ${field} |`))),
  tables.every(([heading, count, values]) => { const table = block(body, heading); return table.split('\n').filter(x => /^\| /.test(x)).length === count + 2 && all(table, values); }),
  all(flow, ['```mermaid', 'Bridge battle', 'Settlement-center battle', 'Battle outcome', 'Enemy Agent fate', 'One aggregate bandit fate', 'Choose one Feat', 'Defeat summary', 'Return to changed settlement']) && all(block(body, 'Battle outcome state table'), ['No settlement resident', 'Every Band member']),
  all(body, ['24 CSS pixels', '60 Hz', '0.20 seconds', '0.5 Band-member-day', '12 Overworld hours', '25 Coin', '0.2 Provisions', '100 maximum stamina', '0.80 seconds', '2.1-second', '0.40-second', '0.30-second', 'health points', '7.0 world units/second', '1.25 real-time seconds', 'unsigned 32-bit', '16.67 milliseconds', '33.33 milliseconds']),
  new Set(checkpoints).size === 30 && scenarios.length === 20 && new Set(scenarios.map(x => x[1])).size === 20 && scenarios.every(x => +x[2] <= 4294967295) && rows.every(row => row.includes('`CP-')) && [...body.matchAll(/`(CP-[A-Z-]+)`/g)].every(x => checkpoints.includes(x[1])) && all(body, ['validated machine-readable snapshot', 'conventional assertions', 'target-tick input transcript', 'MUST', 'TARGET', 'SHOULD', 'OUT OF SCOPE']),
  all(body, ['PNG screenshot for a static visual claim', 'WebM clip only when the claim depends on a transition or timing', 'within 8 seconds', 'stable for two rendered frames']),
  all(body, ['CP-SAVE-FAILURE', 'CP-DELIVERY-DEVICE-LOSS', 'CP-SUPPORT-LOAD', 'CP-SUPPORT-GATE', 'audio-init failure', 'Illegal commands keep the current state', 'Defeat has priority', 'Old and corrupt entries', 'no gameplay event follows loss']),
  (body.match(/^\| PVS-OOS-/gm) ?? []).length === 11 && all(body, ['zero playable paths', 'zero acceptance checkpoints', 'explicit specification decision', 'Runtime generative AI', 'WebGL rendering fallback', 'Renown behavior', 'Detailed Captive management']),
  !/\b(TODO|TBD|FIXME)\b|\[(?:unresolved|placeholder)\]/i.test(body),
 ];
 const checklist = [...text.matchAll(/^- \[([ x])\] (.+)$/gm)];
 const clauses = checks.map((valid, index) => ({ clause: index + 1, valid, checked: checklist[index]?.[1] === 'x', description: checklist[index]?.[2] ?? 'Missing checklist item' }));
 return { eligible: checklist.length === 12 && clauses.every(x => x.valid && x.checked), clauses };
}

export function updateChecklist(text, result) {
 let index = 0;
 return text.replace(/^- \[[ x]\] (.+)$/gm, (_, description) => `- [${result.clauses[index++]?.valid ? 'x' : ' '}] ${description}`);
}

export function selfCheck(text, context) {
 const mutations = [
  s => s.replaceAll('Record complete-run elapsed real time in seconds', 'Omit complete-run elapsed-real-time evidence'),
  s => s.replaceAll('Chromium 151.0.7922.137', 'Chromium unspecified'),
  s => s.replace('| Band |', '| Squad |'),
  s => s.replace('| Purpose |', '| Missing purpose |'),
  s => s.replace('| `Available` | Enter settlement | None | `Available` | Enter normal settlement play. Do not create a Raid deadline. |', ''),
  s => s.replace('L[Settlement-center battle]', 'L[Missing battle]'),
  s => s.replaceAll('24 CSS pixels', '24 unspecified units'),
  s => s.replace('| `SCN-01-FULL-EARLY-RELEASE` | 1101 |', '| `SCN-01-FULL-EARLY-RELEASE` | 4294967296 |'),
  s => s.replace('PNG screenshot for a static visual claim', 'unrecorded static claim'),
  s => s.replaceAll('audio-init failure', 'audio case omitted'),
  s => s.replace('| PVS-OOS-011 |', '| Missing-exclusion |'),
  s => s.replace('## 3. Campaign and Scene flow', '## 3. Campaign and Scene flow\nTODO: unresolved normative rule'),
 ];
 if (!auditSpec(text, context).eligible) throw new Error('Conforming fixture is not eligible.');
 mutations.forEach((mutate, index) => {
  const invalid = mutate(text);
  const result = auditSpec(invalid, context);
  if (result.eligible || result.clauses[index].valid) throw new Error(`Clause ${index + 1}: invalid fixture was not blocked.`);
  const updated = updateChecklist(invalid, result);
  if (auditSpec(updated, context).clauses[index].checked) throw new Error(`Clause ${index + 1}: stale check was not cleared.`);
  const restored = updateChecklist(text, auditSpec(text, context));
  if (!auditSpec(restored, context).eligible) throw new Error(`Clause ${index + 1}: restored source is not eligible.`);
  const unchecked = text.replaceAll('- [x]', '- [ ]');
  if (auditSpec(unchecked, context).eligible) throw new Error('Unchecked fixture passed.');
  console.log(`Clause ${index + 1}: invalid blocked, check cleared, restored source passed.`);
 });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const path = '.scratch/playable-vertical-slice/spec.md';
 let text = readFileSync(path, 'utf8');
 const context = readFileSync('CONTEXT.md', 'utf8');
 if (process.argv.includes('--update-checklist')) {
  text = updateChecklist(text, auditSpec(text, context));
  writeFileSync(path, text);
 }
 const result = auditSpec(text, context);
 if (process.argv.includes('--self-check')) selfCheck(text, context);
 if (!result.eligible) { console.error(result.clauses.filter(x => !x.valid || !x.checked)); process.exitCode = 1; }
 else console.log('Specification handoff: PASS (all 12 clauses true and checked).');
}
