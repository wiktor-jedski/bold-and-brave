import { expect, it } from 'vitest';
import { Simulation } from '../src/core/simulation';
import type { Command, GameState } from '../src/core/types';
import { CombatSystem } from '../src/core/combat';
import { fightCommands } from '../src/scenarios/run';

it('resolves a bridge battle after casualties instead of trapping remaining actors', async () => {
 const sim = await Simulation.create(1101);
 const command = (value: Command) => { sim.submit(value); sim.advance(); };
 try {
  command({ type: 'journal' });
  command({ type: 'recruit', candidateId: 'troop-1', confirmed: true });
  command({ type: 'recruit', candidateId: 'troop-2', confirmed: true });
  command({ type: 'close' });
  command({ type: 'speed', speed: 4 });
  command({ type: 'travel', point: { x: 0, z: 0 } });
  for (let i = 0; i < 1200 && sim.project().boundary !== 'Transitioning'; i++) sim.advance();
  command({ type: 'transition-ready' });
  command({ type: 'talk', agentId: 'giver' });
  command({ type: 'accept' });
  for (let i = 0; i < 12; i++) command({ type: 'wait' });
  command({ type: 'select-group', group: 'Companion' });
  command({ type: 'order', order: 'Engage' });
  command({ type: 'select-group', group: 'Troops' });
  command({ type: 'order', order: 'Engage' });
  for (let i = 0; i < 20000 && !sim.project().outcome; i++) sim.advance();
  expect(sim.project().outcome, 'Living attackers must move past inactive Combatants and reach a terminal result.').not.toBeNull();
  expect(sim.project().campaign.contract).not.toBe('Accepted');
 } finally { sim.dispose(); }
});

it('lets the controller finish an opponent instead of repeating a low-stamina guard loop', async () => {
 const simulation = await Simulation.create(1101);
 const state = structuredClone(simulation.project()) as GameState;
 simulation.dispose();
 const combat = new CombatSystem();
 try {
  // Component fixture reduced from the recorded browser stall. Contact, stamina,
  // enemy decisions and controller commands remain real; no outcome is assigned.
  state.phase = 'Battle';
  state.boundary = 'Battle and resolution';
  state.campaign.scene = 'settlement';
  state.campaign.contract = 'Accepted';
  combat.setup(state, 'Bridge');
  state.combatants = state.combatants.filter(actor => actor.id === 'player' || actor.id === 'bandit-2');
  const player = state.combatants.find(actor => actor.id === 'player')!;
  const opponent = state.combatants.find(actor => actor.id === 'bandit-2')!;
  Object.assign(player, {
   position: { x: -21.654897689819336, z: 3.344857692718506 }, facing: .48266180836979194,
   stamina: 15.383333333329835, action: 'Guard', sector: 'Left cut', effectiveSector: 'Left cut',
   actionTime: .5, guardTime: .5, spendTime: 0, cooldown: 0,
  });
  Object.assign(opponent, {
   position: { x: -21.238840103149414, z: 4.139092922210693 }, facing: -2.658825642800865,
   health: 8, stamina: 88, action: 'Windup', sector: 'Left cut', effectiveSector: null,
   actionTime: .6, guardTime: 0, spendTime: .6, cooldown: 1.5,
  });
  state.pointer = { button: 2, x: 0, y: 0 };
  state.facing = player.facing;
  combat.rebuild(state);
  for (let tick = 0; tick < 600 && opponent.health > 0; tick++) {
   for (const command of fightCommands(state)) combat.command(state, command, () => {});
   state.tick++;
   combat.step(state, () => {});
  }
  expect(opponent.health).toBe(0);
  expect(player.health).toBeGreaterThan(0);
 } finally { combat.dispose(); }
});
