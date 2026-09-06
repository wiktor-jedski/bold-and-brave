import { Simulation } from '../core/simulation';
import type { Command, DeepReadonly, FateChoice, Feat, Projection, Sector } from '../core/types';
import type { Scenario } from './catalog';
import { equal, near, Recorder, type Trace } from './harness';

export function enterSettlement(run: Recorder): void {
 run.act({ type: 'speed', speed: 4 }, { type: 'travel', point: { x: 0, z: 0 } });
 run.until((state) => state.boundary === 'Transitioning', 1000, 'Settlement boundary');
 run.act({ type: 'transition-ready' });
 run.checkpoint('CP-FLOW-CONTRACT', 'arrival', [
  equal('Normal settlement entry', 'Settlement', run.state.phase),
  equal('No deadline before acceptance', null, run.state.campaign.deadline),
  near('Initial half-day journey', 20, run.state.campaign.time),
  near('Two members consume 0.2 Provisions', 9.8, run.state.campaign.provisions),
 ]);
}

export function recruit(run: Recorder, count: number): void {
 run.act({ type: 'journal' });
 for (let index = 1; index <= count; index++) run.act({ type: 'recruit', candidateId: `troop-${index}`, confirmed: true });
 run.act({ type: 'close' });
}

export function acceptContract(run: Recorder): void {
 run.act({ type: 'talk', agentId: 'giver' }, { type: 'decline' });
 run.checkpoint('CP-FLOW-CONTRACT', 'decline', [equal('Decline keeps Available', 'Available', run.state.campaign.contract), equal('Decline creates no deadline', null, run.state.campaign.deadline)]);
 run.act({ type: 'wait' });
 const acceptedAt = run.state.campaign.time;
 run.act({ type: 'talk', agentId: 'giver' }, { type: 'accept' });
 run.checkpoint('CP-FLOW-CONTRACT', 'accepted', [equal('Accepted state', 'Accepted', run.state.campaign.contract), near('Exact twelve-hour lead', acceptedAt + 12, run.state.campaign.deadline!), near('Wait adds one hour', 21, acceptedAt)]);
}

export function startBattle(run: Recorder, late = false, isolatePlayer = false, deploy?: (run: Recorder) => void): void {
 if (late) {
  run.act({ type: 'leave' });
  run.act({ type: 'transition-ready' });
  run.act({ type: 'travel', point: { x: 0, z: 3 } });
  run.until((state) => state.campaign.time > state.campaign.deadline!, 1200, 'Deadline during travel');
  run.checkpoint('CP-FLOW-LATE', 'uninterrupted-deadline', [equal('Still travelling after deadline', 'Travel', run.state.phase), equal('No setup outside settlement', 0, run.state.setupRemaining), equal('No battle outside settlement', null, run.state.outcome)]);
  run.act({ type: 'travel', point: { x: 0, z: 0 } });
  run.until((state) => state.boundary === 'Transitioning', 1200, 'Late re-entry');
  run.act({ type: 'transition-ready' });
  run.tick();
  run.checkpoint('CP-FLOW-LATE', 'center-battle', [equal('Immediate center battle', 'Battle', run.state.phase), equal('Settlement center location', 'Settlement center', run.state.campaign.raidLocation), equal('No deployment window', 0, run.state.setupRemaining), equal('Five residents', 5, run.state.combatants.filter((actor) => actor.role === 'Resident').length)]);
 } else {
  for (let hour = 0; hour < 12; hour++) run.act({ type: 'wait' });
  run.checkpoint('CP-FLOW-EARLY', 'bridge-setup', [equal('Bridge setup phase', 'Setup', run.state.phase), near('Full fifteen-second setup', 15, run.state.setupRemaining), near('Wait clamps to deadline', run.state.campaign.deadline!, run.state.campaign.time), equal('Six raiders on far bank', 6, run.state.combatants.filter((actor) => actor.team === 'Raiders' && actor.position.z < -3).length), equal('Five residents on settlement bank', 5, run.state.combatants.filter((actor) => actor.role === 'Resident' && actor.position.z > 3).length)]);
  const setupTick = run.state.tick;
  deploy?.(run);
  if (isolatePlayer) {
   // Walk to empty traversable ground during the actual setup, not by editing positions.
   run.act({ type: 'move', direction: { x: 1, z: 0 }, facing: Math.PI });
   run.tick(299);
   run.act({ type: 'move', direction: { x: 0, z: 0 }, facing: Math.PI });
  }
  run.until((state) => state.phase === 'Battle', 900, 'Bridge battle');
  run.checkpoint('CP-FLOW-EARLY', 'setup-complete', [equal('Exactly 900 setup ticks', 900, run.state.tick - setupTick), near('No active battle time during setup', 0, run.state.battleTime)]);
 }
}

