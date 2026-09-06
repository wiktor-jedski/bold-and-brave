import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CombatSystem } from '../src/core/combat';
import { Simulation } from '../src/core/simulation';
import type { Command, Emit, Feat, Feedback, GameState, Snapshot } from '../src/core/types';
import { Recorder } from '../src/scenarios/harness';
import { acceptContract, enterSettlement, fight, recruit, startBattle } from '../src/scenarios/run';

const owned: { dispose(): void }[] = [];
const victories = new Map<Feat, Snapshot>();
let beforeVictory: Snapshot;
type TimingRun = Pick<Recorder, 'state' | 'events' | 'act' | 'tick'>;

afterEach(() => { for (const resource of owned.splice(0)) resource.dispose(); });

beforeAll(async () => {
 for (const feat of ['Rapid Guard', 'Rapid Attack', 'Rapid Stamina'] as const) {
  const simulation = await Simulation.create(1601);
  try {
   const run = new Recorder(simulation);
   enterSettlement(run);
   recruit(run, 2);
   beforeVictory ??= simulation.snapshot();
   acceptContract(run);
   startBattle(run);
   fight(run);
   expect(run.state.outcome, `${feat} requires a completed victory`).toBe('Victory');
   run.act({ type: 'choose-fate', choice: 'Release' }, { type: 'confirm-fate' });
   if (run.state.phase === 'Bandit fate') run.act({ type: 'choose-fate', choice: 'Release' }, { type: 'confirm-fate' });
   run.act({ type: 'continue' });
   run.act({ type: 'choose-feat', feat });
   // snapshot() validates the complete, save-safe result of the real choice.
   victories.set(feat, simulation.snapshot());
  } finally { simulation.dispose(); }
 }
}, 120_000);

async function comparison(feat: Feat): Promise<[TimingRun, TimingRun]> {
 const simulation = await Simulation.create(1601);
 owned.push(simulation);
 simulation.restore(beforeVictory);
 const before = new Recorder(simulation);
 before.act({ type: 'talk', agentId: 'giver' }, { type: 'accept' });
 for (let hour = 0; hour < 12; hour++) before.act({ type: 'wait' });
 expect(before.state.phase).toBe('Setup');

 // Component evidence only: the one-contract Simulation cannot start combat
 // after victory. Use its real chosen campaign in a separate timing fixture.
 // Never change the state of a running Simulation or create a second contract.
 const state = structuredClone(before.state) as GameState;
 state.campaign = structuredClone(victories.get(feat)!.campaign);
 const combat = new CombatSystem();
 owned.push(combat);
 combat.setup(state, 'Bridge');
 const events: Feedback[] = [];
 const emit: Emit = event => { events.push({ ...event, tick: state.tick }); };
 const step = (commands?: Command[]): void => {
  state.tick++;
  if (commands) for (const command of commands) combat.command(state, command, emit);
  combat.step(state, emit);
 };
 return [before, {
  get state() { return state; },
  events,
  act(...commands) { step(commands); },
  tick(count = 1) { for (let tick = 0; tick < count; tick++) step(); },
 }];
}

function player(run: TimingRun) { return run.state.combatants.find(actor => actor.role === 'Player')!; }
function guardTicks(run: TimingRun, start: number): number[] {
 return run.events.filter(event => event.type === 'guard' && event.actorId === 'player' && event.tick > start).map(event => event.tick - start);
}

