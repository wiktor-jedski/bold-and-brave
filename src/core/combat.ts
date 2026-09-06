import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, KinematicCharacterController, RigidBody, World } from '@dimforge/rapier3d-compat';
import type { Combatant, Command, Emit, GameState, GroupId, Role, Sector, Vec2, Weapon } from './types';
import { ACTOR_RADIUS, ARENA_BOUNDS, arenaTraversable, NAV_CLEARANCE, Navigation, SETTLEMENT_BOUNDS, SOLID_OBSTACLES, traversable } from './navigation';
import { AGENTS, CANDIDATES, COMBATANT_VALUES as ROLES, LOADOUTS, WEAPONS as WEAPON_VALUES } from '../content/catalog';

const DT = 1 / 60;
const EPSILON = 1e-8;
const ACTIVE_TIME = 0.20;
const CAPSULE_HALF_HEIGHT = 0.58;
const CONTROLLER_SKIN = 0.025;
// Planar movement must start above the floor skin, not inside its contact band.
const CAPSULE_CENTER_Y = CAPSULE_HALF_HEIGHT + ACTOR_RADIUS + CONTROLLER_SKIN + 0.001;
const SECTORS: readonly Sector[] = ['Overhead', 'Left cut', 'Right cut', 'Thrust'];
const GROUP_IDS: readonly GroupId[] = ['Companion', 'Troops'];
const ESCAPE_ROUTE: Vec2 = { x: 0, z: 3.8 };
const ENEMY_AGENT = AGENTS.find(value => value.id === 'enemy')!;
const WEAPONS: Record<Weapon, Record<Sector, { damage: number; windup: number; recovery: number; reach: number; reaction: number }>> = {
  Sword: {
    Overhead: { ...WEAPON_VALUES.Sword.Overhead, reach: 1.65, reaction: 0.35 },
    'Left cut': { ...WEAPON_VALUES.Sword['Left cut'], reach: 1.65, reaction: 0.20 },
    'Right cut': { ...WEAPON_VALUES.Sword['Right cut'], reach: 1.65, reaction: 0.20 },
    Thrust: { ...WEAPON_VALUES.Sword.Thrust, reach: 2.05, reaction: 0.18 },
  },
  Staff: {
    Overhead: { ...WEAPON_VALUES.Staff.Overhead, reach: 2.00, reaction: 0.35 },
    'Left cut': { ...WEAPON_VALUES.Staff['Left cut'], reach: 2.00, reaction: 0.20 },
    'Right cut': { ...WEAPON_VALUES.Staff['Right cut'], reach: 2.00, reaction: 0.20 },
    Thrust: { ...WEAPON_VALUES.Staff.Thrust, reach: 2.45, reaction: 0.18 },
  },
};
const ZERO = { x: 0, y: 0, z: 0 };
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
let initialization: Promise<void> | undefined;
export async function initPhysics(): Promise<void> {
  initialization ??= RAPIER.init();
  await initialization;
}

function actor(id: string, name: string, role: Role, position: Vec2, health = ROLES[role].health, armed = true): Combatant {
  const loadout = role === 'Player' || role === 'Companion' || role === 'Troop' ? LOADOUTS[role] : null;
  return {
    id, name, role, team: role === 'Bandit' || role === 'Enemy Agent' ? 'Raiders' : role === 'Resident' ? 'Residents' : 'Band',
    position, facing: role === 'Bandit' || role === 'Enemy Agent' ? 0 : Math.PI,
    health, maxHealth: ROLES[role].health, stamina: 100, speed: ROLES[role].speed,
    weapon: loadout?.weapon ?? (role === 'Resident' ? 'Staff' : 'Sword'), shield: loadout?.shield ?? false, armed,
    status: 'Active', action: 'Idle', sector: null, effectiveSector: null, actionTime: 0, guardTime: 0,
    spendTime: 1.2, exhausted: false, cooldown: 0, target: null, hitIds: [], attackId: 0, guardMode: 'Directional Guard',
  };
}
function active(value: Combatant): boolean { return value.status === 'Active' && value.health > 0; }
function enemies(a: Combatant, b: Combatant): boolean { return (a.team === 'Raiders') !== (b.team === 'Raiders'); }
function distanceSquared(a: Vec2, b: Vec2): number { return (a.x - b.x) ** 2 + (a.z - b.z) ** 2; }
function committed(a: Combatant): boolean { return a.action === 'Windup' || a.action === 'Active'; }
function groupOf(a: Combatant): GroupId | null { return a.role === 'Companion' ? 'Companion' : a.role === 'Troop' ? 'Troops' : null; }
function sectorFromDrag(dx: number, dy: number): Sector | null {
  if (dx * dx + dy * dy < 24 * 24) return null;
  return Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 'Left cut' : 'Right cut' : dy < 0 ? 'Overhead' : 'Thrust';
}
function feedback(emit: Emit, type: Parameters<Emit>[0]['type'], source: Combatant, message?: string, sector = source.sector): void {
  emit({ type, actorId: source.id, position: { ...source.position }, weapon: source.weapon, ...(sector ? { sector } : {}), ...(message ? { message } : {}) });
}

