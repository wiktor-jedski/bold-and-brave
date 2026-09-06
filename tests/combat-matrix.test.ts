import { afterEach, describe, expect, it } from 'vitest';
import { CombatSystem } from '../src/core/combat';
import { Simulation } from '../src/core/simulation';
import type { Combatant, Command, Feedback, GameState, Sector } from '../src/core/types';

const owned: CombatSystem[] = [];
afterEach(() => { for (const combat of owned.splice(0)) combat.dispose(); });

const drag: Record<Sector, { x: number; y: number }> = {
 Overhead: { x: 0, y: -48 },
 'Left cut': { x: -48, y: 0 },
 'Right cut': { x: 48, y: 0 },
 Thrust: { x: 0, y: 48 },
};

type Placement = Pick<Combatant, 'id' | 'position'> & Partial<Combatant>;

interface Fixture {
 state: GameState;
 events: Feedback[];
 step(count?: number): void;
 command(...commands: Command[]): void;
 until(condition: () => boolean, limit?: number): void;
}

// Component fixtures only: copy a real recruited roster, then dispose the Simulation.
// Stationary, interrupted defenders isolate contact rules from AI decisions. Rapier,
// action advancement, damage, casualty draws, and player commands remain real.
async function fixture(placements: Placement[], seed = 1501): Promise<Fixture> {
 const simulation = await Simulation.create(seed);
 let state: GameState;
 try {
  simulation.submit({ type: 'journal' });
  simulation.submit({ type: 'recruit', candidateId: 'troop-1', confirmed: true });
  simulation.advance();
  state = structuredClone(simulation.project()) as GameState;
 } finally { simulation.dispose(); }
 const combat = new CombatSystem();
 owned.push(combat);
 state.phase = 'Battle';
 state.boundary = 'Battle and resolution';
 state.campaign.scene = 'settlement';
 state.campaign.contract = 'Accepted';
 state.campaign.raidLocation = 'Settlement center';
 combat.setup(state, 'Settlement center');
 const roster = state.combatants;
 state.combatants = placements.map(placement => {
  const actor = roster.find(value => value.id === placement.id)!;
  Object.assign(actor, { speed: 0, cooldown: 60, action: 'Stagger', actionTime: 0, guardTime: 60 }, placement);
  const member = state.campaign.members.find(value => value.id === actor.id);
  if (member) member.health = actor.health;
  return actor;
 });
 state.facing = 0;
 combat.rebuild(state);
 const events: Feedback[] = [];
 const emit = (event: Omit<Feedback, 'tick'>) => { events.push({ ...event, tick: state.tick }); };
 const step = (count = 1) => {
  for (let tick = 0; tick < count; tick++) { state.tick++; combat.step(state, emit); }
 };
 const command = (...commands: Command[]) => {
  for (const value of commands) combat.command(state, value, emit);
 };
 const until = (condition: () => boolean, limit = 90) => {
  for (let tick = 0; tick < limit && !condition(); tick++) step();
  expect(condition(), 'The component must reach the expected combat event.').toBe(true);
 };
 return { state, events, step, command, until };
}

function attack(run: Fixture, actor: Combatant, sector: Sector, facing = 0): void {
 if (actor.role === 'Player') {
  run.command(
   { type: 'move', direction: { x: 0, z: 0 }, facing },
   { type: 'pointer', phase: 'down', button: 0, x: 0, y: 0 },
   { type: 'pointer', phase: 'up', button: 0, ...drag[sector] },
  );
 } else {
  // There is no public command to choose a non-player attack sector. Start this
  // component exchange at committed wind-up; do not claim AI or input evidence.
  Object.assign(actor, {
   action: 'Windup', actionTime: 0, sector, effectiveSector: null, facing,
   stamina: actor.stamina - 12, spendTime: 0, attackId: actor.attackId + 1, hitIds: [],
  });
 }
}

function guard(run: Fixture, sector: Sector): void {
 run.command(
  { type: 'pointer', phase: 'down', button: 2, x: 0, y: 0 },
  { type: 'pointer', phase: 'move', button: 2, ...drag[sector] },
 );
}

const weapons = [
 ['Sword', 'Overhead', 24, 39, 33],
 ['Sword', 'Left cut', 20, 33, 27],
 ['Sword', 'Right cut', 20, 33, 27],
 ['Sword', 'Thrust', 16, 27, 36],
 ['Staff', 'Overhead', 20, 45, 33],
 ['Staff', 'Left cut', 16, 39, 27],
 ['Staff', 'Right cut', 16, 39, 27],
 ['Staff', 'Thrust', 13, 33, 36],
] as const;