export function commandBand(run: Recorder): void {
 for (const group of ['Companion', 'Troops'] as const) {
  if (run.state.combatants.some((actor) => actor.status === 'Active' && actor.health > 0 && actor.role === (group === 'Troops' ? 'Troop' : 'Companion'))) {
   run.act({ type: 'select-group', group }, { type: 'order', order: 'Engage' });
  }
 }
}

/** Deterministic, read-only tactical controller. Only movement, pointer and Band orders affect play. */
export function fight(run: Recorder, passive = false): void {
 if (!passive) commandBand(run);
 const begin = run.state.tick;
 let maxCommitments = 0;
 let sampled = 0;
 while (run.state.phase === 'Battle' && run.state.tick - begin < 60 * 600) {
  const state = run.state;
  const commitments = state.combatants.filter((actor) => actor.team === 'Raiders' && actor.status === 'Active' && (actor.action === 'Windup' || actor.action === 'Active')).length;
  maxCommitments = Math.max(maxCommitments, commitments);
  sampled++;
  if (commitments > 2) throw new Error(`Two-raider committed-attack cap exceeded at tick ${state.tick}.`);
  if (!passive) for (const command of fightCommands(state)) run.command(command);
  run.tick();
 }
 if (run.state.phase === 'Battle') throw new Error('No battle outcome after 36,000 active ticks; no outcome was forced.');
 run.checkpoint('CP-COMMAND-AI', 'observed-commitment-cap', [equal('At least one active tick sampled', true, sampled > 0), equal('No more than two committed raiders', true, maxCommitments <= 2)]);
 const frozen = run.state;
 run.act({ type: 'move', direction: { x: 1, z: 0 }, facing: 0 }, { type: 'pointer', phase: 'down', button: 0, x: 0, y: 0 });
 run.tick(30);
 run.checkpoint(run.state.outcome === 'Defeat' ? 'CP-FLOW-DEFEAT' : 'CP-FLOW-EARLY', 'terminal-combat-freeze', [
  equal('Terminal gameplay input cannot move or damage Combatants', frozen.combatants, run.state.combatants),
  equal('Active battle time freezes at the outcome', frozen.battleTime, run.state.battleTime),
  equal('Campaign time freezes at the outcome', frozen.campaign.time, run.state.campaign.time),
  equal('Outcome feedback emits only once', 1, run.events.filter((event) => event.type === 'victory' || event.type === 'defeat').length),
 ]);
}

/** Shared by exact-tick recording and real-time browser play; it never advances or mutates state. */
export function fightCommands(state: Projection): Command[] {
 const player = state.combatants.find((actor) => actor.role === 'Player');
 if (state.phase !== 'Battle' || !player || player.status !== 'Active') return [];
 const targets = state.combatants.filter((actor) => actor.team === 'Raiders' && actor.status === 'Active');
 targets.sort((a, b) => Math.hypot(a.position.x - player.position.x, a.position.z - player.position.z) - Math.hypot(b.position.x - player.position.x, b.position.z - player.position.z) || a.id.localeCompare(b.id));
 const target = targets[0];
 if (!target) return [];
 const dx = target.position.x - player.position.x;
 const dz = target.position.z - player.position.z;
 const distance = Math.hypot(dx, dz);
 let waypoint = target.position;
 // The only river crossing is the bridge. Route to its entrance before crossing.
 if (player.position.z > 3.5 && target.position.z < -3.5) waypoint = { x: 0, z: Math.abs(player.position.x) > 1 ? 3.8 : -3.8 };
 else if (player.position.z < -3.5 && target.position.z > 3.5) waypoint = { x: 0, z: Math.abs(player.position.x) > 1 ? -3.8 : 3.8 };
 else if (Math.abs(player.position.z) <= 3.5 && Math.abs(target.position.z) > 3.5) waypoint = { x: 0, z: Math.sign(target.position.z) * 3.8 };
 const wx = waypoint.x - player.position.x;
 const wz = waypoint.z - player.position.z;
 const length = Math.hypot(wx, wz);
 const direction = distance > 1.9 && length > .1 ? { x: wx / length, z: wz / length } : { x: 0, z: 0 };
 const commands: Command[] = [{ type: 'move', direction, facing: Math.atan2(dx, dz) }];
 const incoming = targets.find((actor) => (actor.action === 'Windup' || actor.action === 'Active') && actor.sector && Math.hypot(actor.position.x - player.position.x, actor.position.z - player.position.z) < 2.8);
 if (incoming) {
  const awayX = player.position.x - incoming.position.x;
  const awayZ = player.position.z - incoming.position.z;
  const awayLength = Math.hypot(awayX, awayZ);
  if (awayLength > .01) commands[0] = { type: 'move', direction: { x: awayX / awayLength, z: awayZ / awayLength }, facing: Math.atan2(-awayX, -awayZ) };
 }
 if (incoming && (player.action === 'Idle' || player.action === 'Preview') && player.stamina >= 18) {
  commands.push({ type: 'pointer', phase: 'down', button: 2, x: 0, y: 0 }, { type: 'pointer', phase: 'move', button: 2, ...sectorDrag(incoming.sector!) });
 } else if (player.action === 'Guard') {
  if (!incoming) commands.push({ type: 'pointer', phase: 'up', button: 2, x: 0, y: 0 });
  else if (player.sector !== incoming.sector) commands.push({ type: 'pointer', phase: 'move', button: 2, ...sectorDrag(incoming.sector!) });
 } else if (player.action === 'Idle' && distance <= 2.2 && player.stamina >= 12) {
  // Use the actual attack cost: saving two attacks can lock the controller in
  // repeated guards that consume each recovery before the larger reserve forms.
  commands.push({ type: 'pointer', phase: 'down', button: 0, x: 0, y: 0 }, { type: 'pointer', phase: 'move', button: 0, x: 0, y: 40 }, { type: 'pointer', phase: 'up', button: 0, x: 0, y: 40 });
 }
 return commands;
}