/** Physics objects and query scratch live here; action, AI, and random state live in GameState. */
export class CombatSystem {
  private world: World | null = null;
  private controller: KinematicCharacterController | null = null;
  private readonly bodies = new Map<string, { body: RigidBody; collider: Collider }>();
  private readonly colliderActors = new Map<number, Combatant>();
  private readonly byId = new Map<string, Combatant>();
  private readonly navigation = new Navigation();
  private readonly intent: Vec2 = { x: 0, z: 0 };
  private readonly destination: Vec2 = { x: 0, z: 0 };
  private readonly formation: Vec2 = { x: 0, z: 0 };
  private readonly motion = { x: 0, y: 0, z: 0 };
  private readonly translation = { x: 0, y: CAPSULE_CENTER_Y, z: 0 };
  private readonly pathStart = { x: 0, y: 0, z: 0 };
  private readonly pathEnd = { x: 0, y: 0, z: 0 };
  private readonly pathDelta = { x: 0, y: 0, z: 0 };
  private readonly blade = new RAPIER.Ball(0.16);

  setup(state: GameState, location: 'Bridge' | 'Settlement center'): void {
    const bridge = location === 'Bridge';
    const members: Combatant[] = [];
    let troop = 0;
    for (const member of state.campaign.members) {
      if (!member.available || member.health <= 0) continue;
      const position = member.role === 'Player' ? { x: 0, z: bridge ? 7 : 14 }
        : member.role === 'Companion' ? { x: 1.3, z: bridge ? 7.8 : 15 }
          : { x: -1.65 + troop++ * 1.1, z: bridge ? 9.2 : 16.2 };
      members.push(actor(member.id, member.name, member.role, position, member.health));
    }
    members.push(actor(ENEMY_AGENT.id, ENEMY_AGENT.name, 'Enemy Agent', { x: 0, z: bridge ? -7 : 8 }));
    for (let i = 0; i < 5; i++) {
      members.push(actor(`bandit-${i + 1}`, `Bandit ${i + 1}`, 'Bandit', {
        x: (i - 2) * 1.35, z: bridge ? -9 - (i % 2) * 1.2 : 9.5 - (i % 2) * 1.2,
      }));
    }
    for (let i = 0; i < 5; i++) {
      members.push(actor(`resident-${i + 1}`, `Resident ${i + 1}`, 'Resident', {
        x: (i - 2) * 1.4, z: bridge ? 12 + (i % 2) * 1.2 : 18 + (i % 2) * 1.2,
      }, 100, i < 2));
    }
    this.deploy(state, members);
  }

  setupArena(state: GameState): void {
    const team = state.arena?.mode === 'Team';
    const members = [actor('player', 'Player', 'Player', { x: 0, z: team ? 19 : 18 })];
    if (team) {
      members.push(actor('companion', 'Ivo', 'Companion', { x: 1.3, z: 20 }));
      CANDIDATES.forEach((candidate, index) => {
        members.push(actor(candidate.id, candidate.name, 'Troop', { x: -1.65 + index * 1.1, z: 21 }));
      });
    }
    members.push(actor(ENEMY_AGENT.id, 'Arena opponent', 'Enemy Agent', { x: 0, z: team ? 11 : 12 }));
    if (team) for (let index = 0; index < 5; index++) {
      members.push(actor(`bandit-${index + 1}`, `Opponent ${index + 1}`, 'Bandit', { x: (index - 2) * 1.35, z: 9.5 - (index % 2) * 1.2 }));
    }
    this.deploy(state, members);
  }

  private deploy(state: GameState, members: Combatant[]): void {
    state.combatants = members;
    state.groups.Companion = { order: 'Follow', marker: null, target: null };
    state.groups.Troops = { order: 'Follow', marker: null, target: null };
    state.selectedGroup = 'Companion';
    state.placingHold = false;
    state.invalidMarker = null;
    state.pointer = null;
    state.move.x = 0;
    state.move.z = 0;
    state.facing = Math.PI;
    state.battleTime = 0;
    const player = members.find(value => value.role === 'Player');
    if (player && !state.arena) state.campaign.position = { ...player.position };
    this.createWorld(state);
  }

  rebuild(state: GameState): void {
    if (state.phase === 'Settlement') {
      state.combatants = [];
      let index = 0;
      for (const member of state.campaign.members) {
        if (member.role !== 'Player' && (!member.available || member.health <= 0)) continue;
        const point = member.role === 'Player' ? { ...state.campaign.position }
          : { x: state.campaign.position.x + (++index % 2 ? 1 : -1), z: state.campaign.position.z + Math.ceil(index / 2) };
        if (!traversable(point) && member.role !== 'Player') {
          point.x = 0;
          point.z = 14 + index;
        }
        state.combatants.push(actor(member.id, member.name, member.role, point, member.health));
      }
      state.pointer = null;
      state.move.x = 0;
      state.move.z = 0;
    }
    this.createWorld(state);
  }