describe('CP-COMBAT-DAMAGE component evidence', () => {
 it.each(weapons)('%s %s applies %i damage with the specified wind-up and recovery', async (weapon, sector, damage, windupTicks, recoveryTicks) => {
  const run = await fixture([
   { id: weapon === 'Sword' ? 'player' : 'troop-1', position: { x: 0, z: 14 }, action: 'Idle' },
   { id: 'enemy', position: { x: 0, z: 15.3 } },
  ]);
  const [attacker, target] = run.state.combatants;
  attack(run, attacker, sector);
  run.step(windupTicks - 1);
  expect(attacker.action).toBe('Windup');
  expect(target.health).toBe(110);
  run.step();
  expect(attacker.action).toBe('Active');
  expect(target.health).toBe(110);
  run.until(() => attacker.action === 'Recovery');
  expect(target.health).toBe(110 - damage);
  expect(run.events.filter(event => event.type === 'struck' && event.actorId === target.id)).toHaveLength(1);
  run.step(recoveryTicks - 1);
  expect(attacker.action).toBe('Recovery');
  expect(target.health).toBe(110 - damage);
  run.step();
  expect(attacker.action).toBe('Idle');
 });

 it('hits all enemies once per swing with full damage, but never hits Band members or residents', async () => {
  const run = await fixture([
   { id: 'player', position: { x: 0, z: 14 }, action: 'Idle' },
   { id: 'enemy', position: { x: -1, z: 15 } },
   { id: 'bandit-1', position: { x: 1, z: 15 } },
   { id: 'companion', position: { x: 0, z: 15 } },
   { id: 'resident-1', position: { x: 0, z: 15.9 } },
  ]);
  const [attacker, first, second, companion, resident] = run.state.combatants;
  for (let swing = 1; swing <= 2; swing++) {
   // Start a new isolated exchange with interrupted defenders, not an AI duel.
   for (const target of [first, second]) Object.assign(target, { action: 'Stagger', actionTime: 0, guardTime: 60 });
   attack(run, attacker, 'Left cut');
   run.until(() => attacker.action === 'Idle', 120);
   expect(first.health).toBe(110 - swing * 20);
   expect(second.health).toBe(40 - swing * 20);
   for (const target of [first, second]) {
    expect(run.events.filter(event => event.type === 'struck' && event.actorId === target.id)).toHaveLength(swing);
   }
   expect(companion.health).toBe(100);
   expect(resident.health).toBe(100);
   expect(run.state.campaign.members.find(member => member.id === companion.id)?.health).toBe(100);
  }
  expect(run.events.filter(event => event.type === 'struck' && [companion.id, resident.id].includes(event.actorId ?? ''))).toEqual([]);
 });
});