function sectorDrag(sector: Sector): { x: number; y: number } {
 return sector === 'Overhead' ? { x: 0, y: -40 } : sector === 'Thrust' ? { x: 0, y: 40 } : { x: sector === 'Left cut' ? -40 : 40, y: 0 };
}

export function resolveVictory(run: Recorder, choice: FateChoice, feat: Feat, late: boolean): void {
 run.checkpoint(late ? 'CP-FLOW-LATE' : 'CP-FLOW-EARLY', 'victory', [equal('Actual battle victory', 'Victory', run.state.outcome), equal('Agent fate comes first', 'Agent fate', run.state.phase), equal('Resolved contract', 'Resolved', run.state.campaign.contract), equal('Location determines condition', late ? 'Damaged' : 'Safe', run.state.campaign.condition)]);
 const before = run.state.campaign;
 run.act({ type: 'choose-fate', choice });
 run.checkpoint('CP-UI-FATE', 'pending-core-state', [equal('Choice pending until confirmation', choice, run.state.pendingChoice), equal('Pending fate cannot mutate campaign', before, run.state.campaign)]);
 run.act({ type: 'cancel-fate' });
 run.act({ type: 'choose-fate', choice }, { type: 'confirm-fate' });
 const agentResult = run.state.campaign.agents;
 if (run.state.phase === 'Bandit fate') {
  run.act({ type: 'choose-fate', choice }, { type: 'confirm-fate' });
  run.checkpoint('CP-REL-' + choice.toUpperCase(), 'ordinary-survivors', [equal('Ordinary fate does not alter named Agents', agentResult, run.state.campaign.agents), equal('Aggregate ordinary choice', choice, run.state.campaign.banditChoice)]);
 }
 const result = run.state.campaign;
 const enemy = result.agents.find((agent) => agent.id === 'enemy')!;
 const giver = result.agents.find((agent) => agent.id === 'giver')!;
 const resident = result.agents.find((agent) => agent.id === 'resident-agent')!;
 run.checkpoint('CP-REL-' + choice.toUpperCase(), 'relationship-result', [
  equal('Enemy fate', choice === 'Release' ? 'Active' : choice === 'Capture' ? 'Captive' : 'Executed', enemy.fate),
  equal('Enemy Disposition only when Active', choice === 'Release' ? 'Neutral' : null, enemy.disposition ?? null),
  equal('Enemy Grievance', choice === 'Capture' ? ['Agent captured'] : [], enemy.grievances),
  equal('Contract-giver Disposition', choice === 'Execute' ? 'Hostile' : 'Friendly', giver.disposition),
  equal('Contract-giver Grievance', choice === 'Execute' ? ['Agent executed'] : [], giver.grievances),
  equal('Affected-resident Disposition', choice === 'Release' ? 'Neutral' : 'Friendly', resident.disposition),
  equal('Affected-resident Grievances unchanged', [], resident.grievances),
  equal('Exact Captive count', choice === 'Capture' ? 1 + result.banditDowned : 0, result.captives),
  equal('All five ordinary bandits resolved', 5, result.banditDowned + result.banditKilled),
  equal('Summary before Feat', 'Summary', run.state.phase),
 ]);
 run.act({ type: 'continue' });
 run.checkpoint('CP-FEAT', 'one-choice-offered', [equal('Victory offers Feat after summary', 'Feat', run.state.phase), equal('No prematurely selected Feat', null, run.state.campaign.feat)]);
 run.act({ type: 'choose-feat', feat });
 const chosen = run.state.campaign;
 run.act({ type: 'choose-feat', feat: feat === 'Rapid Attack' ? 'Rapid Guard' : 'Rapid Attack' }, { type: 'choose-fate', choice: 'Execute' });
 run.checkpoint('CP-FEAT', 'persistent-choice', [equal('Exactly one persistent Feat', feat, run.state.campaign.feat), equal('Repeated fate/Feat commands cannot change campaign', chosen, run.state.campaign), equal('Changed settlement is save-safe', 'Safe non-combat', run.state.boundary)]);
 run.checkpoint('CP-SPEC-END-TO-END', 'changed-settlement-state-only', [equal('Returned to settlement', 'Settlement', run.state.phase), equal('No Coin reward', 50, run.state.campaign.coin), equal('Snapshot stores resolved campaign', run.state.campaign, run.simulation.snapshot().campaign)]);
}

