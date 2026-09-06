import { AGENTS, CANDIDATES, FEATS, LOADOUTS, WORLD } from '../content/catalog';
import { CombatSystem, initPhysics } from './combat';
import { validateSnapshot } from './snapshot';
import type { ArenaMode, Campaign, Command, Emit, FateChoice, Feedback, GameState, Member, Projection, SceneId, SimulationPort, Snapshot, Vec2 } from './types';

const STEP = 1 / 60;
let physicsInitialization: Promise<void> | undefined;

function initialCampaign(seed: number): Campaign {
  return {
    scene: 'overworld', position: { ...WORLD.initialPosition }, time: 8, coin: 100, provisions: 10, provisionRemainder: 0,
    members: [
      { id: 'player', name: 'Player', role: 'Player', ...LOADOUTS.Player, available: true },
      { id: 'companion', name: 'Ivo', role: 'Companion', ...LOADOUTS.Companion, available: true },
    ],
    agents: AGENTS.map(identity => ({ ...identity, fate: 'Active', disposition: identity.id === 'enemy' ? 'Hostile' : 'Neutral', grievances: [] })),
    contract: 'Available', deadline: null, raidLocation: null, condition: null, captives: 0, enemyChoice: null, banditChoice: null,
    banditDowned: 0, banditKilled: 0, feat: null, randomState: seed, casualties: { band: [], residents: 0 },
  };
}

function normalState(campaign: Campaign, tick = 0): GameState {
  return {
    tick, campaign, phase: campaign.scene === 'overworld' ? 'Travel' : 'Settlement', boundary: 'Safe non-combat', paused: false, speed: 1,
    destination: null, move: { x: 0, z: 0 }, facing: 0, combatants: [],
    groups: { Companion: { order: 'Follow', marker: null, target: null }, Troops: { order: 'Follow', marker: null, target: null } },
    selectedGroup: 'Companion', placingHold: false, invalidMarker: null, setupRemaining: 0, battleTime: 0,
    outcome: campaign.contract === 'Resolved' ? 'Victory' : campaign.contract === 'Failed' ? 'Defeat' : null,
    dialogue: null, offerOpen: false, journalOpen: false, pendingChoice: null, transition: null, pointer: null,
  };
}
function arenaState(campaign: Campaign, mode: ArenaMode, tick: number): GameState {
  const state = normalState(campaign, tick);
  state.arena = { mode, randomState: campaign.randomState, exiting: false };
  state.phase = mode === 'Team' ? 'Setup' : 'Battle';
  state.boundary = 'Battle and resolution';
  state.setupRemaining = mode === 'Team' ? WORLD.setupSeconds : 0;
  state.outcome = null;
  return state;
}


function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function validPoint(value: unknown): value is Vec2 {
  if (value === null || typeof value !== 'object') return false;
  const point = value as Vec2;
  return Object.keys(point).length === 2 && Object.hasOwn(point, 'x') && Object.hasOwn(point, 'z') && Number.isFinite(point.x) && Number.isFinite(point.z);
}