describe('CP-COMBAT-GUARD component evidence', () => {
 it.each([
  ['Overhead', 33], ['Left cut', 27], ['Right cut', 27], ['Thrust', 36],
 ] as const)('a matching %s Directional Guard prevents damage and locks a real raider in recoil for 0.30 seconds', async (sector, recoveryTicks) => {
  const run = await fixture([
   { id: 'enemy', position: { x: 0, z: 12.7 }, action: 'Idle' },
   { id: 'player', position: { x: 0, z: 14 }, action: 'Idle' },
  ]);
  const [attacker, player] = run.state.combatants;
  const start = run.state.tick;
  guard(run, sector);
  attack(run, attacker, sector);
  run.until(() => run.events.some(event => event.type === 'block'));
  expect(run.events).toContainEqual(expect.objectContaining({ type: 'block', actorId: player.id, sector }));
  expect(player.health).toBe(100);
  expect(player.stamina).toBeCloseTo(100 - (run.state.tick - start) * 6 / 60, 8);
  expect(attacker.action).toBe('Stagger');

  // A real counterattack gives the raider a new threat during recoil. Its AI
  // must not replace the recoil with another guard or a new attack.
  run.command({ type: 'pointer', phase: 'up', button: 2, ...drag[sector] });
  attack(run, player, 'Thrust', Math.PI);
  run.step(17);
  expect(attacker.action).toBe('Stagger');
  expect(player.health).toBe(100);
  run.step();
  expect(attacker.action).toBe('Recovery');
  run.step(recoveryTicks - 1);
  expect(attacker.action).toBe('Recovery');
  run.step();
  expect(attacker.action).toBe('Idle');
  expect(attacker.health).toBe(94);
  expect(player.health).toBe(100);
 });

 it('a Right cut guard does not block a Left cut or reduce its full damage', async () => {
  const run = await fixture([
   { id: 'enemy', position: { x: 0, z: 12.7 }, action: 'Idle' },
   { id: 'player', position: { x: 0, z: 14 }, action: 'Idle' },
  ]);
  const [attacker, player] = run.state.combatants;
  guard(run, 'Right cut');
  attack(run, attacker, 'Left cut');
  run.until(() => run.events.some(event => event.type === 'struck' && event.actorId === player.id));
  expect(player.health).toBe(88);
  expect(run.state.campaign.members.find(member => member.id === player.id)?.health).toBe(88);
  expect(attacker.action).toBe('Active');
  run.until(() => attacker.action === 'Recovery');
  expect(player.health).toBe(88);
  expect(run.events.filter(event => event.type === 'block' || event.type === 'interrupted' && event.actorId === attacker.id)).toEqual([]);
 });

 it.each([
  ['Overhead', 0], ['Left cut', Math.PI / 2], ['Right cut', Math.PI], ['Thrust', -Math.PI / 2],
 ] as const)('Shield Block stops %s from its approach direction without attacker recoil', async (sector, facing) => {
  const run = await fixture([
   { id: 'enemy', position: { x: -Math.sin(facing) * 1.3, z: 14 - Math.cos(facing) * 1.3 }, action: 'Idle' },
   { id: 'player', position: { x: 0, z: 14 }, action: 'Idle' },
  ]);
  const [attacker, player] = run.state.combatants;
  const start = run.state.tick;
  run.command({ type: 'guard-mode' }, { type: 'pointer', phase: 'down', button: 2, x: 0, y: 0 });
  attack(run, attacker, sector, facing);
  run.until(() => run.events.some(event => event.type === 'block'));
  expect(attacker.action).toBe('Active');
  expect(player.health).toBe(100);
  run.until(() => attacker.action === 'Recovery');
  expect(player.health).toBe(100);
  expect(player.action).toBe('Shield');
  expect(player.stamina).toBeCloseTo(100 - (run.state.tick - start) * 18 / 60, 8);
  expect(run.events.filter(event => event.type === 'block')).toEqual([
   expect.objectContaining({ actorId: player.id, sector }),
  ]);
  expect(run.events.filter(event => event.type === 'interrupted' && event.actorId === attacker.id)).toEqual([]);
 });

 it.each([
  ['base guard', null, 12],
  ['Rapid Guard', 'Rapid Guard', 10],
 ] as const)('%s blocks contact at readiness, but not one tick before it', async (_label, feat, readyTicks) => {
  for (const ready of [false, true]) {
   // Player-first order matches the real Band-before-raiders action pass.
   const run = await fixture([
    { id: 'player', position: { x: 0, z: 14 }, action: 'Idle' },
    { id: 'enemy', position: { x: 0, z: 12.7 } },
   ]);
   run.state.campaign.feat = feat;
   const [player, attacker] = run.state.combatants;
   run.command({ type: 'guard-mode' }, { type: 'pointer', phase: 'down', button: 2, x: 0, y: 0 });
   run.step(readyTicks - (ready ? 1 : 2));
   // Place an already committed thrust at contact, not at a guessed wind-up offset.
   Object.assign(attacker, { action: 'Active', actionTime: .1, sector: 'Thrust', facing: 0, attackId: 1, hitIds: [] });
   run.step();
   expect(player.health).toBe(ready ? 100 : 88);
   expect(run.events.some(event => event.type === 'block' && event.actorId === player.id)).toBe(ready);
   expect(run.events.some(event => event.type === 'struck' && event.actorId === player.id)).toBe(!ready);
  }
 });
});

// These seeds produce the closest uint32 draws below and above 0.20. Exactly
// 0.20 is not representable by a uint32 draw divided by 2^32.
const casualtyCases = [
 ['Player', 'player', 'Downed', 1501, 1501],
 ['Companion', 'companion', 'Downed', 1501, 1501],
 ['Troop', 'troop-1', 'Downed', 2356543012, 858993459],
 ['Troop', 'troop-1', 'Killed', 2337691369, 858993460],
 ['Enemy Agent', 'enemy', 'Downed', 1501, 1501],
 ['Bandit', 'bandit-1', 'Downed', 2356543012, 858993459],
 ['Bandit', 'bandit-1', 'Killed', 2337691369, 858993460],
 ['Resident', 'resident-1', 'Killed', 1501, 1501],
] as const;