  command(state: GameState, command: Command, emit: Emit): boolean {
    if (!['move', 'pointer', 'guard-mode', 'select-group', 'order', 'hold-point'].includes(command.type)) return false;
    const invalid = (message: string): true => { emit({ type: 'invalid', message }); return true; };
    if (state.paused || state.transition || state.boundary === 'Load failed'
      || state.phase !== 'Settlement' && state.phase !== 'Setup' && state.phase !== 'Battle') return invalid('This action is unavailable now.');
    const player = state.combatants.find(value => value.role === 'Player');
    if (command.type === 'move') {
      if (!player || state.phase !== 'Settlement' && !active(player)) return invalid('The player character cannot move.');
      if (![command.direction.x, command.direction.z, command.facing].every(Number.isFinite)) return invalid('Invalid movement.');
      const length = Math.max(1, Math.hypot(command.direction.x, command.direction.z));
      state.move.x = command.direction.x / length;
      state.move.z = command.direction.z / length;
      state.facing = command.facing;
      return true;
    }
    if (state.phase === 'Settlement') return invalid('Combat commands require an active defense.');
    if (command.type === 'select-group' || command.type === 'order' || command.type === 'hold-point') {
      const groupId = command.type === 'select-group' ? command.group : state.selectedGroup;
      if (groupId !== 'Companion' && groupId !== 'Troops') return invalid('Unknown Command group.');
      const spokesperson = state.combatants.find(value => active(value) && groupOf(value) === groupId);
      if (!spokesperson) return invalid('This Command group has no active members.');
      if (command.type === 'select-group') {
        state.selectedGroup = groupId;
        state.placingHold = false;
        state.invalidMarker = null;
        emit({ type: 'confirm', message: `${groupId} selected.` });
        return true;
      }
      const group = state.groups[groupId];
      if (command.type === 'hold-point') {
        if (!state.placingHold) return invalid('Select Hold before placing a marker.');
        if (!(state.arena ? arenaTraversable(command.point) : traversable(command.point))) {
          state.invalidMarker = { ...command.point };
          return invalid('Hold requires traversable ground.');
        }
        group.order = 'Hold';
        group.marker = { ...command.point };
        group.target = null;
        state.placingHold = false;
      } else {
        if (!['Follow', 'Hold', 'Engage'].includes(command.order)) return invalid('Unknown order.');
        if (command.order === 'Hold') {
          state.placingHold = true;
          state.invalidMarker = null;
          emit({ type: 'order', message: 'Place a Hold marker.' });
          return true;
        }
        group.order = command.order;
        group.marker = null;
        group.target = null;
        state.placingHold = false;
      }
      state.invalidMarker = null;
      for (const member of state.combatants) if (groupOf(member) === groupId) member.target = null;
      emit({ type: 'order', message: `${groupId}: ${group.order}` });
      feedback(emit, 'response', spokesperson);
      return true;
    }
    if (!player || !active(player)) return invalid('The player character cannot fight.');
    if (command.type === 'guard-mode') {
      if (player.action !== 'Idle' || state.pointer) return invalid('Change guard mode only while idle.');
      player.guardMode = player.guardMode === 'Directional Guard' ? 'Shield Block' : 'Directional Guard';
      emit({ type: 'confirm', message: player.guardMode });
      return true;
    }
    if (command.type !== 'pointer') return true;
    if (!Number.isFinite(command.x) || !Number.isFinite(command.y)
      || command.button !== 0 && command.button !== 2
      || command.phase !== 'down' && command.phase !== 'move' && command.phase !== 'up') return invalid('Invalid pointer action.');
    if (state.placingHold) return invalid('Place or cancel the Hold marker first.');
    if (command.phase === 'down') {
      if (player.exhausted || player.stamina <= 0) return invalid('Exhausted: recover 12 stamina first.');
      if (command.button === 0) {
        if (player.action !== 'Idle' || player.stamina + EPSILON < 12) return invalid('Attack is unavailable.');
        player.action = 'Preview';
      } else {
        if (player.action !== 'Idle' && player.action !== 'Preview' && player.action !== 'Windup') return invalid('Only a wind-up can cancel into guard.');
        if (player.action === 'Windup') feedback(emit, 'interrupted', player, 'Feint');
        player.action = player.guardMode === 'Shield Block' ? 'Shield' : 'Guard';
      }
      player.actionTime = 0;
      player.guardTime = 0;
      player.sector = null;
      player.effectiveSector = null;
      state.pointer = { button: command.button, x: command.x, y: command.y };
      return true;
    }
    const pointer = state.pointer;
    if (!pointer || pointer.button !== command.button) return invalid('No matching pointer action.');
    if (player.action === 'Preview' || player.action === 'Guard') {
      const sector = sectorFromDrag(command.x - pointer.x, command.y - pointer.y);
      if (sector && sector !== player.sector) {
        player.sector = sector;
        if (player.action === 'Guard') player.guardTime = 0;
      }
    }
    if (command.phase === 'up') {
      state.pointer = null;
      if (command.button === 0 && player.action === 'Preview') {
        if (!player.sector) {
          this.idle(player);
          emit({ type: 'cancel', message: 'Attack preview cancelled inside the dead zone.' });
        } else if (player.stamina + EPSILON < 12 || player.exhausted) {
          this.idle(player);
          return invalid('Not enough stamina to commit an attack.');
        } else this.attack(player, player.sector, emit);
      } else if (player.action === 'Guard' || player.action === 'Shield') this.idle(player);
    }
    return true;
  }