function validCommand(value: unknown): value is Command {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  const fields = (...names: string[]) => Object.keys(command).length === names.length + 1 && names.every(name => Object.hasOwn(command, name));
  switch (command.type) {
    case 'travel': case 'hold-point': return fields('point') && validPoint(command.point);
    case 'speed': return fields('speed') && [1, 2, 3, 4].includes(command.speed as number);
    case 'move': return fields('direction', 'facing') && validPoint(command.direction) && Number.isFinite(command.facing);
    case 'talk': return fields('agentId') && (command.agentId === 'giver' || command.agentId === 'resident-agent');
    case 'recruit': return fields('candidateId', 'confirmed') && typeof command.candidateId === 'string' && typeof command.confirmed === 'boolean';
    case 'pointer': return fields('phase', 'button', 'x', 'y') && ['down', 'move', 'up'].includes(command.phase as string) && (command.button === 0 || command.button === 2) && Number.isFinite(command.x) && Number.isFinite(command.y);
    case 'select-group': return fields('group') && (command.group === 'Companion' || command.group === 'Troops');
    case 'order': return fields('order') && ['Follow', 'Hold', 'Engage'].includes(command.order as string);
    case 'choose-fate': return fields('choice') && ['Release', 'Capture', 'Execute'].includes(command.choice as string);
    case 'choose-feat': return fields('feat') && FEATS.includes(command.feat as typeof FEATS[number]);
    case 'arena-start': return fields('mode') && (command.mode === 'Duel' || command.mode === 'Team');
    case 'pause': case 'close': case 'journal': case 'accept': case 'decline': case 'wait': case 'leave': case 'guard-mode':
    case 'arena-restart': case 'arena-exit':
    case 'confirm-fate': case 'cancel-fate': case 'continue': case 'transition-ready': case 'transition-failed': case 'retry-transition': return fields();
    default: return false;
  }
}

function roundHour(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) < 1e-9 ? integer : value;
}

/** The sole mutable gameplay owner; browser and scenario callers use the same command stream. */
export class Simulation implements SimulationPort {
  private state: GameState;
  private combat: CombatSystem;
  private queue: { tick: number; command: Command | null; reason?: string }[] = [];
  private events: Feedback[] = [];
  private projection: Projection | null = null;
  private pendingLateBattle = false;
  private skipStep = false;
  private disposed = false;

  private constructor(seed: number) {
    this.state = normalState(initialCampaign(seed));
    this.combat = new CombatSystem();
    this.combat.rebuild(this.state);
  }

  static async create(seed = 0xb01d2026): Promise<Simulation> {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('The campaign seed must be an unsigned 32-bit integer.');
    await (physicsInitialization ??= initPhysics());
    return new Simulation(seed);
  }

  private emit: Emit = event => {
    this.events.push({ ...event, ...(event.position ? { position: { ...event.position } } : {}), tick: this.state.tick });
  };

  private invalid(message = 'That action is not available in the current state.'): void {
    this.emit({ type: 'invalid', message });
  }