describe('CP-COMBAT-CASUALTY component evidence', () => {
 it.each(casualtyCases)('%s (%s) becomes %s at zero health and cannot receive later damage', async (_role, targetId, status, seed, randomState) => {
  const raiderTarget = targetId === 'enemy' || targetId === 'bandit-1';
  const run = await fixture([
   { id: raiderTarget ? 'player' : 'enemy', position: { x: 0, z: 14 }, action: 'Idle' },
   { id: targetId, position: { x: 0, z: 15.3 }, health: 1 },
   { id: raiderTarget ? 'bandit-2' : targetId === 'companion' ? 'troop-1' : 'companion', position: { x: 1.4, z: 14.9 } },
  ], seed);
  const [attacker, target, livingTarget] = run.state.combatants;
  const survivorHealth = livingTarget.health;
  attack(run, attacker, 'Overhead');
  run.until(() => target.health === 0);
  expect(target.status).toBe(status);
  expect(target.action).toBe('Idle');
  expect(target.target).toBeNull();
  expect(run.state.campaign.randomState).toBe(randomState);
  expect(run.events.filter(event => event.type === 'downed' || event.type === 'killed')).toEqual([
   expect.objectContaining({ type: status === 'Downed' ? 'downed' : 'killed', actorId: target.id }),
  ]);
  const member = run.state.campaign.members.find(value => value.id === target.id);
  if (member) expect(member).toMatchObject({ health: 0, available: false });
  const casualtyMember = member ? structuredClone(member) : undefined;
  const casualtyPosition = { ...target.position };
  run.until(() => attacker.action === 'Idle', 120);
  expect(livingTarget.health).toBe(survivorHealth);

  const laterEvents = run.events.length;
  attack(run, attacker, 'Left cut');
  run.until(() => attacker.action === 'Idle', 120);
  // The next sweep reaches a living enemy as well as the casualty's position.
  // This proves that no repeated damage, draw, or casualty event can occur.
  expect(livingTarget.health).toBe(survivorHealth - (raiderTarget ? 20 : 12));
  expect(run.events.slice(laterEvents)).toContainEqual(expect.objectContaining({ type: 'struck', actorId: livingTarget.id }));
  expect(run.events.slice(laterEvents).filter(event => event.actorId === target.id && ['struck', 'downed', 'killed'].includes(event.type))).toEqual([]);
  expect(target).toMatchObject({ health: 0, status, action: 'Idle', position: casualtyPosition, target: null });
  expect(run.state.campaign.randomState).toBe(randomState);
  expect(run.state.campaign.members.find(value => value.id === target.id)).toEqual(casualtyMember);
  expect(run.state.combatants.some(value => value.target === target.id)).toBe(false);
 });
});

it('preserves the specified movement speed through preview, defense, and a committed attack', async () => {
 const run = await fixture([{ id: 'player', position: { x: 0, z: 14 }, speed: 7, action: 'Idle' }]);
 const player = run.state.combatants[0];
 const measure = (multiplier: number) => {
  const start = player.position.x;
  run.command({ type: 'move', direction: { x: 1, z: 0 }, facing: 0 });
  run.step();
  expect(player.position.x - start).toBeCloseTo(7 * multiplier / 60, 6);
  run.command({ type: 'move', direction: { x: 0, z: 0 }, facing: 0 });
 };
 measure(1);
 run.command({ type: 'pointer', phase: 'down', button: 0, x: 0, y: 0 });
 measure(.75);
 run.command({ type: 'pointer', phase: 'down', button: 2, x: 0, y: 0 });
 measure(.75);
 run.command({ type: 'pointer', phase: 'up', button: 2, x: 0, y: 0 }, { type: 'guard-mode' },
  { type: 'pointer', phase: 'down', button: 2, x: 0, y: 0 });
 measure(.75);
 run.command({ type: 'pointer', phase: 'up', button: 2, x: 0, y: 0 });
 attack(run, player, 'Left cut');
 measure(.8);
 run.until(() => player.action === 'Active');
 measure(.65);
 run.until(() => player.action === 'Recovery');
 measure(.65);
 run.until(() => player.action === 'Idle');
 measure(1);
});
