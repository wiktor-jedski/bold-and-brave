import { Simulation } from '../core/simulation';
import { validateSnapshot } from '../core/snapshot';
import type { Command, DeepReadonly, Feedback, Projection } from '../core/types';
import type { TranscriptEntry } from './catalog';

export function stableJSON(value: unknown): string {
 if (value === null || typeof value !== 'object') {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Evidence cannot contain undefined values.');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Evidence cannot contain non-finite numbers.');
  return encoded;
 }
 if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
 return `{${Object.keys(value).sort().filter((key) => (value as Record<string, unknown>)[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableJSON((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

export async function stableHash(value: unknown): Promise<string> {
 const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJSON(value)));
 return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Validates checkpoint projections, not unsafe save snapshots. Combat is never restored. */
export function validateProjection(state: Projection): void {
 stableJSON(state); // Reject NaN/Infinity anywhere in a machine-readable checkpoint.
 if (!Number.isSafeInteger(state.tick) || state.tick < 0) throw new Error('Invalid checkpoint tick.');
 if (!['Travel', 'Settlement', 'Setup', 'Battle', 'Agent fate', 'Bandit fate', 'Summary', 'Feat'].includes(state.phase)) throw new Error('Invalid checkpoint phase.');
 if (!['Safe non-combat', 'Transitioning', 'Restoring snapshot', 'Battle and resolution', 'Load failed'].includes(state.boundary)) throw new Error('Invalid checkpoint boundary.');
 if (state.boundary === 'Safe non-combat') validateSnapshot({ version: 1, campaign: structuredClone(state.campaign) });
 if (state.campaign.coin < 0 || state.campaign.provisions < 0 || state.campaign.provisionRemainder < 0 || state.campaign.provisionRemainder >= .5 + 1e-8) throw new Error('Invalid checkpoint resources.');
 const ids = new Set<string>();
 for (const actor of state.combatants) {
  if (ids.has(actor.id)) throw new Error(`Duplicate combatant ${actor.id}.`);
  ids.add(actor.id);
  if (!['Player', 'Companion', 'Troop', 'Enemy Agent', 'Bandit', 'Resident'].includes(actor.role)) throw new Error('Invalid Combatant role.');
  if (actor.health < 0 || actor.health > actor.maxHealth || actor.stamina < -1e-8 || actor.stamina > 100 + 1e-8) throw new Error(`Invalid health/stamina for ${actor.id}.`);
  if (!['Active', 'Downed', 'Killed'].includes(actor.status)) throw new Error(`Invalid casualty state for ${actor.id}.`);
  if (actor.status !== 'Active' && actor.health !== 0) throw new Error(`Inactive actor ${actor.id} has nonzero health.`);
 }
 for (const agent of state.campaign.agents) {
  if (agent.fate !== 'Active' && agent.disposition !== undefined) throw new Error(`Terminal Agent ${agent.id} retains a Disposition.`);
 }
}

/** Checks observable casualty transitions, including the tick that resolves the battle. */
export function validateBattleTransition(before: Projection, after: Projection, events: readonly Feedback[]): void {
 if (before.phase !== 'Battle') return;
 let randomState = before.campaign.randomState;
 for (const event of events) {
  if (event.type !== 'downed' && event.type !== 'killed') continue;
  const actor = after.combatants.find((value) => value.id === event.actorId);
  const prior = before.combatants.find((value) => value.id === event.actorId);
  if (!actor || !prior || prior.status !== 'Active' || actor.health !== 0) throw new Error('Casualty feedback must describe a new zero-health event.');
  let expected = actor.role === 'Resident' ? 'Killed' : 'Downed';
  if (actor.role === 'Troop' || actor.role === 'Bandit') {
   randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
   expected = randomState / 4294967296 < .20 ? 'Downed' : 'Killed';
  }
  if (actor.status !== expected || event.type !== expected.toLowerCase()) throw new Error(`Incorrect casualty result for ${actor.id}.`);
 }
 if (after.campaign.randomState !== randomState) throw new Error('Each probabilistic casualty must consume exactly one seeded draw.');
 for (const prior of before.combatants) {
  if (prior.status === 'Active') continue;
  const actor = after.combatants.find((value) => value.id === prior.id);
  if (!actor || actor.status !== prior.status || actor.health !== 0 || actor.position.x !== prior.position.x || actor.position.z !== prior.position.z) throw new Error(`Inactive Combatant ${prior.id} moved, revived or changed casualty state.`);
  if (events.some((event) => event.actorId === prior.id && ['attack', 'struck', 'downed', 'killed'].includes(event.type))) throw new Error(`Inactive Combatant ${prior.id} participated in combat.`);
 }
 for (const actor of after.combatants) {
  if (actor.target && after.combatants.find((value) => value.id === actor.target)?.status !== 'Active') throw new Error(`Combatant ${actor.id} targets an inactive casualty.`);
 }
 for (const group of Object.values(after.groups)) {
  if (group.target && after.combatants.find((value) => value.id === group.target)?.status !== 'Active') throw new Error('Command group targets an inactive casualty.');
 }
 if (after.phase === 'Battle') {
  if (stableJSON(before.campaign.members.map((member) => member.id)) !== stableJSON(after.campaign.members.map((member) => member.id))) throw new Error('Battle roster revealed a killed Troop before resolution.');
  for (const actor of after.combatants) {
   if (actor.team !== 'Band' || actor.status === 'Active') continue;
   const member = after.campaign.members.find((value) => value.id === actor.id);
   if (!member || member.health !== 0 || member.available) throw new Error(`Battle casualty ${actor.id} must remain an unavailable zero-health roster entry.`);
  }
 }
}

export interface AssertionResult { name: string; expected: unknown; actual: unknown; passed: boolean }
export interface Checkpoint {
 id: string;
 label: string;
 tick: number;
 state: Projection;
 assertions: AssertionResult[];
 artifactRule: 'none';
 claimScope: 'core-state-only';
}
export interface Trace {
 seed: number;
 transcript: TranscriptEntry[];
 events: Feedback[];
 checkpoints: Checkpoint[];
 final: Projection;
 failure: string | null;
}

export class Recorder {
 readonly transcript: TranscriptEntry[] = [];
 readonly events: Feedback[] = [];
 readonly checkpoints: Checkpoint[] = [];
 constructor(readonly simulation: Simulation, private readonly checkBattleTransitions = false) {}
 get state(): Projection { return this.simulation.project(); }
 command(command: Command): void {
  const targetTick = this.state.tick + 1;
  this.transcript.push({ targetTick, command: structuredClone(command) });
  this.simulation.submit(command, targetTick);
 }
 tick(count = 1): void {
  for (let i = 0; i < count; i++) {
   const before = this.checkBattleTransitions ? this.state : null;
   this.simulation.advance();
   const events = this.simulation.drainEvents();
   this.events.push(...events);
   if (before) validateBattleTransition(before, this.state, events);
  }
 }
 act(...commands: Command[]): void { for (const command of commands) this.command(command); this.tick(); }
 until(predicate: (state: Projection) => boolean, maxTicks: number, label: string): void {
  for (let tick = 0; tick < maxTicks && !predicate(this.state); tick++) this.tick();
  if (!predicate(this.state)) throw new Error(`${label} not reached within ${maxTicks} exact ticks (tick ${this.state.tick}, phase ${this.state.phase}).`);
 }
 checkpoint(id: string, label: string, assertions: AssertionResult[]): void {
  const state = this.state;
  let validation: string | null = null;
  try { validateProjection(state); } catch (error) { validation = error instanceof Error ? error.message : String(error); }
  assertions = [equal('Checkpoint projection validates', null, validation), ...assertions];
  this.checkpoints.push({ id, label, tick: state.tick, state, assertions, artifactRule: 'none', claimScope: 'core-state-only' });
  const failures = assertions.filter((assertion) => !assertion.passed);
  if (failures.length) throw new Error(`${id}/${label}: ${failures.map((result) => `${result.name}: expected ${stableJSON(result.expected)}, got ${stableJSON(result.actual)}`).join('; ')}`);
 }
}

export function equal(name: string, expected: unknown, actual: unknown): AssertionResult {
 return { name, expected, actual, passed: stableJSON(expected) === stableJSON(actual) };
}
export function near(name: string, expected: number, actual: number, tolerance = 1e-7): AssertionResult {
 return { name, expected: { value: expected, absoluteTolerance: tolerance }, actual, passed: Number.isFinite(actual) && Math.abs(expected - actual) <= tolerance };
}

export async function replay(seed: number, transcript: DeepReadonly<TranscriptEntry[]>, endTick: number, checkpointTicks: readonly number[]): Promise<{ states: Projection[]; events: Feedback[]; final: Projection }> {
 const simulation = await Simulation.create(seed);
 try {
  let previousTick = 0;
  for (const entry of transcript) {
   if (!Number.isSafeInteger(entry.targetTick) || entry.targetTick <= 0 || entry.targetTick < previousTick || entry.targetTick > endTick) throw new Error('Transcript is not ordered in executable target ticks.');
   previousTick = entry.targetTick;
   simulation.submit(structuredClone(entry.command) as Command, entry.targetTick);
  }
  const wanted = new Set(checkpointTicks);
  const statesByTick = new Map<number, Projection>();
  const events: Feedback[] = [];
  if (wanted.has(0)) statesByTick.set(0, simulation.project());
  for (let tick = 1; tick <= endTick; tick++) {
   simulation.advance();
   events.push(...simulation.drainEvents());
   if (wanted.has(tick)) {
    const state = simulation.project();
    validateProjection(state);
    statesByTick.set(tick, state);
   }
  }
  return { states: checkpointTicks.map((tick) => {
   const state = statesByTick.get(tick);
   if (!state) throw new Error(`Missing replay checkpoint at tick ${tick}.`);
   return state;
  }), events, final: simulation.project() };
 } finally { simulation.dispose(); }
}