function combatInput(run: Recorder): void {
 const player = () => run.state.combatants.find((actor) => actor.role === 'Player')!;
 for (const sector of ['Overhead', 'Left cut', 'Right cut', 'Thrust'] as const) {
  run.act({ type: 'pointer', phase: 'down', button: 0, x: 0, y: 0 }, { type: 'pointer', phase: 'move', button: 0, x: 23.99, y: 0 });
  run.checkpoint('CP-COMBAT-INPUT', `${sector}-dead-zone`, [equal('Below 24 CSS pixels selects nothing', null, player().sector), equal('Preview costs no stamina', 100, player().stamina)]);
  run.act({ type: 'pointer', phase: 'move', button: 0, x: 24.01, y: 0 });
  run.checkpoint('CP-COMBAT-INPUT', `${sector}-threshold-crossed`, [equal('Above 24 CSS pixels selects the drag sector', 'Right cut', player().sector)]);
  const drag = sectorDrag(sector);
  run.act({ type: 'pointer', phase: 'move', button: 0, ...drag });
  run.checkpoint('CP-COMBAT-INPUT', `${sector}-preview`, [equal('Selected sector', sector, player().sector)]);
  const firstEvent = run.events.length;
  run.act({ type: 'pointer', phase: 'up', button: 0, ...drag });
  run.checkpoint('CP-COMBAT-INPUT', `${sector}-committed`, [equal('Release commits wind-up', 'Windup', player().action), near('Release charges twelve stamina', 88, player().stamina)]);
  const attackId = player().attackId;
  run.until(() => player().action === 'Active', 60, `${sector} Active`);
  run.act({ type: 'pointer', phase: 'down', button: 2, x: 0, y: 0 });
  run.checkpoint('CP-COMBAT-INPUT', `${sector}-active-commitment`, [equal('Guard cannot cancel Active', 'Active', player().action), equal('Attack identity retained', attackId, player().attackId)]);
  run.until(() => player().action === 'Recovery', 12, `${sector} Recovery`);
  run.act({ type: 'pointer', phase: 'down', button: 2, x: 0, y: 0 });
  run.checkpoint('CP-COMBAT-DAMAGE', `${sector}-true-miss`, [
   equal('Guard cannot cancel Recovery', 'Recovery', player().action),
   equal('Active sweep contacted nobody', [], player().hitIds),
   equal('Exactly one miss after a completed Active phase', 1, run.events.slice(firstEvent).filter((event) => event.type === 'miss' && event.actorId === 'player').length),
   equal('Miss caused no player hit or interruption', [], run.events.slice(firstEvent).filter((event) => event.actorId === 'player' && (event.type === 'hit' || event.type === 'interrupted'))),
  ]);
  run.until(() => player().action === 'Idle', 150, `${sector} recovery`);
  run.until(() => player().stamina >= 100, 200, 'Stamina restoration');
 }
 run.act({ type: 'pointer', phase: 'down', button: 0, x: 0, y: 0 }, { type: 'pointer', phase: 'up', button: 0, x: -40, y: 0 });
 run.act({ type: 'pointer', phase: 'down', button: 2, x: 0, y: 0 }, { type: 'pointer', phase: 'move', button: 2, x: 0, y: -40 });
 run.checkpoint('CP-COMBAT-INPUT', 'windup-feint', [equal('Wind-up cancels into guard', 'Guard', player().action), near('Feint does not refund stamina', 87.9, player().stamina), equal('Interruption feedback emitted', true, run.events.some((event) => event.type === 'interrupted' && event.actorId === 'player'))]);
}