// The base side uses public Simulation commands during the real setup window.
// The post-choice side uses CombatSystem commands and feedback with the persisted
// Feat. These comparisons do not claim a playable post-victory battle or complete
// SCN-12 acceptance. All deadlines are sampled at the first 60 Hz tick at or after
// the specified duration; only non-integral durations round up to a tick.
describe('CP-FEAT timing: public base and post-choice component evidence', () => {
 it('changes an effective Directional Guard sector after 0.20 seconds instead of 0.25 seconds', async () => {
  const runs = await comparison('Rapid Guard');
  for (const run of runs) {
   run.act({ type: 'pointer', phase: 'down', button: 2, x: 0, y: 0 }, { type: 'pointer', phase: 'move', button: 2, x: 0, y: -40 });
   run.tick(14);
   expect(player(run).effectiveSector).toBe('Overhead');
  }
  const starts = runs.map(run => run.state.tick);
  for (const run of runs) {
   run.act({ type: 'pointer', phase: 'move', button: 2, x: -40, y: 0 });
   run.tick(10);
   expect(player(run).sector).toBe('Left cut');
   expect(player(run).effectiveSector).toBe('Overhead');
   run.tick();
  }
  expect(runs.map(run => player(run).effectiveSector)).toEqual(['Overhead', 'Left cut']);
  expect(guardTicks(runs[1], starts[1]!)).toEqual([12]);
  for (const run of runs) run.tick(2);
  expect(player(runs[0]).effectiveSector).toBe('Overhead');
  for (const run of runs) run.tick();
  expect(runs.map(run => player(run).effectiveSector)).toEqual(['Left cut', 'Left cut']);
  expect(guardTicks(runs[0], starts[0]!)).toEqual([15]);
 });

 it('signals Shield Block readiness at the first tick after 0.16 seconds instead of at 0.20 seconds', async () => {
  const runs = await comparison('Rapid Guard');
  const starts = runs.map(run => run.state.tick);
  for (const [index, run] of runs.entries()) {
   run.act({ type: 'guard-mode' }, { type: 'pointer', phase: 'down', button: 2, x: 0, y: 0 });
   run.tick(8);
   expect(player(run).action).toBe('Shield');
   expect(guardTicks(run, starts[index]!)).toEqual([]);
   run.tick();
  }
  // 0.16 seconds is 9.6 ticks: tick 9 is too early and tick 10 is ready.
  expect(guardTicks(runs[0], starts[0]!)).toEqual([]);
  expect(guardTicks(runs[1], starts[1]!)).toEqual([10]);
  for (const run of runs) run.tick();
  expect(guardTicks(runs[0], starts[0]!)).toEqual([]);
  for (const run of runs) run.tick();
  expect(guardTicks(runs[0], starts[0]!)).toEqual([12]);
  expect(guardTicks(runs[1], starts[1]!)).toEqual([10]);
 });

 it.each([
  ['Overhead', 39, 32, 33, 27],
  ['Left cut', 33, 27, 27, 22],
  ['Right cut', 33, 27, 27, 22],
  ['Thrust', 27, 22, 36, 29],
 ] as const)('shortens %s wind-up and recovery by 0.80 without changing active time or attack cost', async (sector, baseWindup, rapidWindup, baseRecovery, rapidRecovery) => {
  const runs = await comparison('Rapid Attack');
  const timings = [[baseWindup, baseRecovery], [rapidWindup, rapidRecovery]] as const;
  const activeTicks: number[] = [];
  for (const [index, run] of runs.entries()) {
   const [windup, recovery] = timings[index]!;
   const drag = sector === 'Overhead' ? { x: 0, y: -40 } : sector === 'Thrust' ? { x: 0, y: 40 } : { x: sector === 'Left cut' ? -40 : 40, y: 0 };
   run.act({ type: 'pointer', phase: 'down', button: 0, x: 0, y: 0 }, { type: 'pointer', phase: 'up', button: 0, ...drag });
   expect(player(run).stamina).toBeCloseTo(88, 9);
   run.tick(windup - 2);
   expect(player(run).action).toBe('Windup');
   run.tick();
   expect(player(run).action).toBe('Active');
   const activeAt = run.state.tick;
   for (let tick = 0; tick < 60 && player(run).action === 'Active'; tick++) run.tick();
   activeTicks.push(run.state.tick - activeAt);
   expect(player(run).action).toBe('Recovery');
   run.tick(recovery - 1);
   expect(player(run).action).toBe('Recovery');
   run.tick();
   expect(player(run).action).toBe('Idle');
   run.act({ type: 'pointer', phase: 'down', button: 0, x: 0, y: 0 });
   expect(player(run).action).toBe('Preview');
  }
  expect(activeTicks[1]).toBe(activeTicks[0]);
 });

 it('keeps the full 1.2-second delay, then restores 30 stamina per second instead of 25', async () => {
  const runs = await comparison('Rapid Stamina');
  for (const run of runs) {
   run.act({ type: 'guard-mode' }, { type: 'pointer', phase: 'down', button: 2, x: 0, y: 0 });
   run.tick(119);
   expect(player(run).stamina).toBeCloseTo(64, 9);
   run.act({ type: 'pointer', phase: 'up', button: 2, x: 0, y: 0 });
   run.tick(70);
   expect(player(run).stamina).toBeCloseTo(64, 9);
   run.tick();
   expect(player(run).stamina).toBeCloseTo(64, 9);
   run.tick();
  }
  // The 73rd non-spending tick is the first whole regeneration tick.
  expect(player(runs[0]).stamina).toBeCloseTo(64.41666666666667, 9);
  expect(player(runs[1]).stamina).toBeCloseTo(64.5, 9);
  for (const run of runs) run.tick(29);
  expect(player(runs[0]).stamina).toBeCloseTo(76.5, 9);
  expect(player(runs[1]).stamina).toBeCloseTo(79, 9);
  for (const run of runs) run.tick(30);
  expect(player(runs[0]).stamina).toBeCloseTo(89, 9);
  expect(player(runs[1]).stamina).toBeCloseTo(94, 9);
 });
});