  step(state: GameState, emit: Emit): void {
    if (state.paused || state.transition || state.boundary === 'Load failed'
      || state.phase !== 'Settlement' && state.phase !== 'Setup' && state.phase !== 'Battle') return;
    if (!this.world || !this.controller) this.createWorld(state);
    const player = state.combatants.find(value => value.role === 'Player');
    if (state.phase === 'Settlement') {
      if (player) {
        player.facing = state.facing;
        this.moveActor(state, player, state.move.x, state.move.z, emit);
      }
      this.world!.step();
      if (player) this.syncPlayer(state, player);
      return;
    }
    const battle = state.phase === 'Battle';
    if (battle) state.battleTime += DT;
    this.retargetGroups(state);
    let raiderCommitments = 0;
    for (const value of state.combatants) if (active(value) && value.team === 'Raiders' && committed(value)) raiderCommitments++;
    for (let index = 0; index < state.combatants.length; index++) {
      const value = state.combatants[index];
      if (!active(value)) continue;
      if (value.role === 'Player') {
        value.facing = state.facing;
        this.moveActor(state, value, state.move.x, state.move.z, emit);
      } else if (battle || value.team === 'Band') {
        const wasCommitted = committed(value);
        this.think(state, value, index, battle, raiderCommitments, emit);
        if (!wasCommitted && committed(value) && value.team === 'Raiders') raiderCommitments++;
      }
    }
    this.world!.step();
    if (player) this.syncPlayer(state, player);
    // A single stable action pass makes casualty removal immediate and group retargeting next-tick.
    for (const value of state.combatants) {
      if (active(value)) this.advanceAction(state, value, battle, emit);
    }
  }