function shield(run: Recorder): void {
 const player = () => run.state.combatants.find((actor) => actor.role === 'Player')!;
 run.act({ type: 'guard-mode' }, { type: 'pointer', phase: 'down', button: 2, x: 0, y: 0 });
 run.tick(59);
 run.checkpoint('CP-COMBAT-GUARD', 'shield-drain', [equal('Shield held', 'Shield', player().action), near('One second drains eighteen stamina', 82, player().stamina)]);
 run.until(() => player().exhausted, 300, 'Shield exhaustion');
 run.checkpoint('CP-COMBAT-GUARD', 'zero-stamina', [equal('Exhaustion releases shield', 'Stagger', player().action), near('Stamina clamps at zero', 0, player().stamina), equal('Shield pointer released', null, run.state.pointer)]);
 run.tick(71);
 run.checkpoint('CP-COMBAT-GUARD', 'regeneration-delay', [near('No regeneration before 1.2 seconds', 0, player().stamina)]);
 run.until(() => !player().exhausted, 35, 'Combat re-enabled at twelve stamina');
 run.checkpoint('CP-COMBAT-GUARD', 're-enabled', [equal('Re-enabled at threshold', true, player().stamina >= 12 && player().stamina < 12 + 25 / 60 + 1e-8)]);
 run.act({ type: 'pointer', phase: 'down', button: 0, x: 0, y: 0 }, { type: 'pointer', phase: 'up', button: 0, x: 0, y: -40 });
 run.checkpoint('CP-COMBAT-GUARD', 'post-exhaustion-attack', [equal('Attack available again', 'Windup', player().action)]);
}

function deployOrders(run: Recorder): void {
 const band = run.state.combatants.filter((actor) => actor.team === 'Band');
 run.checkpoint('CP-COMMAND-GROUPS', 'four-troop-deployment', [
  equal('Player, Companion and all four recruited Troops deploy', ['player', 'companion', 'troop-1', 'troop-2', 'troop-3', 'troop-4'], band.map((actor) => actor.id)),
  equal('Every deployed member is active', true, band.every((actor) => actor.status === 'Active' && actor.health > 0)),
 ]);
 run.act({ type: 'move', direction: { x: 0, z: 0 }, facing: 0 });
 run.act({ type: 'select-group', group: 'Companion' }, { type: 'order', order: 'Hold' }, { type: 'hold-point', point: { x: 5, z: 6 } });
 const prior = run.state.groups.Companion;
 const firstEvent = run.events.length;
 run.act({ type: 'order', order: 'Hold' }, { type: 'hold-point', point: { x: 8, z: 0 } });
 run.checkpoint('CP-COMMAND-GROUPS', 'invalid-river-hold', [equal('Invalid river marker preserves prior order', prior, run.state.groups.Companion), equal('Invalid marker remains visible in projection', { x: 8, z: 0 }, run.state.invalidMarker), equal('Invalid order emits rejection', true, run.events.slice(firstEvent).some((event) => event.type === 'invalid'))]);
 run.act({ type: 'select-group', group: 'Troops' }, { type: 'order', order: 'Hold' }, { type: 'hold-point', point: { x: -5, z: 6 } });
 run.tick(240);
 run.checkpoint('CP-COMMAND-GROUPS', 'independent-hold', [
  equal('Companion order unchanged', prior, run.state.groups.Companion),
  equal('Troops have independent marker', { x: -5, z: 6 }, run.state.groups.Troops.marker),
  equal('Both groups reach their separate Hold areas', true, run.state.combatants.filter((actor) => actor.role === 'Troop' || actor.role === 'Companion').every((actor) => Math.hypot(actor.position.x - (actor.role === 'Troop' ? -5 : 5), actor.position.z - 6) < 3)),
 ]);
 for (const group of ['Companion', 'Troops'] as const) run.act({ type: 'select-group', group }, { type: 'order', order: 'Follow' });
 run.act({ type: 'move', direction: { x: 0, z: 1 }, facing: 0 });
 run.tick(59);
 run.act({ type: 'move', direction: { x: 0, z: 0 }, facing: 0 });
 run.tick(240);
 const player = run.state.combatants.find((actor) => actor.role === 'Player')!;
 run.checkpoint('CP-COMMAND-GROUPS', 'follow-formation', [
  equal('Follow cancels both Hold markers', [null, null], [run.state.groups.Companion.marker, run.state.groups.Troops.marker]),
  equal('Both groups Follow', ['Follow', 'Follow'], [run.state.groups.Companion.order, run.state.groups.Troops.order]),
  equal('Both groups follow the moved player rather than remaining at Hold', true, run.state.combatants.filter((actor) => actor.role === 'Troop' || actor.role === 'Companion').every((actor) => Math.hypot(actor.position.x - player.position.x, actor.position.z - player.position.z) < 3.5)),
 ]);
}

