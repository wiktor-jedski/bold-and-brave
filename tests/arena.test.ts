import { afterEach, describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/simulation';
import { ARENA_BOUNDS, NAV_CLEARANCE } from '../src/core/navigation';
import { validateSnapshot } from '../src/core/snapshot';
import type { ArenaMode, Command, Projection } from '../src/core/types';
import { Recorder } from '../src/scenarios/harness';
import { acceptContract, enterSettlement, fightCommands, recruit, startBattle } from '../src/scenarios/run';

const owned: Simulation[] = [];
afterEach(() => { for (const simulation of owned.splice(0)) simulation.dispose(); });

async function create(): Promise<Simulation> {
 const simulation = await Simulation.create(1501);
 owned.push(simulation);
 return simulation;
}

function act(simulation: Simulation, ...commands: Command[]): void {
 for (const command of commands) simulation.submit(command);
 simulation.advance();
}

function advance(simulation: Simulation, ticks: number): void {
 for (let tick = 0; tick < ticks; tick++) simulation.advance();
}

function until(simulation: Simulation, condition: (state: Projection) => boolean, limit = 9000): void {
 for (let tick = 0; tick < limit && !condition(simulation.project()); tick++) simulation.advance();
 expect(condition(simulation.project()), 'Arena must reach the expected state without forcing an outcome.').toBe(true);
}

function enterArena(simulation: Simulation, mode: ArenaMode): void {
 act(simulation, { type: 'arena-start', mode });
 expect(simulation.project().boundary).toBe('Transitioning');
 expect(() => simulation.snapshot()).toThrow();
 act(simulation, { type: 'transition-ready' });
}

describe('repeatable Arena combat', () => {
 it('reaches a real Duel defeat, freezes the result, and restarts with a fresh opponent and player', async () => {
  const simulation = await create();
  const campaign = simulation.snapshot();
  enterArena(simulation, 'Duel');
  const initial = simulation.project();
  expect(initial.combatants.map(actor => actor.role)).toEqual(['Player', 'Enemy Agent']);
  expect(initial.phase).toBe('Battle');
  expect(() => simulation.restore(campaign)).toThrow();
  simulation.drainEvents();

  until(simulation, state => state.phase === 'Summary');
  const result = simulation.project();
  expect(result.outcome).toBe('Defeat');
  expect(result.combatants.find(actor => actor.id === 'player')).toMatchObject({ status: 'Downed', health: 0 });
  expect(result.campaign).toEqual(campaign.campaign);
  expect(simulation.drainEvents().filter(event => event.type === 'defeat')).toHaveLength(1);
  expect(() => simulation.snapshot()).toThrow();

  act(simulation, { type: 'continue' }, { type: 'choose-feat', feat: 'Rapid Attack' },
   { type: 'choose-fate', choice: 'Capture' }, { type: 'confirm-fate' },
   { type: 'move', direction: { x: 1, z: 0 }, facing: 0 },
   { type: 'pointer', phase: 'down', button: 0, x: 0, y: 0 });
  advance(simulation, 120);
  expect(simulation.project().phase).toBe('Summary');
  expect(simulation.project().combatants).toEqual(result.combatants);
  expect(simulation.project().battleTime).toBe(result.battleTime);
  expect(simulation.project().campaign).toEqual(campaign.campaign);
  expect(simulation.drainEvents().filter(event => event.type === 'defeat' || event.type === 'victory')).toEqual([]);

  act(simulation, { type: 'arena-restart' });
  expect(simulation.project()).toMatchObject({ phase: 'Battle', outcome: null, battleTime: 0, paused: false });
  expect(simulation.project().combatants).toEqual(initial.combatants);
  until(simulation, state => state.phase === 'Summary');
  expect(simulation.project().outcome).toBe('Defeat');
  expect(simulation.project().campaign).toEqual(campaign.campaign);
  act(simulation, { type: 'arena-exit' });
  expect(() => simulation.snapshot()).toThrow();
  act(simulation, { type: 'transition-ready' });
  expect(simulation.project()).toMatchObject({ phase: 'Travel', boundary: 'Safe non-combat' });
  expect(simulation.project().arena).toBeUndefined();
  expect(simulation.snapshot()).toEqual(campaign);
 });

 it('wins a real Team battle through Player attacks and both Command groups without changing the campaign', async () => {
  const simulation = await create();
  const campaign = simulation.snapshot();
  enterArena(simulation, 'Team');
  const roster = simulation.project().combatants;
  expect(roster.filter(actor => actor.team === 'Band').map(actor => actor.role))
   .toEqual(['Player', 'Companion', 'Troop', 'Troop', 'Troop', 'Troop']);
  expect(roster.filter(actor => actor.team === 'Raiders')).toHaveLength(6);
  expect(roster.some(actor => actor.role === 'Resident')).toBe(false);
  act(simulation, { type: 'select-group', group: 'Companion' }, { type: 'order', order: 'Engage' },
   { type: 'select-group', group: 'Troops' }, { type: 'order', order: 'Engage' });
  until(simulation, state => state.phase === 'Battle', 900);
  const attackers = new Set<string>();
  for (let tick = 0; tick < 36000 && simulation.project().phase === 'Battle'; tick++) {
   act(simulation, ...fightCommands(simulation.project()));
   for (const event of simulation.drainEvents()) if (event.type === 'hit' && event.actorId) attackers.add(event.actorId);
  }
  expect(simulation.project()).toMatchObject({ phase: 'Summary', outcome: 'Victory', campaign: campaign.campaign });
  expect(attackers.has('player')).toBe(true);
  expect(attackers.has('companion')).toBe(true);
  expect([...attackers].some(id => id.startsWith('troop-'))).toBe(true);
  expect(simulation.project().arena!.randomState).not.toBe(campaign.campaign.randomState);
  expect(() => simulation.snapshot()).toThrow();

  act(simulation, { type: 'arena-restart' });
  expect(simulation.project()).toMatchObject({ phase: 'Setup', outcome: null, battleTime: 0 });
  expect(simulation.project().combatants).toEqual(roster);
  act(simulation, { type: 'arena-start', mode: 'Duel' });
  expect(simulation.project().combatants.map(actor => actor.role)).toEqual(['Player', 'Enemy Agent']);
  expect(simulation.project().phase).toBe('Battle');
  act(simulation, { type: 'arena-exit' });
  act(simulation, { type: 'transition-ready' });
  expect(simulation.snapshot()).toEqual(campaign);
 }, 30000);

 it('keeps an Accepted campaign isolated through movement, pause, commands, and transition retries', async () => {
  const simulation = await create();
  const run = new Recorder(simulation);
  enterSettlement(run); recruit(run, 2); acceptContract(run);
  const campaign = simulation.snapshot();
  act(simulation, { type: 'arena-start', mode: 'Team' });
  act(simulation, { type: 'transition-failed' });
  expect(simulation.project().campaign).toEqual(campaign.campaign);
  expect(() => simulation.snapshot()).toThrow();
  act(simulation, { type: 'retry-transition' });
  act(simulation, { type: 'transition-ready' });

  act(simulation, { type: 'move', direction: { x: 1, z: 0 }, facing: Math.PI });
  advance(simulation, 180);
  const player = simulation.project().combatants.find(actor => actor.id === 'player')!;
  expect(player.position.x).toBeGreaterThan(ARENA_BOUNDS.maxX - 1);
  expect(player.position.x).toBeLessThan(ARENA_BOUNDS.maxX - NAV_CLEARANCE + 0.03);
  expect(simulation.project().campaign).toEqual(campaign.campaign);
  act(simulation, { type: 'move', direction: { x: 0, z: 0 }, facing: Math.PI },
   { type: 'select-group', group: 'Troops' }, { type: 'order', order: 'Hold' },
   { type: 'hold-point', point: { x: 9, z: 16 } });
  expect(simulation.project().groups.Troops.marker).toBeNull();
  expect(simulation.project().placingHold).toBe(true);
  act(simulation, { type: 'close' });
  expect(simulation.project().placingHold).toBe(false);
  act(simulation, { type: 'order', order: 'Hold' }, { type: 'hold-point', point: { x: 5, z: 16 } });
  expect(simulation.project().groups.Troops).toMatchObject({ order: 'Hold', marker: { x: 5, z: 16 } });
  act(simulation, { type: 'pause' });
  const paused = simulation.project();
  advance(simulation, 120);
  expect(simulation.project().combatants).toEqual(paused.combatants);
  expect(simulation.project().setupRemaining).toBe(paused.setupRemaining);
  expect(() => simulation.snapshot()).toThrow();
  act(simulation, { type: 'journal' }, { type: 'wait' }, { type: 'leave' },
   { type: 'recruit', candidateId: 'troop-3', confirmed: true }, { type: 'accept' });
  expect(simulation.project().journalOpen).toBe(false);
  expect(simulation.project().campaign).toEqual(campaign.campaign);
  act(simulation, { type: 'arena-exit' });
  act(simulation, { type: 'transition-failed' });
  expect(simulation.project().arena?.exiting).toBe(true);
  expect(() => simulation.snapshot()).toThrow();
  act(simulation, { type: 'retry-transition' });
  act(simulation, { type: 'transition-ready' });
  expect(simulation.project().arena).toBeUndefined();
  expect(simulation.snapshot()).toEqual(campaign);
 });

 it('cannot use Arena entry to abandon a campaign battle or make it save-safe', async () => {
  const simulation = await create();
  const run = new Recorder(simulation);
  enterSettlement(run); acceptContract(run); startBattle(run);
  act(simulation, { type: 'pause' });
  const before = simulation.project();
  act(simulation, { type: 'arena-start', mode: 'Duel' }, { type: 'arena-restart' }, { type: 'arena-exit' });
  expect(simulation.project()).toEqual({ ...before, tick: before.tick + 1 });
  expect(() => simulation.snapshot()).toThrow();
 });

 it('rejects Arena data at the save seam and malformed mode commands before they change state', async () => {
  const simulation = await create();
  const snapshot = simulation.snapshot();
  expect(() => validateSnapshot({ ...snapshot, arena: { mode: 'Duel', randomState: 1, exiting: false } })).toThrow();
  expect(() => validateSnapshot({ ...snapshot, campaign: { ...snapshot.campaign, arena: { mode: 'Duel' } } })).toThrow();
  act(simulation, { type: 'arena-start', mode: 'Tournament' } as unknown as Command);
  expect(simulation.project().arena).toBeUndefined();
  expect(simulation.snapshot()).toEqual(snapshot);
 });
});
