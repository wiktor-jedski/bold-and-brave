import { afterEach, describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/simulation';
import { validateSnapshot } from '../src/core/snapshot';
import type { Command, Snapshot } from '../src/core/types';
import { SCENARIOS } from '../src/scenarios/catalog';
import { Recorder, replay, stableHash, stableJSON } from '../src/scenarios/harness';
import { acceptContract, enterSettlement, recruit, runScenario, startBattle } from '../src/scenarios/run';

const owned: Simulation[] = [];
afterEach(() => { for (const simulation of owned.splice(0)) simulation.dispose(); });
async function create(seed = 1501): Promise<Simulation> {
 const simulation = await Simulation.create(seed);
 owned.push(simulation);
 return simulation;
}

function advance(simulation: Simulation, count: number): void {
 for (let tick = 0; tick < count; tick++) simulation.advance();
}

function act(simulation: Simulation, ...commands: Command[]): void {
 for (const command of commands) simulation.submit(command, simulation.project().tick + 1);
 simulation.advance();
}

function expectBattleInputIgnored(simulation: Simulation): void {
 const before = simulation.project();
 simulation.drainEvents();
 act(simulation,
  { type: 'move', direction: { x: 1, z: 0 }, facing: 0 },
  { type: 'pointer', phase: 'down', button: 0, x: 0, y: 0 },
  { type: 'pointer', phase: 'up', button: 0, x: 0, y: -48 },
  { type: 'guard-mode' }, { type: 'select-group', group: 'Troops' },
  { type: 'order', order: 'Hold' }, { type: 'hold-point', point: { x: 0, z: 14 } },
 );
 expect(simulation.project()).toEqual({ ...before, tick: before.tick + 1 });
 expect(simulation.drainEvents()).toEqual([]);
}

describe('public Simulation command contract', () => {
 it('applies commands only at their target tick and captures input independently of caller mutation', async () => {
  const simulation = await create();
  const command: Command = { type: 'travel', point: { x: 2, z: 2 } };
  simulation.submit(command, 5);
  command.point.x = -2;
  advance(simulation, 4);
  expect(simulation.project().campaign.position).toEqual({ x: 0, z: 2 });
  expect(simulation.project().campaign.time).toBe(8);
  simulation.advance();
  expect(simulation.project().campaign.position.x).toBeGreaterThan(0);
  expect(simulation.project().destination).toEqual({ x: 2, z: 2 });
 });

 it('rejects malformed, late and unavailable commands without campaign mutation', async () => {
  const simulation = await create();
  const initial = simulation.snapshot();
  for (const command of [
   { type: 'accept' }, { type: 'choose-feat', feat: 'Rapid Attack' },
   { type: 'speed', speed: 0 }, { type: 'travel', point: { x: NaN, z: 1 } },
   { type: 'recruit', candidateId: 'troop-1', confirmed: true },
   { type: 'choose-fate', choice: 'Capture' },
  ] as Command[]) {
   act(simulation, command);
   expect(simulation.snapshot()).toEqual(initial);
   expect(simulation.drainEvents().some((event) => event.type === 'invalid')).toBe(true);
  }
  simulation.submit({ type: 'travel', point: { x: 2, z: 2 } }, simulation.project().tick);
  simulation.advance();
  expect(simulation.snapshot()).toEqual(initial);
  expect(simulation.project().destination).toBeNull();
  expect(simulation.drainEvents().some((event) => event.type === 'invalid')).toBe(true);
 });

 it('prevents presentation callers from mutating authoritative projections and snapshots', async () => {
  const simulation = await create();
  const projection = simulation.project();
  expect(Reflect.set(projection.campaign, 'coin', 0)).toBe(false);
  expect(Reflect.set(projection.campaign.members[0], 'health', 0)).toBe(false);
  const snapshot = simulation.snapshot();
  snapshot.campaign.coin = 0;
  expect(simulation.project().campaign.coin).toBe(100);
  expect(simulation.project().campaign.members[0].health).toBe(100);
 });

 it('keeps campaign time and resources fixed through failed Scene loading and allows only explicit Retry', async () => {
  const simulation = await create();
  const run = new Recorder(simulation);
  run.act({ type: 'speed', speed: 4 }, { type: 'travel', point: { x: 0, z: 0 } });
  run.until((state) => state.boundary === 'Transitioning', 1000, 'Settlement entry');
  const campaign = run.state.campaign;
  expect(() => simulation.snapshot()).toThrow();
  run.act({ type: 'transition-failed' });
  run.tick(120);
  expect(run.state.boundary).toBe('Load failed');
  expect(run.state.campaign).toEqual(campaign);
  run.act({ type: 'transition-ready' });
  expect(run.state.boundary).toBe('Load failed');
  run.act({ type: 'retry-transition' });
  expect(run.state.boundary).toBe('Transitioning');
  run.act({ type: 'transition-ready' });
  expect(run.state.boundary).toBe('Safe non-combat');
  expect(run.state.phase).toBe('Settlement');
  expect(run.state.campaign.time).toBe(campaign.time);
  expect(run.state.campaign.provisions).toBe(campaign.provisions);
 });
});

describe('preparation and moving member-days', () => {
 it('uses identical distance, campaign time, and Provisions for all four speeds', async () => {
  for (const speed of [1, 2, 3, 4]) {
   const simulation = await create();
   act(simulation, { type: 'speed', speed }, { type: 'travel', point: { x: .75, z: 2 } });
   advance(simulation, 1800 / speed - 1);
   expect(simulation.project().campaign.position.x).toBeCloseTo(.75, 9);
   expect(simulation.project().campaign.time).toBeCloseTo(14, 9);
   expect(simulation.project().campaign.provisions).toBe(9.9);
   expect(simulation.project().campaign.provisionRemainder).toBeCloseTo(0, 9);
  }
 });

 it('stops consumption while stationary or paused and restores fractional consumption exactly', async () => {
  const simulation = await create();
  const initial = simulation.snapshot();
  advance(simulation, 300);
  expect(simulation.snapshot()).toEqual(initial);
  act(simulation, { type: 'travel', point: { x: 3, z: 2 } });
  advance(simulation, 299);
  expect(simulation.project().campaign.provisionRemainder).toBeCloseTo(1 / 3, 9);
  act(simulation, { type: 'pause' });
  const saved = simulation.snapshot();
  advance(simulation, 600);
  expect(simulation.snapshot()).toEqual(saved);
  const restored = await create();
  restored.restore(saved);
  expect(restored.snapshot()).toEqual(saved);
  act(simulation, { type: 'speed', speed: 4 }, { type: 'travel', point: { x: 2, z: 2 } });
  act(restored, { type: 'speed', speed: 4 }, { type: 'travel', point: { x: 2, z: 2 } });
  advance(simulation, 599);
  advance(restored, 599);
  expect(restored.snapshot()).toEqual(simulation.snapshot());
  expect(restored.project().campaign.provisions).toBeLessThan(saved.campaign.provisions);
 });

 it('keeps travel and health unchanged at zero Provisions', async () => {
  const supplied = await create();
  const depleted = await create();
  const preset = depleted.snapshot();
  preset.campaign.provisions = 0;
  depleted.restore(preset);
  for (const simulation of [supplied, depleted]) {
   act(simulation, { type: 'speed', speed: 4 }, { type: 'travel', point: { x: 3, z: 2 } });
   advance(simulation, 899);
  }
  expect(depleted.project().campaign.position).toEqual(supplied.project().campaign.position);
  expect(depleted.project().campaign.time).toBe(supplied.project().campaign.time);
  expect(depleted.project().campaign.members).toEqual(supplied.project().campaign.members);
  expect(depleted.project().campaign.agents).toEqual(supplied.project().campaign.agents);
  expect(depleted.project().campaign.provisions).toBe(0);
 });

 it('recruits zero through four only with Journal confirmation, charging exactly once at the 25-Coin boundary', async () => {
  const simulation = await create();
  const original = simulation.snapshot();
  act(simulation, { type: 'recruit', candidateId: 'troop-1', confirmed: true });
  expect(simulation.snapshot()).toEqual(original);
  act(simulation, { type: 'journal' }, { type: 'recruit', candidateId: 'troop-1', confirmed: false });
  expect(simulation.snapshot()).toEqual(original);
  for (let count = 1; count <= 4; count++) {
   act(simulation, { type: 'recruit', candidateId: `troop-${count}`, confirmed: true });
   expect(simulation.project().campaign.coin).toBe(100 - count * 25);
   expect(simulation.project().campaign.members.filter((member) => member.role === 'Troop')).toHaveLength(count);
   const member = simulation.project().campaign.members.find((member) => member.id === `troop-${count}`)!;
   expect({ weapon: member.weapon, shield: member.shield, health: member.health }).toEqual({ weapon: 'Staff', shield: false, health: 70 });
   const recruited = simulation.snapshot();
   act(simulation, { type: 'recruit', candidateId: `troop-${count}`, confirmed: true });
   expect(simulation.snapshot()).toEqual(recruited);
  }
  const full = simulation.snapshot();
  act(simulation, { type: 'recruit', candidateId: 'troop-5', confirmed: true });
  expect(simulation.snapshot()).toEqual(full);
 });

 it('disables saves, restoration and recruitment throughout bridge setup and active battle', async () => {
  const simulation = await create();
  const backup = simulation.snapshot();
  const run = new Recorder(simulation);
  enterSettlement(run);
  recruit(run, 2);
  acceptContract(run);
  for (let hour = 0; hour < 12; hour++) run.act({ type: 'wait' });
  const before = run.state.campaign;
  expect(run.state.phase).toBe('Setup');
  expect(() => simulation.snapshot()).toThrow();
  expect(() => simulation.restore(backup)).toThrow();
  run.act({ type: 'journal' }, { type: 'recruit', candidateId: 'troop-3', confirmed: true });
  expect(run.state.campaign.members).toEqual(before.members);
  expect(run.state.campaign.coin).toBe(50);
  run.until((state) => state.phase === 'Battle', 900, 'Battle start');
  expect(() => simulation.snapshot()).toThrow();
  expect(() => simulation.restore(backup)).toThrow();
 });
});

describe('untrusted save validation', () => {
 it('rejects corrupt shape and impossible campaign combinations atomically', async () => {
  const simulation = await create();
  const valid = simulation.snapshot();
  const corruptions: [string, (snapshot: Snapshot) => unknown][] = [
   ['old version', (snapshot) => ({ ...snapshot, version: 0 })],
   ['unexpected runtime state', (snapshot) => ({ ...snapshot, combatants: [] })],
   ['non-finite campaign time', (snapshot) => { snapshot.campaign.time = NaN; return snapshot; }],
   ['negative resources', (snapshot) => { snapshot.campaign.provisions = -1; return snapshot; }],
   ['unconsumed full remainder', (snapshot) => { snapshot.campaign.provisionRemainder = .5; return snapshot; }],
   ['duplicate Agent identity', (snapshot) => { snapshot.campaign.agents[1] = snapshot.campaign.agents[0]; return snapshot; }],
   ['invalid player equipment', (snapshot) => { snapshot.campaign.members[0].weapon = 'Staff'; return snapshot; }],
   ['terminal Agent has Disposition', (snapshot) => { snapshot.campaign.agents[2].fate = 'Captive'; return snapshot; }],
   ['Available with deadline', (snapshot) => { snapshot.campaign.deadline = 32; return snapshot; }],
   ['Feat without victory', (snapshot) => { snapshot.campaign.feat = 'Rapid Guard'; return snapshot; }],
   ['non-plain object', (snapshot) => Object.assign(Object.create({ hidden: true }), snapshot)],
  ];
  for (const [label, corrupt] of corruptions) {
   const malformed = corrupt(structuredClone(valid));
   expect(() => validateSnapshot(malformed), label).toThrow();
   expect(() => simulation.restore(malformed), label).toThrow();
   expect(simulation.snapshot(), label).toEqual(valid);
  }
  let getterRead = false;
  const accessor = structuredClone(valid);
  Object.defineProperty(accessor.campaign, 'coin', { enumerable: true, get: () => { getterRead = true; return 100; } });
  expect(() => simulation.restore(accessor)).toThrow();
  expect(getterRead).toBe(false);
  expect(simulation.snapshot()).toEqual(valid);
 });
});

describe('recorded public-command battles', () => {
 it.each([
  ['SCN-01-FULL-EARLY-RELEASE', 'Resolved', 'Safe', 'Rapid Guard'],
  ['SCN-02-FULL-EARLY-CAPTURE', 'Resolved', 'Safe', 'Rapid Stamina'],
  ['SCN-03-FULL-EARLY-EXECUTE', 'Resolved', 'Safe', 'Rapid Attack'],
  ['SCN-04-FULL-LATE-VICTORY', 'Resolved', 'Damaged', 'Rapid Guard'],
  ['SCN-05-BAND-DEFEAT', 'Failed', 'Damaged', null],
 ] as const)('%s follows actual battle outcome, ordered resolution and persistent consequences', async (id, contract, condition, feat) => {
  const scenario = SCENARIOS.find((entry) => entry.id === id)!;
  const trace = await runScenario(scenario);
  expect(trace.failure, trace.failure ?? undefined).toBeNull();
  expect(trace.final.phase).toBe('Settlement');
  expect(trace.final.campaign.contract).toBe(contract);
  expect(trace.final.campaign.condition).toBe(condition);
  expect(trace.final.campaign.feat).toBe(feat);
  expect(trace.events.filter((event) => event.type === 'victory' || event.type === 'defeat')).toHaveLength(1);
  expect(trace.transcript.some((entry) => entry.command.type === 'wait')).toBe(true);
 }, 120_000);

 it('restores a Downed Player to playable health after the remaining Band wins', async () => {
  const run = new Recorder(await create(1303), true);
  enterSettlement(run); recruit(run, 4); acceptContract(run);
  startBattle(run, false, false, deployed => {
   for (const group of ['Companion', 'Troops'] as const) {
    deployed.act({ type: 'select-group', group }, { type: 'order', order: 'Hold' }, { type: 'hold-point', point: { x: 19, z: 7 } });
   }
   deployed.act({ type: 'move', direction: { x: 0, z: -1 }, facing: Math.PI });
   deployed.tick(120);
   deployed.act({ type: 'move', direction: { x: 0, z: 0 }, facing: Math.PI });
  });
  run.until(state => state.combatants.find(actor => actor.id === 'player')?.status === 'Downed', 3000, 'Player Downed through real attacks');
  expect(run.state.phase).toBe('Battle');
  for (const group of ['Companion', 'Troops'] as const) run.act({ type: 'select-group', group }, { type: 'order', order: 'Engage' });
  run.until(state => state.phase !== 'Battle', 6000, 'Natural outcome');
  expect(run.state.outcome).toBe('Victory');
  expect(run.state.combatants.find(actor => actor.id === 'player')).toMatchObject({ status: 'Downed', health: 0 });
  run.act({ type: 'choose-fate', choice: 'Release' }, { type: 'confirm-fate' });
  if (run.state.phase === 'Bandit fate') run.act({ type: 'choose-fate', choice: 'Release' }, { type: 'confirm-fate' });
  run.act({ type: 'continue' }, { type: 'choose-feat', feat: 'Rapid Guard' });
  expect(run.state.phase).toBe('Settlement');
  expect(run.simulation.snapshot().campaign.members.find(member => member.id === 'player')).toMatchObject({ health: 25, available: true });
  const before = run.state.campaign.position.x;
  run.act({ type: 'move', direction: { x: 1, z: 0 }, facing: Math.PI });
  run.tick(12);
  expect(run.state.campaign.position.x).toBeGreaterThan(before + .5);
 });

 it('replays identical target-tick commands with identical complete states, feedback, seeded random state and outcome', async () => {
  const scenario = SCENARIOS.find((entry) => entry.id === 'SCN-19-DETERMINISTIC-REPLAY')!;
  const trace = await runScenario(scenario);
  expect(trace.failure, trace.failure ?? undefined).toBeNull();
  const repeated = await replay(scenario.seed, trace.transcript, trace.final.tick, trace.checkpoints.map((checkpoint) => checkpoint.tick));
  expect(stableJSON(repeated.states)).toBe(stableJSON(trace.checkpoints.map((checkpoint) => checkpoint.state)));
  expect(await stableHash(repeated.events)).toBe(await stableHash(trace.events));
  expect(repeated.final).toEqual(trace.final);
  expect(repeated.final.campaign.randomState).toBe(trace.final.campaign.randomState);
 }, 120_000);

 it.each(['SCN-06-RESIDENT-LOSS', 'SCN-07-COMBAT-SECTOR-MATRIX', 'SCN-08-SHIELD-EXHAUSTION', 'SCN-10-COMMAND-GROUPS'])('%s enforces its explicitly claimed public-input combat subset', async (id) => {
  const trace = await runScenario(SCENARIOS.find((entry) => entry.id === id)!);
  expect(trace.failure, trace.failure ?? undefined).toBeNull();
  expect(trace.checkpoints.flatMap((checkpoint) => checkpoint.assertions).every((assertion) => assertion.passed)).toBe(true);
 }, 120_000);

 it.each([[1303, 'Killed'], [56556, 'Downed']] as const)('keeps %s-seeded Troop casualties concealed until resolution, then preserves their exact %s consequences', async (seed, status) => {
  const trace = await runScenario({ ...SCENARIOS.find((entry) => entry.id === 'SCN-09-CASUALTY-MATRIX')!, seed });
  expect(trace.failure, trace.failure ?? undefined).toBeNull();
  const concealed = trace.checkpoints.find((checkpoint) => checkpoint.label === 'troop-casualty-concealed')!;
  expect(concealed).toBeDefined();
  expect(concealed.state.phase).toBe('Battle');
  const unavailable = trace.checkpoints.find((checkpoint) => checkpoint.label === 'inactive-group-rejected')!;
  const casualties = unavailable.state.combatants.filter((actor) => actor.role === 'Troop');
  expect(casualties).toHaveLength(2);
  for (const actor of casualties) {
   expect(actor.status).toBe(status);
   expect(unavailable.state.campaign.members.find((member) => member.id === actor.id)).toMatchObject({ health: 0, available: false, weapon: 'Staff' });
   const survivor = trace.final.campaign.members.find((member) => member.id === actor.id);
   if (status === 'Killed') expect(survivor).toBeUndefined();
   else expect(survivor).toEqual(unavailable.state.campaign.members.find((member) => member.id === actor.id));
  }
  expect(trace.final.phase).toBe('Settlement');
 }, 120_000);

 it('unavailable Troop selection leaves the Companion group selected', async () => {
  const run = new Recorder(await create(1401));
  enterSettlement(run);
  acceptContract(run);
  startBattle(run);
  run.act({ type: 'select-group', group: 'Troops' });
  expect(run.state.selectedGroup).toBe('Companion');
  expect(run.events.at(-1)?.type).toBe('invalid');
 });
});

describe('terminal outcome boundary component evidence', () => {
 it.each(['Band', 'Residents'] as const)('gives Defeat priority when %s and Raiders reach zero at the same boundary', async lostTeam => {
  const run = new Recorder(await create());
  enterSettlement(run); acceptContract(run); startBattle(run);
  // Fixture only: no public playthrough claim for simultaneous team elimination.
  const state = run.simulation['state'];
  for (const actor of state.combatants) {
   if (actor.team !== lostTeam && actor.team !== 'Raiders') continue;
   actor.health = 0;
   actor.status = actor.role === 'Resident' ? 'Killed' : 'Downed';
  }
  run.simulation.drainEvents();
  run.simulation.advance();
  expect(run.simulation.project()).toMatchObject({
   phase: 'Summary', outcome: 'Defeat',
   campaign: { contract: 'Failed', condition: 'Damaged', enemyChoice: null, feat: null },
  });
  expect(run.simulation.drainEvents().filter(event => event.type === 'victory' || event.type === 'defeat'))
   .toEqual([expect.objectContaining({ type: 'defeat' })]);
  const stopped = run.simulation.project().battleTime;
  expectBattleInputIgnored(run.simulation);
  advance(run.simulation, 120);
  expect(run.simulation.project().battleTime).toBe(stopped);
 });

 it('ignores battle input through victory resolution while valid choices still work', async () => {
  const run = new Recorder(await create());
  enterSettlement(run); acceptContract(run); startBattle(run);
  // Component boundary fixture; the public journey cases prove real victories.
  for (const actor of run.simulation['state'].combatants) {
   if (actor.team !== 'Raiders') continue;
   actor.health = 0;
   actor.status = 'Downed';
  }
  run.simulation.advance();
  expect(run.simulation.project().phase).toBe('Agent fate');
  expectBattleInputIgnored(run.simulation);
  act(run.simulation, { type: 'choose-fate', choice: 'Release' });
  expectBattleInputIgnored(run.simulation);
  act(run.simulation, { type: 'confirm-fate' });
  expect(run.simulation.project().phase).toBe('Bandit fate');
  expectBattleInputIgnored(run.simulation);
  act(run.simulation, { type: 'choose-fate', choice: 'Release' }, { type: 'confirm-fate' });
  expect(run.simulation.project().phase).toBe('Summary');
  expectBattleInputIgnored(run.simulation);
  act(run.simulation, { type: 'continue' });
  expect(run.simulation.project().phase).toBe('Feat');
  expectBattleInputIgnored(run.simulation);
  act(run.simulation, { type: 'choose-feat', feat: 'Rapid Guard' });
  expect(run.simulation.project()).toMatchObject({
   phase: 'Settlement', outcome: 'Victory', boundary: 'Safe non-combat',
   campaign: { contract: 'Resolved', condition: 'Safe', enemyChoice: 'Release', feat: 'Rapid Guard' },
  });
 });
});