function orders(run: Recorder): void {
 commandBand(run);
 const initial = run.state;
 run.tick(180);
 run.checkpoint('CP-COMMAND-GROUPS', 'engage-advance', [
  equal('Both groups advance from their Follow formation', true, run.state.combatants.filter((actor) => actor.role === 'Troop' || actor.role === 'Companion').every((actor) => actor.position.z < initial.combatants.find((value) => value.id === actor.id)!.position.z - 1)),
  equal('Both groups acquire an active threat', true, Object.values(run.state.groups).every((group) => run.state.combatants.some((actor) => actor.id === group.target && actor.team === 'Raiders' && actor.status === 'Active'))),
 ]);
 const retargeted = new Set<string>();
 let max = 0;
 for (let tick = 0; tick < 3600 && run.state.phase === 'Battle' && retargeted.size < 2; tick++) {
  const before = run.state;
  run.tick();
  max = Math.max(max, run.state.combatants.filter((actor) => actor.team === 'Raiders' && actor.status === 'Active' && ['Windup', 'Active'].includes(actor.action)).length);
  const lost = (['Companion', 'Troops'] as const).filter((group) => before.groups[group].target && run.state.combatants.find((actor) => actor.id === before.groups[group].target)?.status !== 'Active');
  if (!lost.length || run.state.phase !== 'Battle') continue;
  const afterLoss = run.state;
  run.tick();
  for (const group of lost) {
   const members = afterLoss.combatants.filter((actor) => actor.role === (group === 'Troops' ? 'Troop' : 'Companion') && actor.status === 'Active');
   const threats = afterLoss.combatants.filter((actor) => actor.team === 'Raiders' && actor.status === 'Active');
   if (!members.length || !threats.length) continue;
   const center = { x: members.reduce((sum, actor) => sum + actor.position.x, 0) / members.length, z: members.reduce((sum, actor) => sum + actor.position.z, 0) / members.length };
   threats.sort((a, b) => Math.hypot(a.position.x - center.x, a.position.z - center.z) - Math.hypot(b.position.x - center.x, b.position.z - center.z));
   run.checkpoint('CP-COMMAND-GROUPS', `${group}-next-tick-retarget`, [equal('Nearest remaining threat selected on the next fixed tick', threats[0]!.id, run.state.groups[group].target), equal('Exactly one tick after target loss', afterLoss.tick + 1, run.state.tick)]);
   retargeted.add(group);
  }
 }
 run.checkpoint('CP-COMMAND-AI', 'sampled-pressure', [equal('Raider attacks actually observed', true, max > 0), equal('Raider commitment cap', true, max <= 2), equal('Both groups retargeted after an actual casualty', ['Companion', 'Troops'], [...retargeted].sort())]);
}

function deployCasualties(run: Recorder): void {
 run.act({ type: 'select-group', group: 'Companion' }, { type: 'order', order: 'Hold' }, { type: 'hold-point', point: { x: 19, z: -14 } });
 run.act({ type: 'select-group', group: 'Troops' }, { type: 'order', order: 'Hold' }, { type: 'hold-point', point: { x: 0, z: -7 } });
}

function casualties(run: Recorder): void {
 const roster = run.state.campaign.members;
 run.until((state) => state.phase !== 'Battle' || state.combatants.some((actor) => actor.role === 'Troop' && actor.status !== 'Active'), 18000, 'Natural Troop casualty');
 run.act({ type: 'pause' }, { type: 'journal' });
 run.checkpoint('CP-COMBAT-CASUALTY', 'troop-casualty-concealed', [
  equal('Battle remains unresolved', 'Battle', run.state.phase),
  equal('Journal exposes the unchanged roster', roster.map((member) => member.id), run.state.campaign.members.map((member) => member.id)),
  equal('Journal is open', true, run.state.journalOpen),
  equal('A Troop truly left active combat', true, run.state.combatants.some((actor) => actor.role === 'Troop' && actor.status !== 'Active')),
 ]);
 run.act({ type: 'close' }, { type: 'pause' });
 run.until((state) => state.phase !== 'Battle' || state.combatants.filter((actor) => actor.role === 'Troop').every((actor) => actor.status !== 'Active'), 18000, 'Troop group becomes unavailable');
 const before = run.state;
 const firstEvent = run.events.length;
 run.act({ type: 'order', order: 'Engage' }, { type: 'select-group', group: 'Companion' });
 run.act({ type: 'select-group', group: 'Troops' });
 run.checkpoint('CP-COMMAND-GROUPS', 'inactive-group-rejected', [
  equal('Still in Battle with inactive Troops retained', 'Battle', run.state.phase),
  equal('No active Troop remains', true, run.state.combatants.filter((actor) => actor.role === 'Troop').every((actor) => actor.status !== 'Active')),
  equal('Inactive group cannot receive orders', before.groups.Troops, run.state.groups.Troops),
  equal('Inactive Troop selection keeps Companion selected', 'Companion', run.state.selectedGroup),
  equal('Both inactive order and selection reject', 2, run.events.slice(firstEvent).filter((event) => event.type === 'invalid').length),
  equal('Roster is still concealed', roster.map((member) => member.id), run.state.campaign.members.map((member) => member.id)),
 ]);
 fight(run);
 const resolved = run.state;
 const expectedMembers = roster.flatMap((member) => {
  const actor = resolved.combatants.find((value) => value.id === member.id)!;
  if (actor.role === 'Troop' && actor.status === 'Killed') return [];
  const health = resolved.outcome === 'Victory' && actor.status === 'Downed' && actor.role !== 'Troop' ? 25 : actor.health;
  return [{ ...member, health, available: health > 0 }];
 });
 run.checkpoint('CP-COMBAT-CASUALTY', 'resolution-reveals-casualties', [
  equal('Resolution follows an actual victory', 'Victory', resolved.outcome),
  equal('Only killed Troops leave; survivor identity, equipment and exact health persist', expectedMembers, resolved.campaign.members),
  equal('Casualty record includes every unavailable Band member', resolved.combatants.filter((actor) => actor.team === 'Band' && actor.status !== 'Active').map((actor) => actor.id), resolved.campaign.casualties.band),
 ]);
 resolveVictory(run, 'Release', 'Rapid Guard', false);
 run.checkpoint('CP-COMBAT-CASUALTY', 'survivors-persist', [equal('Settlement return and snapshot preserve every survivor exactly', expectedMembers, run.simulation.snapshot().campaign.members)]);
}

