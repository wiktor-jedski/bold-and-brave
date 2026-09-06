import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { SCENARIOS } from '../src/scenarios/catalog';
import { replay, stableHash, stableJSON } from '../src/scenarios/harness';
import { runScenario } from '../src/scenarios/run';

const arguments_ = process.argv.slice(2).filter((argument) => argument !== '--');
const selected: string[] = [];
let output = 'test-results/core-evidence';
for (let index = 0; index < arguments_.length; index++) {
 const argument = arguments_[index];
 if (argument === '--scenario' && arguments_[index + 1]) selected.push(arguments_[++index]);
 else if (argument === '--output' && arguments_[index + 1]) output = arguments_[++index];
 else throw new Error(`Unknown or incomplete argument: ${argument}. Usage: bun run scenarios --scenario SCN-19-DETERMINISTIC-REPLAY --output test-results/core-evidence`);
}
for (const id of selected) if (!SCENARIOS.some((scenario) => scenario.id === id)) throw new Error(`Unknown canonical scenario: ${id}`);

const root = process.cwd();
const specification = await readFile(join(root, '.scratch/playable-vertical-slice/spec.md'));
const specificationHash = createHash('sha256').update(specification).digest('hex');
async function sourceFiles(directory: string): Promise<string[]> {
 const entries = await readdir(directory, { withFileTypes: true });
 const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? sourceFiles(join(directory, entry.name)) : Promise.resolve([join(directory, entry.name)])));
 return nested.flat();
}
const sources = [...await sourceFiles(join(root, 'src')), join(root, 'scripts/run-scenarios.ts'), join(root, 'package.json'), join(root, 'bun.lock')].sort();
const buildDigest = createHash('sha256');
for (const path of sources) {
 buildDigest.update(relative(root, path));
 buildDigest.update('\0');
 buildDigest.update(await readFile(path));
 buildDigest.update('\0');
}
const buildHash = buildDigest.digest('hex');
const runDirectory = resolve(output, `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
await mkdir(runDirectory, { recursive: true });
const environment = { runtime: process.version, platform: process.platform, architecture: process.arch, browser: null, gpu: null, driver: null, viewport: null, devicePixelRatio: null, promisedRowVerified: false };
const reports: Record<string, unknown>[] = [];
let failed = false;

for (const scenario of SCENARIOS.filter((entry) => selected.length === 0 || selected.includes(entry.id))) {
 if (!scenario.recipe) {
  reports.push({ scenario: scenario.id, seed: scenario.seed, execution: scenario.execution, outcome: 'not-run', requiredPath: scenario.path, checkpoints: scenario.checkpoints, remaining: scenario.remaining, reason: scenario.execution === 'core-and-browser' ? 'The required core matrix/controller is not implemented. Entry commands are not coverage.' : 'Requires independent browser/human or document evidence. Core execution is not a substitute.' });
  console.info(`${scenario.id}: NOT RUN (${scenario.execution})`);
  continue;
 }
 const directory = join(runDirectory, scenario.id);
 await mkdir(directory, { recursive: true });
 const startedAt = new Date().toISOString();
 const trace = await runScenario(scenario);
 const transcriptHash = await stableHash(trace.transcript);
 await writeFile(join(directory, 'transcript.json'), stableJSON({ reset: scenario.reset, seed: scenario.seed, commands: trace.transcript }) + '\n');
 await writeFile(join(directory, 'events.json'), stableJSON(trace.events) + '\n');
 await writeFile(join(directory, 'final-state.json'), stableJSON(trace.final) + '\n');
 const checkpoints: Record<string, unknown>[] = [];
 for (const [index, checkpoint] of trace.checkpoints.entries()) {
  const statePath = `${String(index + 1).padStart(3, '0')}-${checkpoint.id}-${checkpoint.label}.json`;
  await writeFile(join(directory, statePath), stableJSON(checkpoint.state) + '\n');
  checkpoints.push({
   buildIdentifier: buildHash, buildHash, specificationHash, environment, renderBackend: 'none', scenario: scenario.id, seed: scenario.seed,
   inputTranscriptHash: transcriptHash, checkpoint: checkpoint.id, label: checkpoint.label, simulationTick: checkpoint.tick,
   claimScope: checkpoint.claimScope, expectedAssertions: checkpoint.assertions.map(({ name, expected }) => ({ name, expected })),
   actualAssertionResults: checkpoint.assertions.map(({ name, actual, passed }) => ({ name, actual, passed })),
   outcome: checkpoint.assertions.every((assertion) => assertion.passed) ? 'core-state-passed' : 'failed',
   statePath, stateHash: await stableHash(checkpoint.state), artifactType: 'none', artifactPath: null, frameMetrics: null,
  });
 }
 let replayError: string | null = null;
 let replayChecks: Record<string, unknown>[] = [];
 try {
  const repeated = await replay(scenario.seed, trace.transcript, trace.final.tick, trace.checkpoints.map((checkpoint) => checkpoint.tick));
  await writeFile(join(directory, 'replay-final-state.json'), stableJSON(repeated.final) + '\n');
  await writeFile(join(directory, 'replay-events.json'), stableJSON(repeated.events) + '\n');
  const comparisons: [string, unknown, unknown][] = [
   ['checkpoint-state', trace.checkpoints.map((checkpoint) => checkpoint.state), repeated.states],
   ['feedback-event', trace.events, repeated.events],
   ['final-state', trace.final, repeated.final],
   ['random-state', trace.final.campaign.randomState, repeated.final.campaign.randomState],
   ['outcome', { outcome: trace.final.outcome, contract: trace.final.campaign.contract }, { outcome: repeated.final.outcome, contract: repeated.final.campaign.contract }],
   ['state-artifact-metadata', trace.checkpoints.map((checkpoint) => ({ checkpoint: checkpoint.id, tick: checkpoint.tick, artifactType: 'none' })), repeated.states.map((state, index) => ({ checkpoint: trace.checkpoints[index].id, tick: state.tick, artifactType: 'none' }))],
  ];
  replayChecks = await Promise.all(comparisons.map(async ([name, expected, actual]) => {
   const expectedHash = await stableHash(expected);
   const actualHash = await stableHash(actual);
   return { name, algorithm: 'SHA-256', expectedHash, actualHash, passed: expectedHash === actualHash };
  }));
  if (replayChecks.some((check) => check.passed !== true)) replayError = 'The clean exact-tick replay differs from the recorded run.';
 } catch (error) { replayError = error instanceof Error ? error.message : String(error); }
 if (scenario.id === 'SCN-19-DETERMINISTIC-REPLAY') checkpoints.push({
  buildIdentifier: buildHash, buildHash, specificationHash, environment, renderBackend: 'none', scenario: scenario.id, seed: scenario.seed,
  inputTranscriptHash: transcriptHash, checkpoint: 'CP-ARCH-DETERMINISM', label: 'clean-exact-tick-replay', simulationTick: trace.final.tick,
  claimScope: 'core-state-only', expectedAssertions: replayChecks.map((check) => ({ name: check.name, expected: check.expectedHash })),
  actualAssertionResults: replayChecks.map((check) => ({ name: check.name, actual: check.actualHash, passed: check.passed })),
  outcome: replayError || trace.failure ? 'failed' : 'core-state-passed', failure: replayError,
  statePath: 'final-state.json', stateHash: await stableHash(trace.final), artifactType: 'none', artifactPath: null, frameMetrics: null,
 });
 const failure = trace.failure ?? replayError;
 const report = {
  scenario: scenario.id, seed: scenario.seed, reset: scenario.reset, requiredPath: scenario.path, startedAt,
  buildIdentifier: buildHash, buildHash, specificationHash, environment, renderBackend: 'none', inputTranscriptHash: transcriptHash,
  transcriptPath: 'transcript.json', eventsPath: 'events.json', finalStatePath: 'final-state.json', simulationTick: trace.final.tick,
  actualBattleSeconds: Math.max(trace.final.battleTime, ...trace.checkpoints.map((checkpoint) => checkpoint.state.battleTime)), firstPlaythroughDuration: { outcome: 'not-measured', reason: 'Exact core ticks are not a competent human real-time playthrough.' },
  outcome: failure ? 'failed' : 'partial', coreAssertions: failure ? 'failed' : 'passed', failure, replayError, replayChecks, checkpoints,
  remaining: scenario.remaining, unexercisedCatalogCheckpoints: scenario.checkpoints.filter((id) => !checkpoints.some((checkpoint) => checkpoint.checkpoint === id)),
  artifactType: 'none', artifactPath: null, frameMetrics: null,
  browserConsoleRecords: null, browserConsoleReason: 'No browser was launched by this core-only runner.',
 };
 await writeFile(join(directory, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
 reports.push({ scenario: scenario.id, seed: scenario.seed, outcome: report.outcome, coreAssertions: report.coreAssertions, failure, manifestPath: relative(runDirectory, join(directory, 'manifest.json')), remaining: scenario.remaining });
 failed ||= Boolean(failure);
 console.info(`${scenario.id}: ${failure ? 'FAILED: ' + failure : 'CORE CHECKS PASSED; acceptance remains partial'} (${trace.final.tick} ticks, ${trace.transcript.length} commands)`);
}
await writeFile(join(runDirectory, 'manifest.json'), JSON.stringify({ buildHash, specificationHash, environment, renderBackend: 'none', outcome: failed ? 'failed' : 'partial', scenarios: reports }, null, 2) + '\n');
console.info(`Evidence: ${relative(root, join(runDirectory, 'manifest.json'))}`);
if (failed) process.exitCode = 1;