  submit(command: Command, targetTick = this.state.tick + 1): void {
    if (this.disposed) throw new Error('The Simulation has been disposed.');
    let copied: Command | null = null;
    let reason: string | undefined;
    if (!Number.isSafeInteger(targetTick) || targetTick <= this.state.tick) {
      targetTick = this.state.tick + 1;
      reason = 'Commands must target a future integer tick.';
    } else {
      try {
        const candidate: unknown = structuredClone(command);
        if (validCommand(candidate)) copied = candidate;
        else reason = 'The command is malformed.';
      } catch {
        reason = 'The command is not plain command data.';
      }
    }
    const entry = { tick: targetTick, command: copied, reason };
    let low = 0;
    let high = this.queue.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.queue[middle]!.tick <= targetTick) low = middle + 1;
      else high = middle;
    }
    this.queue.splice(low, 0, entry);
  }

  advance(): void {
    if (this.disposed) throw new Error('The Simulation has been disposed.');
    this.state.tick++;
    this.projection = null;
    this.skipStep = false;
    if (this.pendingLateBattle) {
      this.pendingLateBattle = false;
      this.beginRaid('Settlement center');
      this.skipStep = false;
    }
    let consumed = 0;
    while (consumed < this.queue.length && this.queue[consumed]!.tick <= this.state.tick) {
      const entry = this.queue[consumed++]!;
      if (entry.command) this.command(entry.command);
      else this.invalid(entry.reason);
    }
    if (consumed) this.queue.splice(0, consumed);
    if (this.skipStep || this.state.paused || this.state.boundary === 'Transitioning' || this.state.boundary === 'Load failed') return;
    if (this.state.phase === 'Travel') this.travel();
    else if (this.state.phase === 'Settlement') this.combat.step(this.state, this.emit);
    else if (this.state.phase === 'Setup') {
      this.combat.step(this.state, this.emit);
      this.state.setupRemaining = Math.max(0, Math.round((this.state.setupRemaining - STEP) * 60) / 60);
      if (this.state.setupRemaining === 0) this.state.phase = 'Battle';
    } else if (this.state.phase === 'Battle') {
      this.combat.step(this.state, this.emit);
      this.evaluateOutcome();
    }
  }

  project(): Projection {
    if (!this.projection) this.projection = freeze(structuredClone(this.state));
    return this.projection;
  }

  drainEvents(): Feedback[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  snapshot(): Snapshot {
    if (this.disposed || this.state.arena || this.state.boundary !== 'Safe non-combat') throw new Error('Saving is available only at a Safe non-combat boundary outside the Arena.');
    return validateSnapshot({ version: 1, campaign: this.state.campaign });
  }

  restore(value: unknown): void {
    if (this.disposed || this.state.arena || this.state.boundary !== 'Safe non-combat') throw new Error('Loading is available only at a Safe non-combat boundary outside the Arena.');
    const snapshot = validateSnapshot(value);
    const replacement = normalState(snapshot.campaign);
    const prior = this.state;
    prior.boundary = 'Restoring snapshot';
    this.projection = null;
    let rebuilt: CombatSystem | undefined;
    try {
      rebuilt = new CombatSystem();
      rebuilt.rebuild(replacement);
    } catch (error) {
      rebuilt?.dispose();
      prior.boundary = 'Safe non-combat';
      throw error;
    }
    this.combat.dispose();
    this.combat = rebuilt;
    this.state = replacement;
    this.pendingLateBattle = replacement.phase === 'Settlement' && replacement.campaign.contract === 'Accepted' && replacement.campaign.time >= replacement.campaign.deadline!;
    this.queue = [];
    this.events = [];
  }

  dispose(): void {
    if (this.disposed) return;
    this.combat.dispose();
    this.queue = [];
    this.events = [];
    this.disposed = true;
  }

  private command(command: Command): void {
    const state = this.state;
    const campaign = state.campaign;
    if (command.type === 'transition-ready') {
      if (state.boundary !== 'Transitioning' || state.transition === null) return this.invalid();
      this.finishTransition();
      return;
    }
    if (command.type === 'transition-failed') {
      if (state.boundary !== 'Transitioning') return this.invalid();
      state.boundary = 'Load failed';
      this.emit({ type: 'transition', message: 'Scene load failed. Retry to restart loading.' });
      return;
    }
    if (command.type === 'retry-transition') {
      if (state.boundary !== 'Load failed' || state.transition === null) return this.invalid();
      state.boundary = 'Transitioning';
      this.emit({ type: 'transition', message: 'Retrying Scene load.' });
      return;
    }
    if (state.boundary === 'Transitioning' || state.boundary === 'Load failed' || state.boundary === 'Restoring snapshot' || this.pendingLateBattle) return this.invalid();
    const normal = state.phase === 'Travel' || state.phase === 'Settlement';
    const tactical = state.phase === 'Setup' || state.phase === 'Battle';
    if (state.arena && !['arena-start', 'arena-restart', 'arena-exit', 'pause', 'close', 'move', 'pointer', 'guard-mode', 'select-group', 'order', 'hold-point'].includes(command.type)) {
      return this.invalid('Campaign actions are unavailable in the Arena. Exit to return to your unchanged campaign.');
    }
    switch (command.type) {
      case 'arena-start':
        if (state.arena) this.restartArena(command.mode);
        else {
          if (!normal || state.boundary !== 'Safe non-combat') return this.invalid();
          state.arena = { mode: command.mode, randomState: campaign.randomState, exiting: false };
          this.startTransition('settlement');
        }
        return;
      case 'arena-restart':
        if (!state.arena) return this.invalid();
        this.restartArena(state.arena.mode);
        return;
      case 'arena-exit':
        if (!state.arena) return this.invalid();
        state.arena.exiting = true;
        this.startTransition(campaign.scene);
        return;
      case 'travel': {
        if (state.phase !== 'Travel' || Math.abs(command.point.x) > WORLD.overworldLimit || Math.abs(command.point.z) > WORLD.overworldLimit) return this.invalid('Choose traversable Overworld ground.');
        state.destination = { ...command.point };
        return;
      }
      case 'speed':
        if (state.phase !== 'Travel') return this.invalid();
        state.speed = command.speed;
        state.paused = false;
        return;
      case 'pause':
        if (!normal && !tactical) return this.invalid();
        state.paused = !state.paused;
        return;
      case 'journal':
        if (!normal && !tactical) return this.invalid();
        state.journalOpen = !state.journalOpen;
        state.dialogue = null;
        state.offerOpen = false;
        state.move = { x: 0, z: 0 };
        this.emit({ type: 'journal', message: state.journalOpen ? 'Journal opened.' : 'Journal closed.' });
        return;
      case 'close': {
        if (state.placingHold) {
          state.placingHold = false;
          state.invalidMarker = null;
          this.emit({ type: 'cancel', message: 'Hold placement cancelled.' });
          return;
        }
        if (!state.journalOpen && !state.offerOpen && state.dialogue === null) return this.invalid();
        const journal = state.journalOpen;
        state.journalOpen = false;
        state.offerOpen = false;
        state.dialogue = null;
        this.emit({ type: journal ? 'journal' : 'cancel', message: journal ? 'Journal closed.' : 'Dialogue closed.' });
        return;
      }
      case 'talk':
        if (state.phase !== 'Settlement') return this.invalid();
        state.dialogue = command.agentId;
        state.offerOpen = command.agentId === 'giver' && (campaign.contract === 'Available' || campaign.contract === 'Accepted');
        state.journalOpen = false;
        state.move = { x: 0, z: 0 };
        this.emit({ type: 'interaction', actorId: command.agentId });
        return;
      case 'accept':
        if (state.phase !== 'Settlement' || !state.offerOpen || state.dialogue !== 'giver' || campaign.contract !== 'Available') return this.invalid();
        campaign.contract = 'Accepted';
        campaign.deadline = campaign.time + 12;
        state.offerOpen = false;
        state.dialogue = null;
        this.emit({ type: 'accepted', message: 'Local Contract Accepted. The Raid deadline is 12 Overworld hours away.' });
        return;
      case 'decline':
        if (state.phase !== 'Settlement' || !state.offerOpen || state.dialogue !== 'giver' || campaign.contract !== 'Available') return this.invalid();
        state.offerOpen = false;
        state.dialogue = null;
        this.emit({ type: 'cancel', message: 'Local Contract declined; it remains Available.' });
        return;
      case 'wait':
        if (state.phase !== 'Settlement' || (campaign.contract !== 'Available' && campaign.contract !== 'Accepted')) return this.invalid();
        campaign.time = campaign.contract === 'Accepted' ? Math.min(campaign.time + 1, campaign.deadline!) : campaign.time + 1;
        this.emit({ type: 'confirm', message: 'Waited until the next Overworld hour or Raid deadline.' });
        if (campaign.contract === 'Accepted' && campaign.time >= campaign.deadline!) this.beginRaid('Bridge');
        return;
      case 'leave':
        if (state.phase !== 'Settlement') return this.invalid();
        this.startTransition('overworld');
        return;
      case 'recruit': {
        const candidate = CANDIDATES.find(item => item.id === command.candidateId);
        if (!normal || !state.journalOpen || !command.confirmed || !candidate || (campaign.contract !== 'Available' && campaign.contract !== 'Accepted') || (campaign.deadline !== null && campaign.time >= campaign.deadline) || campaign.coin < 25 || campaign.members.some(item => item.id === command.candidateId)) return this.invalid('Recruitment requires the open Journal, an available candidate, a confirmed 25 Coin cost, and time before the Raid.');
        const member: Member = { ...candidate, role: 'Troop', ...LOADOUTS.Troop, available: true };
        campaign.members.push(member);
        campaign.coin -= 25;
        if (state.phase === 'Settlement') this.combat.rebuild(state);
        this.emit({ type: 'confirm', actorId: member.id, message: `${member.name} joined the Band for 25 Coin.` });
        return;
      }
      case 'choose-fate':
        if ((state.phase !== 'Agent fate' && state.phase !== 'Bandit fate') || state.pendingChoice !== null) return this.invalid();
        state.pendingChoice = command.choice;
        this.emit({ type: 'choice', message: `Confirm ${command.choice}.` });
        return;
      case 'cancel-fate':
        if ((state.phase !== 'Agent fate' && state.phase !== 'Bandit fate') || state.pendingChoice === null) return this.invalid();
        state.pendingChoice = null;
        this.emit({ type: 'cancel', message: 'Fate choice cancelled.' });
        return;
      case 'confirm-fate':
        if ((state.phase !== 'Agent fate' && state.phase !== 'Bandit fate') || state.pendingChoice === null) return this.invalid();
        this.confirmFate(state.pendingChoice);
        return;
      case 'continue':
        if (state.phase !== 'Summary') return this.invalid();
        this.emit({ type: 'confirm' });
        if (state.outcome === 'Victory') state.phase = 'Feat';
        else this.returnToSettlement();
        return;
      case 'choose-feat':
        if (state.phase !== 'Feat' || campaign.contract !== 'Resolved' || campaign.feat !== null) return this.invalid();
        campaign.feat = command.feat;
        this.emit({ type: 'choice', message: `${command.feat} chosen.` });
        this.returnToSettlement();
        return;
      default:
        if (!normal && !tactical) return;
        if ((!tactical && !(state.phase === 'Settlement' && command.type === 'move')) || state.paused || state.dialogue !== null || state.journalOpen) return this.invalid();
        if (!this.combat.command(state, command, this.emit)) this.invalid();
    }
  }

  private travel(): void {
    const state = this.state;
    const campaign = state.campaign;
    const target = state.destination;
    if (!target) return;
    const dx = target.x - campaign.position.x;
    const dz = target.z - campaign.position.z;
    const remaining = Math.hypot(dx, dz);
    if (remaining < 1e-12) {
      state.destination = null;
      return;
    }
    const directionX = dx / remaining;
    const directionZ = dz / remaining;
    let distance = Math.min(WORLD.travelSpeed * state.speed * STEP, remaining);
    const toward = campaign.position.x * directionX + campaign.position.z * directionZ;
    const discriminant = toward * toward - (campaign.position.x ** 2 + campaign.position.z ** 2 - WORLD.entryRadius ** 2);
    let enters = false;
    if (toward < 0 && discriminant > 0) {
      const intersection = -toward - Math.sqrt(discriminant);
      if (intersection >= -1e-10 && intersection <= distance + 1e-10) {
        distance = Math.max(0, intersection);
        enters = true;
      }
    }
    campaign.position.x += directionX * distance;
    campaign.position.z += directionZ * distance;
    state.facing = Math.atan2(directionX, directionZ);
    const hours = distance / WORLD.travelSpeed * WORLD.hoursPerSecond;
    const previousTime = campaign.time;
    campaign.time = roundHour(campaign.time + hours);
    campaign.provisionRemainder += campaign.members.length * hours / 24;
    const units = Math.floor((campaign.provisionRemainder + 1e-10) / 0.5);
    if (units > 0) {
      campaign.provisions = Math.max(0, Math.round(campaign.provisions * 10 - units) / 10);
      campaign.provisionRemainder = Math.max(0, campaign.provisionRemainder - units * 0.5);
    }
    if (distance > 0 && state.tick % 30 === 0) this.emit({ type: 'footstep', actorId: 'player', position: campaign.position });
    if (campaign.contract === 'Accepted' && previousTime < campaign.deadline! && campaign.time >= campaign.deadline!) this.emit({ type: 'deadline', message: 'The Raid has begun. Entering now starts a battle in the settlement center.' });
    if (enters) this.startTransition('settlement');
    else if (distance >= remaining) state.destination = null;
  }

  private startTransition(scene: SceneId): void {
    const state = this.state;
    state.boundary = 'Transitioning';
    state.transition = scene;
    state.destination = null;
    state.move = { x: 0, z: 0 };
    state.pointer = null;
    state.dialogue = null;
    state.offerOpen = false;
    state.journalOpen = false;
    state.paused = false;
    this.emit({ type: 'transition', message: `Loading ${scene}.` });
    this.skipStep = true;
  }

  private finishTransition(): void {
    const state = this.state;
    const destination = state.transition!;
    const arena = state.arena;
    const campaign = arena ? state.campaign : structuredClone(state.campaign);
    if (!arena) {
      campaign.scene = destination;
      campaign.position = { ...(destination === 'settlement' ? WORLD.settlementPosition : WORLD.exitPosition) };
    }
    const next = arena && !arena.exiting ? arenaState(campaign, arena.mode, state.tick) : normalState(campaign, state.tick);
    next.speed = state.speed;
    let rebuilt: CombatSystem | undefined;
    try {
      rebuilt = new CombatSystem();
      if (next.arena) rebuilt.setupArena(next);
      else rebuilt.rebuild(next);
    } catch (error) {
      rebuilt?.dispose();
      state.boundary = 'Load failed';
      this.emit({ type: 'transition', message: `Scene state entry failed: ${error instanceof Error ? error.message : String(error)}` });
      return;
    }
    this.combat.dispose();
    this.combat = rebuilt;
    this.state = next;
    this.pendingLateBattle = !next.arena && destination === 'settlement' && campaign.contract === 'Accepted' && campaign.time >= campaign.deadline!;
    this.skipStep = true;
    this.emit({ type: 'transition', message: `Entered ${destination}.` });
  }

  private restartArena(mode: ArenaMode): void {
    const next = arenaState(this.state.campaign, mode, this.state.tick);
    this.combat.setupArena(next);
    this.state = next;
    this.skipStep = true;
    this.emit({ type: 'confirm', message: `${mode} Arena restarted. Everyone is ready to fight again.` });
  }

  private beginRaid(location: 'Bridge' | 'Settlement center'): void {
    const state = this.state;
    state.boundary = 'Battle and resolution';
    state.phase = location === 'Bridge' ? 'Setup' : 'Battle';
    state.campaign.raidLocation = location;
    state.setupRemaining = location === 'Bridge' ? WORLD.setupSeconds : 0;
    state.battleTime = 0;
    state.paused = false;
    state.move = { x: 0, z: 0 };
    state.destination = null;
    state.dialogue = null;
    state.offerOpen = false;
    state.journalOpen = false;
    state.pointer = null;
    this.combat.setup(state, location);
    this.emit({ type: 'deadline', message: location === 'Bridge' ? 'The Raid deadline has arrived. You have 15 seconds to position the Band at the bridge.' : 'The raiders have reached the settlement center. Defend the residents now.' });
    this.skipStep = true;
  }

  private evaluateOutcome(): void {
    const state = this.state;
    const actors = state.combatants;
    const activeResidents = Boolean(state.arena) || actors.some(actor => actor.team === 'Residents' && actor.status === 'Active');
    const activeBand = actors.some(actor => actor.team === 'Band' && actor.status === 'Active');
    const activeRaiders = actors.some(actor => actor.team === 'Raiders' && actor.status === 'Active');
    if (activeResidents && activeBand && activeRaiders) return;
    const victory = activeResidents && activeBand && !activeRaiders;
    const campaign = state.campaign;
    state.outcome = victory ? 'Victory' : 'Defeat';
    state.phase = state.arena ? 'Summary' : victory ? 'Agent fate' : 'Summary';
    state.boundary = 'Battle and resolution';
    state.paused = false;
    state.move = { x: 0, z: 0 };
    state.pointer = null;
    state.placingHold = false;
    state.dialogue = null;
    state.offerOpen = false;
    state.journalOpen = false;
    if (state.arena) {
      this.emit({ type: victory ? 'victory' : 'defeat', message: `${victory ? 'Victory' : 'Defeat'} in the ${state.arena.mode} Arena. Restart or exit; your campaign is unchanged.` });
      return;
    }
    campaign.contract = victory ? 'Resolved' : 'Failed';
    campaign.condition = victory && campaign.raidLocation === 'Bridge' ? 'Safe' : 'Damaged';
    campaign.casualties = {
      band: actors.filter(actor => actor.team === 'Band' && actor.status !== 'Active').map(actor => actor.id),
      residents: actors.filter(actor => actor.team === 'Residents' && actor.status !== 'Active').length,
    };
    campaign.banditDowned = actors.filter(actor => actor.role === 'Bandit' && actor.status === 'Downed').length;
    campaign.banditKilled = actors.filter(actor => actor.role === 'Bandit' && actor.status === 'Killed').length;
    for (const actor of actors) {
      if (actor.team !== 'Band') continue;
      const member = campaign.members.find(item => item.id === actor.id);
      if (!member) continue;
      if (actor.status === 'Killed' && actor.role === 'Troop') {
        campaign.members.splice(campaign.members.indexOf(member), 1);
        continue;
      }
      member.health = victory && actor.status === 'Downed' && actor.role !== 'Troop' ? 25 : actor.health;
      member.available = member.health > 0;
    }
    if (!victory) {
      for (const agent of campaign.agents) {
        agent.fate = 'Active';
        agent.disposition = 'Hostile';
        if (agent.id !== 'enemy' && !agent.grievances.includes('Settlement harmed')) agent.grievances.push('Settlement harmed');
      }
    }
    this.emit({ type: victory ? 'victory' : 'defeat', message: victory ? 'Victory. Resolve the enemy Agent fate.' : 'Defeat. The Local Contract Failed and the settlement is Damaged.' });
  }

  private confirmFate(choice: FateChoice): void {
    const state = this.state;
    const campaign = state.campaign;
    if (state.phase === 'Agent fate') {
      const giver = campaign.agents.find(agent => agent.id === 'giver')!;
      const resident = campaign.agents.find(agent => agent.id === 'resident-agent')!;
      const enemy = campaign.agents.find(agent => agent.id === 'enemy')!;
      campaign.enemyChoice = choice;
      giver.disposition = choice === 'Execute' ? 'Hostile' : 'Friendly';
      resident.disposition = choice === 'Release' ? 'Neutral' : 'Friendly';
      if (choice === 'Release') enemy.disposition = 'Neutral';
      else {
        enemy.fate = choice === 'Capture' ? 'Captive' : 'Executed';
        delete enemy.disposition;
        if (choice === 'Capture') {
          enemy.grievances.push('Agent captured');
          campaign.captives++;
        } else giver.grievances.push('Agent executed');
      }
      state.phase = campaign.banditDowned > 0 ? 'Bandit fate' : 'Summary';
    } else {
      campaign.banditChoice = choice;
      if (choice === 'Capture') campaign.captives += campaign.banditDowned;
      state.phase = 'Summary';
    }
    state.pendingChoice = null;
    this.emit({ type: 'confirm', message: `${choice} confirmed.` });
  }

  private returnToSettlement(): void {
    const campaign = this.state.campaign;
    campaign.scene = 'settlement';
    campaign.position = { ...WORLD.settlementPosition };
    this.state = normalState(campaign, this.state.tick);
    this.combat.rebuild(this.state);
    this.skipStep = true;
  }
}