function deployResidentLoss(run: Recorder): void {
 for (const group of ['Companion', 'Troops'] as const) run.act({ type: 'select-group', group }, { type: 'order', order: 'Hold' }, { type: 'hold-point', point: { x: 20, z: 18 } });
}

function residentLoss(run: Recorder): void {
 const route = [{ x: 20, z: 17 }, { x: 18, z: 17 }, { x: 18, z: 4.5 }, { x: 20, z: 4.5 }];
 let waypoint = 0;
 let before = run.state;
 for (let tick = 0; tick < 36000 && run.state.phase === 'Battle'; tick++) {
  before = run.state;
  if (tick % 6 === 0) {
   const player = before.combatants.find((actor) => actor.role === 'Player')!;
   if (Math.hypot(route[waypoint]!.x - player.position.x, route[waypoint]!.z - player.position.z) < 1) waypoint = (waypoint + 1) % route.length;
   const dx = route[waypoint]!.x - player.position.x;
   const dz = route[waypoint]!.z - player.position.z;
   const distance = Math.hypot(dx, dz);
   run.command({ type: 'move', direction: { x: dx / distance, z: dz / distance }, facing: Math.atan2(dx, dz) });
  }
  run.tick();
 }
 run.checkpoint('CP-FLOW-DEFEAT', 'last-resident-loss', [
  equal('Last resident was active on the preceding tick', 1, before.combatants.filter((actor) => actor.role === 'Resident' && actor.status === 'Active').length),
  equal('All residents killed', 5, run.state.combatants.filter((actor) => actor.role === 'Resident' && actor.status === 'Killed').length),
  equal('Active Band rules out the distinct Band-defeat trigger', true, run.state.combatants.some((actor) => actor.team === 'Band' && actor.status === 'Active')),
  equal('Raiders remain active', true, run.state.combatants.some((actor) => actor.team === 'Raiders' && actor.status === 'Active')),
  equal('Immediate defeat summary', 'Summary', run.state.phase),
  equal('Failed contract', 'Failed', run.state.campaign.contract),
  equal('Damaged settlement', 'Damaged', run.state.campaign.condition),
  equal('No fate or Feat award', [null, null, null], [run.state.campaign.enemyChoice, run.state.campaign.banditChoice, run.state.campaign.feat]),
 ]);
 run.act({ type: 'continue' });
 run.checkpoint('CP-SPEC-END-TO-END', 'resident-loss-return', [equal('Changed settlement return', 'Settlement', run.state.phase), equal('All five resident losses persist', 5, run.simulation.snapshot().campaign.casualties.residents)]);
}