  private createWorld(state: GameState): void {
    this.dispose();
    this.world = new RAPIER.World(ZERO);
    this.world.timestep = DT;
    this.controller = this.world.createCharacterController(CONTROLLER_SKIN);
    this.controller.setSlideEnabled(true);
    this.controller.disableAutostep();
    this.controller.disableSnapToGround();
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(30, 0.1, 30).setTranslation(0, -0.1, 0));
    for (const obstacle of state.arena ? [] : SOLID_OBSTACLES) {
      this.world.createCollider(RAPIER.ColliderDesc.cuboid((obstacle.maxX - obstacle.minX) / 2, 3, (obstacle.maxZ - obstacle.minZ) / 2)
        .setTranslation((obstacle.maxX + obstacle.minX) / 2, 3, (obstacle.maxZ + obstacle.minZ) / 2));
    }
    const bounds = state.arena ? ARENA_BOUNDS : SETTLEMENT_BOUNDS;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    for (const x of [bounds.minX - 0.5, bounds.maxX + 0.5]) {
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 3, (bounds.maxZ - bounds.minZ) / 2 + 1).setTranslation(x, 3, centerZ));
    }
    for (const z of [bounds.minZ - 0.5, bounds.maxZ + 0.5]) {
      this.world.createCollider(RAPIER.ColliderDesc.cuboid((bounds.maxX - bounds.minX) / 2 + 1, 3, 0.5).setTranslation(centerX, 3, z));
    }
    for (const value of state.combatants) {
      this.byId.set(value.id, value);
      if (!active(value) && !(state.phase === 'Settlement' && value.role === 'Player')) continue;
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(value.position.x, CAPSULE_CENTER_Y, value.position.z));
      const collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, ACTOR_RADIUS), body);
      this.bodies.set(value.id, { body, collider });
      this.colliderActors.set(collider.handle, value);
    }
    // Populate Rapier's broad phase before the first movement query; no gameplay time advances.
    this.world.step();
  }

  private syncPlayer(state: GameState, player: Combatant): void {
    if (state.arena) return;
    state.campaign.position.x = player.position.x;
    state.campaign.position.z = player.position.z;
  }

  private moveActor(state: GameState, value: Combatant, x: number, z: number, emit: Emit): void {
    const physics = this.bodies.get(value.id);
    if (!physics || !this.controller || !this.world) return;
    const multiplier = value.action === 'Preview' || value.action === 'Guard' || value.action === 'Shield' ? 0.75
      : value.action === 'Windup' ? 0.8 : value.action === 'Active' || value.action === 'Recovery' ? 0.65 : 1;
    const scale = value.speed * multiplier * DT / Math.max(1, Math.hypot(x, z));
    this.motion.x = x * scale;
    this.motion.z = z * scale;
    this.motion.y = 0;
    this.controller.computeColliderMovement(physics.collider, this.motion);
    const movement = this.controller.computedMovement();
    this.translation.x = value.position.x + movement.x;
    this.translation.z = value.position.z + movement.z;
    physics.body.setTranslation(this.translation, true);
    physics.body.setNextKinematicTranslation(this.translation);
    this.world.propagateModifiedBodyPositionsToColliders();
    const position = physics.body.translation();
    const moved = (position.x - value.position.x) ** 2 + (position.z - value.position.z) ** 2;
    value.position.x = position.x;
    value.position.z = position.z;
    if (moved > 0.00001 && state.tick % 27 === 0) feedback(emit, 'footstep', value);
  }

  private retargetGroups(state: GameState): void {
    for (const id of GROUP_IDS) {
      const group = state.groups[id];
      if (group.order !== 'Engage') { group.target = null; continue; }
      const current = group.target ? this.byId.get(group.target) : undefined;
      if (current && active(current)) continue;
      let count = 0;
      this.formation.x = 0;
      this.formation.z = 0;
      for (const value of state.combatants) {
        if (active(value) && groupOf(value) === id) {
          this.formation.x += value.position.x;
          this.formation.z += value.position.z;
          count++;
        }
      }
      if (!count) { group.target = null; continue; }
      this.formation.x /= count;
      this.formation.z /= count;
      let target: Combatant | null = null;
      let nearest = Infinity;
      for (const value of state.combatants) {
        const distance = distanceSquared(this.formation, value.position);
        if (active(value) && value.team === 'Raiders' && distance < nearest) { target = value; nearest = distance; }
      }
      group.target = target?.id ?? null;
    }
  }

  private nearest(state: GameState, value: Combatant, center = value.position, radius = Infinity): Combatant | null {
    let target: Combatant | null = null;
    let nearest = radius * radius;
    for (const other of state.combatants) {
      if (!active(other) || !enemies(value, other)) continue;
      const distance = distanceSquared(center, other.position);
      if (distance < nearest) { target = other; nearest = distance; }
    }
    return target;
  }

  private formationPoint(state: GameState, value: Combatant, anchor: Vec2, facing: number): void {
    let slot = 0;
    let count = 0;
    if (value.role === 'Troop') {
      for (const other of state.combatants) {
        if (other.role !== 'Troop' || !active(other)) continue;
        if (other.id === value.id) slot = count;
        count++;
      }
    }
    const side = value.role === 'Companion' ? 1.15 : (slot - (count - 1) / 2) * 0.95;
    const back = value.role === 'Companion' ? -0.65 : -1.7;
    this.formation.x = anchor.x + Math.cos(facing) * side + Math.sin(facing) * back;
    this.formation.z = anchor.z - Math.sin(facing) * side + Math.cos(facing) * back;
    if (!(state.arena ? arenaTraversable(this.formation) : traversable(this.formation))) {
      this.formation.x = anchor.x;
      this.formation.z = anchor.z;
    }
  }

  private think(state: GameState, value: Combatant, index: number, battle: boolean, raiderCommitments: number, emit: Emit): void {
    let target: Combatant | null = null;
    let fleeing = false;
    const player = this.byId.get('player');
    const groupId = groupOf(value);
    this.destination.x = value.position.x;
    this.destination.z = value.position.z;
    if (groupId) {
      const group = state.groups[groupId];
      const anchor = group.order === 'Hold' && group.marker ? group.marker : player?.position ?? value.position;
      this.formationPoint(state, value, anchor, player?.facing ?? Math.PI);
      this.destination.x = this.formation.x;
      this.destination.z = this.formation.z;
      if (battle) {
        if (group.order === 'Engage') target = group.target ? this.byId.get(group.target) ?? null : null;
        else target = this.nearest(state, value, anchor, group.order === 'Hold' ? 2.7 : 3.3);
        if (target && active(target)) {
          if (group.order === 'Engage') {
            const facing = Math.atan2(target.position.x - value.position.x, target.position.z - value.position.z);
            this.formationPoint(state, value, target.position, facing);
            const engagementRadius = WEAPONS[value.weapon][SECTORS[value.attackId % SECTORS.length]].reach - 0.3;
            const offsetX = this.formation.x - target.position.x;
            const offsetZ = this.formation.z - target.position.z;
            const formationRadius = Math.hypot(offsetX, offsetZ);
            if (formationRadius > engagementRadius) {
              this.formation.x = target.position.x + offsetX * engagementRadius / formationRadius;
              this.formation.z = target.position.z + offsetZ * engagementRadius / formationRadius;
            }
            this.destination.x = this.formation.x;
            this.destination.z = this.formation.z;
          } else {
            // Defenders never pursue beyond their player's or Hold marker's local radius.
            this.destination.x = target.position.x;
            this.destination.z = target.position.z;
          }
        }
      }
    } else if (value.role === 'Resident') {
      fleeing = !value.armed || value.health <= 20;
      if (fleeing) {
        // Safe staging positions remain inside the objective and reachable by raiders.
        const slot = value.id.charCodeAt(value.id.length - 1) - 49;
        this.destination.x = (slot - 2) * 1.5;
        this.destination.z = 24.4;
        const threat = this.nearest(state, value, value.position, 4);
        if (threat && distanceSquared(value.position, this.destination) < 2) {
          this.destination.x = Math.max(-8.7, Math.min(8.7, value.position.x + (value.position.x >= threat.position.x ? 3 : -3)));
          this.destination.z = Math.max(16, Math.min(24.8, value.position.z + (value.position.z >= threat.position.z ? 2 : -2)));
        }
      } else {
        target = this.nearest(state, value, value.position, 6);
        if (target) { this.destination.x = target.position.x; this.destination.z = target.position.z; }
      }
    } else {
      target = this.raiderTarget(state, value, player);
      if (target) { this.destination.x = target.position.x; this.destination.z = target.position.z; }
    }
    if (target && !active(target)) target = null;
    value.target = target?.id ?? null;
    const sector = SECTORS[value.attackId % SECTORS.length];
    const reach = WEAPONS[value.weapon][sector].reach;
    const inReach = target !== null && distanceSquared(value.position, target.position) <= (reach - 0.12) ** 2;
    if (fleeing && (value.action === 'Guard' || value.action === 'Windup')) {
      if (value.action === 'Windup') feedback(emit, 'interrupted', value);
      this.idle(value);
    }
    if (target && !committed(value)) value.facing = Math.atan2(target.position.x - value.position.x, target.position.z - value.position.z);
    if (battle && target && inReach && !fleeing && value.cooldown <= EPSILON && value.stamina + EPSILON >= 12 && !value.exhausted
      && (value.action === 'Idle' || value.action === 'Guard') && (value.team !== 'Raiders' || raiderCommitments < 2)) {
      this.attack(value, sector, emit);
    } else if (battle && value.team === 'Raiders' && target && !committed(value)
      && value.action !== 'Recovery' && value.action !== 'Stagger' && !value.exhausted) {
      if (inReach && (target.action === 'Windup' || target.action === 'Active') && target.sector) {
        if (value.action !== 'Guard') { value.action = 'Guard'; value.actionTime = 0; value.effectiveSector = null; value.guardTime = 0; }
        if (value.sector !== target.sector) { value.sector = target.sector; value.guardTime = 0; }
      } else if (value.action === 'Guard') this.idle(value);
      if (inReach && value.action === 'Idle') {
        const angle = Math.atan2(value.position.x - target.position.x, value.position.z - target.position.z) + (index % 2 ? 0.5 : -0.5);
        this.destination.x = target.position.x + Math.sin(angle) * (reach + 0.1);
        this.destination.z = target.position.z + Math.cos(angle) * (reach + 0.1);
      }
    }
    if (state.arena) {
      this.destination.x = Math.max(ARENA_BOUNDS.minX + NAV_CLEARANCE, Math.min(ARENA_BOUNDS.maxX - NAV_CLEARANCE, this.destination.x));
      this.destination.z = Math.max(ARENA_BOUNDS.minZ + NAV_CLEARANCE, Math.min(ARENA_BOUNDS.maxZ - NAV_CLEARANCE, this.destination.z));
    }
    if (inReach && (committed(value) || value.action === 'Recovery' || value.action === 'Guard')) {
      this.intent.x = 0;
      this.intent.z = 0;
    } else if (!this.navigation.steer(value.position, this.destination, this.intent)) {
      this.intent.x = 0;
      this.intent.z = 0;
    }
    // Deterministic local separation prevents formation members deadlocking at the bridge mouth.
    if (!committed(value)) {
      for (const other of state.combatants) {
        if (other === value || !active(other)) continue;
        const dx = value.position.x - other.position.x;
        const dz = value.position.z - other.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 0 && distance < 0.90) {
          const weight = (0.90 - distance) * 2;
          this.intent.x += dx / distance * weight;
          this.intent.z += dz / distance * weight;
        }
      }
    }
    if (!target && this.intent.x * this.intent.x + this.intent.z * this.intent.z > 0.01) value.facing = Math.atan2(this.intent.x, this.intent.z);
    this.moveActor(state, value, this.intent.x, this.intent.z, emit);
  }

  private raiderTarget(state: GameState, value: Combatant, player: Combatant | undefined): Combatant | null {
    if (value.role !== 'Enemy Agent') return this.nearest(state, value);
    // For two seconds in each twelve-second coordination window, cover a threatened cluster
    // or the single escape route; otherwise keep primary pressure on the player.
    if (state.battleTime % 12 < 2) {
      for (const bandit of state.combatants) {
        if (bandit.role !== 'Bandit' || !active(bandit)) continue;
        let cluster = 0;
        for (const ally of state.combatants) {
          if (ally.role === 'Bandit' && active(ally) && distanceSquared(ally.position, bandit.position) < 16) cluster++;
        }
        if (cluster >= 2) {
          const threat = this.nearest(state, value, bandit.position, 3);
          if (threat) return threat;
        }
      }
      const routeThreat = this.nearest(state, value, ESCAPE_ROUTE, 2.5);
      if (routeThreat) return routeThreat;
    }
    return player && active(player) ? player : this.nearest(state, value);
  }

  private attack(value: Combatant, sector: Sector, emit: Emit): void {
    value.action = 'Windup';
    value.actionTime = 0;
    value.sector = sector;
    value.effectiveSector = null;
    value.hitIds.length = 0;
    value.attackId++;
    value.stamina = Math.max(0, value.stamina - 12);
    if (value.stamina < EPSILON) { value.stamina = 0; value.exhausted = true; }
    value.spendTime = 0;
    const damage = WEAPONS[value.weapon][sector].damage;
    // Fixed weapon damage / start-to-start cadence gives the governed baseline Engage DPS.
    value.cooldown = value.team === 'Raiders' ? 2.1 : value.role === 'Companion' ? damage / 5
      : value.role === 'Troop' ? damage / 8 : value.role === 'Resident' ? damage / 4 : 0;
    feedback(emit, 'attack', value);
  }

  private advanceAction(state: GameState, value: Combatant, damageAllowed: boolean, emit: Emit): void {
    value.cooldown = Math.max(0, value.cooldown - DT);
    const guarding = value.action === 'Guard' || value.action === 'Shield';
    if (guarding) {
      value.stamina = Math.max(0, value.stamina - (value.action === 'Shield' ? 18 : 6) * DT);
      value.spendTime = 0;
      if (value.stamina < EPSILON) {
        value.stamina = 0;
        value.exhausted = true;
        if (value.action === 'Shield') this.stagger(value, 0.4, false);
        else this.idle(value);
        if (value.role === 'Player') state.pointer = null;
        feedback(emit, 'interrupted', value, 'Exhausted');
        return;
      }
    } else {
      const previous = value.spendTime;
      value.spendTime += DT;
      const regenerating = Math.max(0, value.spendTime - 1.2) - Math.max(0, previous - 1.2);
      if (regenerating > 0) value.stamina = Math.min(100, value.stamina + regenerating * (value.role === 'Player' && !state.arena && state.campaign.feat === 'Rapid Stamina' ? 30 : 25));
      if (value.exhausted && value.stamina + EPSILON >= 12) value.exhausted = false;
    }
    const previousTime = value.actionTime;
    value.actionTime += DT;
    if (value.action === 'Guard' || value.action === 'Shield') {
      value.guardTime += DT;
      const multiplier = value.role === 'Player' && !state.arena && state.campaign.feat === 'Rapid Guard' ? 0.8 : 1;
      if (value.action === 'Guard' && value.sector && value.effectiveSector !== value.sector && value.guardTime + EPSILON >= 0.25 * multiplier) {
        value.effectiveSector = value.sector;
        feedback(emit, 'guard', value);
      } else if (value.action === 'Shield' && previousTime + EPSILON < 0.20 * multiplier && value.actionTime + EPSILON >= 0.20 * multiplier) {
        feedback(emit, 'guard', value, 'Shield Block');
      }
      return;
    }
    if (value.action === 'Stagger') {
      // guardTime holds the authored stagger duration outside Guard/Shield; a retained
      // effectiveSector means recoil must still complete the committed attack's recovery.
      if (value.actionTime + EPSILON >= value.guardTime) {
        if (value.effectiveSector) { value.action = 'Recovery'; value.actionTime = 0; value.effectiveSector = null; }
        else this.idle(value);
      }
      return;
    }
    if (!value.sector) return;
    const stats = WEAPONS[value.weapon][value.sector];
    const multiplier = value.role === 'Player' && !state.arena && state.campaign.feat === 'Rapid Attack' ? 0.8 : 1;
    if (value.action === 'Windup') {
      const windup = value.team === 'Raiders' ? 0.8 : stats.windup * multiplier;
      if (value.actionTime + EPSILON >= windup) { value.action = 'Active'; value.actionTime = 0; }
    } else if (value.action === 'Active') {
      if (damageAllowed) this.sweep(state, value, previousTime / ACTIVE_TIME, Math.min(1, value.actionTime / ACTIVE_TIME), emit);
      if (value.action === 'Active' && value.actionTime + EPSILON >= ACTIVE_TIME) {
        if (!value.hitIds.length) feedback(emit, 'miss', value);
        value.action = 'Recovery';
        value.actionTime = 0;
      }
    } else if (value.action === 'Recovery' && value.actionTime + EPSILON >= stats.recovery * multiplier) this.idle(value);
  }

  private idle(value: Combatant): void {
    value.action = 'Idle';
    value.actionTime = 0;
    value.sector = null;
    value.effectiveSector = null;
    value.guardTime = 0;
  }

  private stagger(value: Combatant, duration: number, recover: boolean): void {
    value.effectiveSector = recover ? value.sector : null;
    value.action = 'Stagger';
    value.actionTime = 0;
    value.guardTime = duration;
  }

  private pathPoint(value: Combatant, progress: number, bladeFraction: number, out: typeof this.pathStart): void {
    const sector = value.sector!;
    const reach = WEAPONS[value.weapon][sector].reach;
    let side = 0;
    let forward: number;
    let height = 1.05;
    if (sector === 'Left cut' || sector === 'Right cut') {
      const angle = (progress * 2 - 1) * 1.2 * (sector === 'Left cut' ? 1 : -1);
      side = Math.sin(angle) * reach * bladeFraction;
      forward = Math.cos(angle) * reach * bladeFraction;
    } else if (sector === 'Overhead') {
      forward = (0.5 + Math.sin(progress * Math.PI / 2) * (reach - 0.5)) * bladeFraction;
      height = 1.1 + Math.cos(progress * Math.PI) * bladeFraction * 0.85;
    } else {
      forward = (0.5 + Math.sin(progress * Math.PI / 2) * (reach - 0.5)) * bladeFraction;
    }
    out.x = value.position.x + Math.sin(value.facing) * forward + Math.cos(value.facing) * side;
    out.z = value.position.z + Math.cos(value.facing) * forward - Math.sin(value.facing) * side;
    out.y = height;
  }

  private sweep(state: GameState, attacker: Combatant, from: number, to: number, emit: Emit): void {
    const stats = WEAPONS[attacker.weapon][attacker.sector!];
    for (const target of state.combatants) {
      if (!active(target) || !enemies(attacker, target) || attacker.hitIds.includes(target.id)
        || distanceSquared(attacker.position, target.position) > (stats.reach + ACTOR_RADIUS + 0.2) ** 2) continue;
      const collider = this.bodies.get(target.id)?.collider;
      if (!collider) continue;
      let contact = false;
      // Sample along the entire blade, sweeping each sample continuously through this
      // tick's authored arc with Rapier shape casts, not range-based health subtraction.
      for (let sample = 1; sample <= 7 && !contact; sample++) {
        this.pathPoint(attacker, from, sample / 7, this.pathStart);
        this.pathPoint(attacker, to, sample / 7, this.pathEnd);
        this.pathDelta.x = this.pathEnd.x - this.pathStart.x;
        this.pathDelta.y = this.pathEnd.y - this.pathStart.y;
        this.pathDelta.z = this.pathEnd.z - this.pathStart.z;
        contact = collider.intersectsShape(this.blade, this.pathStart, IDENTITY)
          || collider.castShape(ZERO, this.blade, this.pathStart, IDENTITY, this.pathDelta, 0, 1, true) !== null;
      }
      if (!contact || !this.unobstructed(attacker, target)) continue;
      attacker.hitIds.push(target.id);
      const shieldRaise = target.role === 'Player' && !state.arena && state.campaign.feat === 'Rapid Guard' ? 0.16 : 0.20;
      if (target.action === 'Shield' && target.actionTime + EPSILON >= shieldRaise && !target.exhausted) {
        feedback(emit, 'block', target, 'Shield Block', attacker.sector);
        continue;
      }
      if (target.action === 'Guard' && target.effectiveSector === attacker.sector && !target.exhausted) {
        feedback(emit, 'block', target, 'Directional Guard', attacker.sector);
        feedback(emit, 'interrupted', attacker, 'Guard recoil');
        this.stagger(attacker, 0.3, true);
        break;
      }
      this.damage(state, attacker, target, attacker.team === 'Raiders' ? 12 : stats.damage, stats.reaction, emit);
    }
  }

  private unobstructed(attacker: Combatant, target: Combatant): boolean {
    const dx = target.position.x - attacker.position.x;
    const dz = target.position.z - attacker.position.z;
    const ray = new RAPIER.Ray({ x: attacker.position.x, y: 1, z: attacker.position.z }, { x: dx, y: 0, z: dz });
    return this.world!.castRay(ray, 1, true, undefined, undefined, undefined, undefined,
      collider => !this.colliderActors.has(collider.handle)) === null;
  }

  private damage(state: GameState, attacker: Combatant, target: Combatant, damage: number, reaction: number, emit: Emit): void {
    if (!active(target)) return;
    target.health = Math.max(0, target.health - damage);
    feedback(emit, 'hit', attacker);
    feedback(emit, 'struck', target, undefined, attacker.sector);
    const member = state.arena ? undefined : state.campaign.members.find(value => value.id === target.id);
    if (member) member.health = target.health;
    if (target.health > 0) {
      // Input cannot cancel an active attack. Ordinary hit reactions likewise preserve
      // its Active/Recovery commitment; a struck wind-up is interrupted without refund.
      if (target.action !== 'Active' && target.action !== 'Recovery') {
        if (target.action === 'Windup') feedback(emit, 'interrupted', target);
        this.stagger(target, reaction, false);
        if (target.role === 'Player') state.pointer = null;
      }
      return;
    }
    if (target.role === 'Troop' || target.role === 'Bandit') {
      const random = state.arena ?? state.campaign;
      random.randomState = (Math.imul(random.randomState, 1664525) + 1013904223) >>> 0;
      target.status = random.randomState / 4294967296 < 0.20 ? 'Downed' : 'Killed';
    } else target.status = target.role === 'Resident' ? 'Killed' : 'Downed';
    target.target = null;
    this.idle(target);
    const physics = this.bodies.get(target.id);
    if (physics) {
      this.colliderActors.delete(physics.collider.handle);
      this.world!.removeRigidBody(physics.body);
      this.bodies.delete(target.id);
    }
    // Both casualty results remain the same unavailable roster entry until resolution.
    if (member) member.available = false;
    for (const other of state.combatants) if (other.target === target.id) other.target = null;
    for (const id of GROUP_IDS) if (state.groups[id].target === target.id) state.groups[id].target = null;
    if (target.role === 'Player') { state.pointer = null; state.move.x = 0; state.move.z = 0; }
    feedback(emit, target.status === 'Downed' ? 'downed' : 'killed', target);
  }

  dispose(): void {
    this.world?.free();
    this.world = null;
    this.controller = null;
    this.bodies.clear();
    this.colliderActors.clear();
    this.byId.clear();
  }
}