function preparation(run: Recorder): void {
 run.act({ type: 'journal' });
 for (let count = 0; count <= 4; count++) {
  if (count) run.act({ type: 'recruit', candidateId: `troop-${count}`, confirmed: true });
  run.checkpoint('CP-PREP-RECRUIT', `troops-${count}`, [equal('Exact recruited count', count, run.state.campaign.members.filter((member) => member.role === 'Troop').length), equal('Twenty-five Coin each', 100 - count * 25, run.state.campaign.coin)]);
 }
 const roster = run.state.campaign;
 run.act({ type: 'recruit', candidateId: 'troop-4', confirmed: true });
 run.checkpoint('CP-PREP-RECRUIT', 'zero-coin-duplicate', [equal('No duplicate or overdraft', roster, run.state.campaign)]);
 run.act({ type: 'close' }, { type: 'leave' });
 run.act({ type: 'transition-ready' });
 run.act({ type: 'travel', point: { x: 25, z: .5 } });
 for (const speed of [1, 2, 3, 4]) {
  run.act({ type: 'pause' });
  const stopped = run.state.campaign;
  run.tick(60);
  run.checkpoint('CP-PREP-PROVISIONS', `pause-before-${speed}`, [equal('Pause freezes all campaign fields', stopped, run.state.campaign)]);
  const before = run.state.campaign;
  run.act({ type: 'speed', speed });
  run.tick(59);
  run.checkpoint('CP-FLOW-CONTRACT', `speed-${speed}`, [near('Scaled travel', .1 * speed, run.state.campaign.position.x - before.position.x), near('Scaled campaign hours', .8 * speed, run.state.campaign.time - before.time), equal('Speed unpauses', false, run.state.paused)]);
 }
 run.until((state) => state.campaign.provisions === 0, 18000, 'Provisions exhausted by actual movement');
 const depleted = run.state.campaign;
 run.tick(60);
 run.checkpoint('CP-PREP-PROVISIONS', 'zero-does-not-block-travel', [equal('Clamp at zero', 0, run.state.campaign.provisions), equal('Travel continues at zero', true, run.state.campaign.position.x > depleted.position.x), equal('No health penalty', depleted.members, run.state.campaign.members)]);
}

export async function runScenario(scenario: DeepReadonly<Scenario>): Promise<Trace> {
 if (!scenario.recipe) throw new Error(`${scenario.id} requires ${scenario.execution} evidence, not a core run.`);
 const simulation = await Simulation.create(scenario.seed);
 const run = new Recorder(simulation, scenario.recipe === 'casualties' || scenario.recipe === 'resident-loss');
 let failure: string | null = null;
 try {
  enterSettlement(run);
  if (scenario.recipe === 'preparation') preparation(run);
  else {
   recruit(run, scenario.recipe === 'defeat' ? 0 : scenario.recipe === 'orders' ? 4 : 2);
   acceptContract(run);
   startBattle(run, scenario.late ?? false, ['combat-input', 'shield', 'casualties', 'resident-loss'].includes(scenario.recipe), scenario.recipe === 'orders' ? deployOrders : scenario.recipe === 'casualties' ? deployCasualties : scenario.recipe === 'resident-loss' ? deployResidentLoss : undefined);
   if (scenario.recipe === 'combat-input') combatInput(run);
   else if (scenario.recipe === 'shield') shield(run);
   else if (scenario.recipe === 'orders') orders(run);
   else if (scenario.recipe === 'casualties') casualties(run);
   else if (scenario.recipe === 'resident-loss') residentLoss(run);
   else {
    fight(run, scenario.recipe === 'defeat');
    if (scenario.recipe === 'defeat') {
     run.checkpoint('CP-FLOW-DEFEAT', 'band-defeat', [equal('Actual Band defeat', 'Defeat', run.state.outcome), equal('All Band inactive', true, run.state.combatants.filter((actor) => actor.team === 'Band').every((actor) => actor.status !== 'Active')), equal('Residents remain for distinct trigger', true, run.state.combatants.some((actor) => actor.role === 'Resident' && actor.status === 'Active')), equal('Defeat goes straight to summary', 'Summary', run.state.phase)]);
     const defeated = run.state.campaign;
     run.act({ type: 'choose-fate', choice: 'Capture' }, { type: 'choose-feat', feat: 'Rapid Attack' });
     run.checkpoint('CP-REL-FAILURE', 'no-defeat-rewards', [equal('Invalid rewards do not mutate campaign', defeated, run.state.campaign), equal('Settlement Agent grievances', ['Settlement harmed', 'Settlement harmed'], run.state.campaign.agents.filter((agent) => agent.id !== 'enemy').flatMap((agent) => agent.grievances)), equal('No Feat', null, run.state.campaign.feat)]);
     run.act({ type: 'continue' });
     run.checkpoint('CP-SPEC-END-TO-END', 'failed-return', [equal('Returned to settlement', 'Settlement', run.state.phase), equal('Failed', 'Failed', run.state.campaign.contract), equal('Damaged', 'Damaged', run.state.campaign.condition), equal('Changed return save-safe', 'Safe non-combat', run.state.boundary)]);
    } else resolveVictory(run, scenario.fate ?? 'Release', scenario.feat ?? 'Rapid Guard', scenario.late ?? false);
   }
  }
 } catch (error) { failure = error instanceof Error ? error.message : String(error); }
 const final = simulation.project();
 simulation.dispose();
 return { seed: scenario.seed, transcript: run.transcript, events: run.events, checkpoints: run.checkpoints, final, failure };
}
