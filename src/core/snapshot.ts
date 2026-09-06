import { AGENTS, CANDIDATES, FEATS, LOADOUTS, WORLD } from '../content/catalog';
import { traversable } from './navigation';
import type { Agent, Campaign, Disposition, FateChoice, Feat, Grievance, Member, Snapshot, Vec2 } from './types';

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid campaign snapshot: ${message}`);
}

function record(value: unknown, fields: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'expected a plain object');
  const prototype = Object.getPrototypeOf(value);
  requireValue(prototype === Object.prototype || prototype === null, 'non-plain object');
  const keys = Reflect.ownKeys(value);
  requireValue(keys.every(key => typeof key === 'string' && (fields.includes(key) || optional.includes(key))), 'unexpected field');
  requireValue(fields.every(key => Object.hasOwn(value, key)), 'missing field');
  requireValue(keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor && descriptor.enumerable;
  }), 'accessors and hidden fields are not snapshot data');
  return value as Record<string, unknown>;
}

function list(value: unknown, maximum: number): unknown[] {
  requireValue(Array.isArray(value) && value.length <= maximum, 'invalid list');
  requireValue(Object.getPrototypeOf(value) === Array.prototype, 'non-plain list');
  const keys = Reflect.ownKeys(value);
  requireValue(keys.length === value.length + 1 && keys.every(key => key === 'length' || (typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length)), 'sparse or extended list');
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    requireValue(descriptor && 'value' in descriptor && descriptor.enumerable, 'invalid list element');
  }
  return value;
}

function number(value: unknown, minimum: number, maximum: number, integer = false): number {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum && (!integer || Number.isSafeInteger(value)), 'number outside its valid range');
  return value;
}

function oneOf<const T extends readonly string[]>(value: unknown, choices: T): T[number] {
  requireValue(typeof value === 'string' && choices.includes(value), 'unknown value');
  return value as T[number];
}

function point(value: unknown): Vec2 {
  const source = record(value, ['x', 'z']);
  return { x: number(source.x, -WORLD.overworldLimit, WORLD.overworldLimit), z: number(source.z, -WORLD.overworldLimit, WORLD.overworldLimit) };
}

function member(value: unknown): Member {
  const source = record(value, ['id', 'name', 'role', 'health', 'available', 'weapon', 'shield']);
  const role = oneOf(source.role, ['Player', 'Companion', 'Troop']);
  const candidate = CANDIDATES.find(item => item.id === source.id);
  const identity = role === 'Player' ? { id: 'player', name: 'Player' } : role === 'Companion' ? { id: 'companion', name: 'Ivo' } : candidate;
  requireValue(identity && source.id === identity.id && source.name === identity.name, 'unknown Band identity');
  const loadout = LOADOUTS[role];
  requireValue(source.weapon === loadout.weapon && source.shield === loadout.shield, 'invalid fixed equipment');
  const health = number(source.health, 0, loadout.health);
  requireValue(typeof source.available === 'boolean' && source.available === (health > 0), 'health and availability disagree');
  return { id: identity.id, name: identity.name, role, health, available: source.available, weapon: loadout.weapon, shield: loadout.shield };
}

function agent(value: unknown): Agent {
  const source = record(value, ['id', 'name', 'fate', 'grievances'], ['disposition']);
  const identity = AGENTS.find(item => item.id === source.id);
  requireValue(identity && source.name === identity.name, 'unknown Agent identity');
  const fate = oneOf(source.fate, ['Active', 'Captive', 'Executed']);
  const grievances = list(source.grievances, 3).map(item => oneOf(item, ['Agent captured', 'Agent executed', 'Settlement harmed']));
  requireValue(new Set(grievances).size === grievances.length, 'duplicate Grievance');
  const result: Agent = { id: identity.id, name: identity.name, fate, grievances };
  if (fate === 'Active') result.disposition = oneOf(source.disposition, ['Friendly', 'Neutral', 'Hostile']);
  else requireValue(!Object.hasOwn(source, 'disposition'), 'a non-Active Agent has no Disposition');
  return result;
}

function relationship(value: Agent, fate: Agent['fate'], disposition: Disposition | undefined, grievances: readonly Grievance[]): void {
  requireValue(value.fate === fate && value.disposition === disposition && value.grievances.length === grievances.length && grievances.every(item => value.grievances.includes(item)), `impossible relationship for ${value.id}`);
}

/** Validate and copy only the current, complete, save-safe campaign schema. */
export function validateSnapshot(value: unknown): Snapshot {
  const root = record(value, ['version', 'campaign']);
  requireValue(root.version === 1, 'unsupported schema version');
  const source = record(root.campaign, [
    'scene', 'position', 'time', 'coin', 'provisions', 'provisionRemainder', 'members', 'agents', 'contract', 'deadline',
    'raidLocation', 'condition', 'captives', 'enemyChoice', 'banditChoice', 'banditDowned', 'banditKilled', 'feat', 'randomState', 'casualties',
  ]);
  const casualtySource = record(source.casualties, ['band', 'residents']);
  const members = list(source.members, 6).map(member);
  const agents = list(source.agents, 3).map(agent);
  requireValue(members.length >= 2 && members[0]?.id === 'player' && members[1]?.id === 'companion' && new Set(members.map(item => item.id)).size === members.length, 'invalid Band roster');
  requireValue(agents.length === 3 && new Set(agents.map(item => item.id)).size === 3, 'invalid Agent roster');
  const band: string[] = list(casualtySource.band, 6).map(item => oneOf(item, ['player', 'companion', ...CANDIDATES.map(candidate => candidate.id)]));
  requireValue(new Set(band).size === band.length, 'duplicate Band casualty');
  const choice = (item: unknown): FateChoice | null => item === null ? null : oneOf(item, ['Release', 'Capture', 'Execute']);
  const campaign: Campaign = {
    scene: oneOf(source.scene, ['overworld', 'settlement']),
    position: point(source.position),
    time: number(source.time, 8, Number.MAX_SAFE_INTEGER),
    coin: number(source.coin, 0, 100, true),
    provisions: number(source.provisions, 0, 10),
    provisionRemainder: number(source.provisionRemainder, 0, 0.5),
    members, agents,
    contract: oneOf(source.contract, ['Available', 'Accepted', 'Resolved', 'Failed']),
    deadline: source.deadline === null ? null : number(source.deadline, 32, Number.MAX_SAFE_INTEGER),
    raidLocation: source.raidLocation === null ? null : oneOf(source.raidLocation, ['Bridge', 'Settlement center']),
    condition: source.condition === null ? null : oneOf(source.condition, ['Safe', 'Damaged']),
    captives: number(source.captives, 0, 6, true),
    enemyChoice: choice(source.enemyChoice),
    banditChoice: choice(source.banditChoice),
    banditDowned: number(source.banditDowned, 0, 5, true),
    banditKilled: number(source.banditKilled, 0, 5, true),
    feat: source.feat === null ? null : oneOf(source.feat, FEATS) as Feat,
    randomState: number(source.randomState, 0, 0xffffffff, true),
    casualties: { band, residents: number(casualtySource.residents, 0, 5, true) },
  };
  requireValue(campaign.provisionRemainder < 0.5 && Math.abs(campaign.provisions * 10 - Math.round(campaign.provisions * 10)) < 1e-8, 'invalid Provisions precision or remainder');
  if (campaign.scene === 'settlement') {
    requireValue(traversable(campaign.position), 'position is outside traversable settlement ground');
    requireValue(campaign.time >= 20, 'settlement reached before minimum travel time');
  } else {
    requireValue(Math.hypot(campaign.position.x, campaign.position.z) >= WORLD.entryRadius - 1e-10, 'Overworld position lies inside settlement entry');
  }
  const giver = agents.find(item => item.id === 'giver')!;
  const resident = agents.find(item => item.id === 'resident-agent')!;
  const enemy = agents.find(item => item.id === 'enemy')!;
  const final = campaign.contract === 'Resolved' || campaign.contract === 'Failed';
  const killedTroops = band.filter(id => id.startsWith('troop-') && !members.some(item => item.id === id));
  const recruited = members.filter(item => item.role === 'Troop').length + killedTroops.length;
  requireValue(recruited <= 4 && campaign.coin === 100 - 25 * recruited, 'Coin does not match confirmed recruitment');
  requireValue(campaign.banditDowned + campaign.banditKilled <= 5, 'too many ordinary-bandit results');
  if (campaign.contract === 'Available') requireValue(campaign.deadline === null, 'Available Local Contract has a Raid deadline');
  else requireValue(campaign.deadline !== null && campaign.time >= campaign.deadline - 12, 'invalid acceptance time or Raid deadline');
  if (!final) {
    requireValue(campaign.raidLocation === null && campaign.condition === null && campaign.enemyChoice === null && campaign.banditChoice === null && campaign.banditDowned === 0 && campaign.banditKilled === 0 && campaign.captives === 0 && campaign.feat === null && band.length === 0 && campaign.casualties.residents === 0, 'unresolved campaign contains battle results');
    requireValue(members.every(item => item.health === LOADOUTS[item.role].health && item.available), 'pre-battle Band has casualties');
    relationship(giver, 'Active', 'Neutral', []);
    relationship(resident, 'Active', 'Neutral', []);
    relationship(enemy, 'Active', 'Hostile', []);
  } else {
    requireValue(campaign.deadline !== null && campaign.time >= campaign.deadline && campaign.raidLocation !== null, 'battle result predates the Raid');
    for (const item of members) {
      if (band.includes(item.id)) {
        const restored = campaign.contract === 'Resolved' && item.role !== 'Troop';
        requireValue(item.health === (restored ? 25 : 0), 'casualty health disagrees with outcome');
      } else requireValue(item.health > 0, 'unrecorded Band casualty');
    }
    if (campaign.contract === 'Resolved') {
      requireValue(campaign.enemyChoice !== null && campaign.feat !== null && campaign.casualties.residents < 5 && members.some(item => item.available && !band.includes(item.id)), 'incomplete or impossible victory');
      requireValue(campaign.banditDowned + campaign.banditKilled === 5 && (campaign.banditDowned === 0 ? campaign.banditChoice === null : campaign.banditChoice !== null), 'incomplete survivor resolution');
      requireValue(campaign.condition === (campaign.raidLocation === 'Bridge' ? 'Safe' : 'Damaged'), 'Settlement condition disagrees with Raid location');
      const expectedCaptives = (campaign.enemyChoice === 'Capture' ? 1 : 0) + (campaign.banditChoice === 'Capture' ? campaign.banditDowned : 0);
      requireValue(campaign.captives === expectedCaptives, 'Captive count disagrees with fate choices');
      if (campaign.enemyChoice === 'Release') {
        relationship(giver, 'Active', 'Friendly', []);
        relationship(resident, 'Active', 'Neutral', []);
        relationship(enemy, 'Active', 'Neutral', []);
      } else if (campaign.enemyChoice === 'Capture') {
        relationship(giver, 'Active', 'Friendly', []);
        relationship(resident, 'Active', 'Friendly', []);
        relationship(enemy, 'Captive', undefined, ['Agent captured']);
      } else {
        relationship(giver, 'Active', 'Hostile', ['Agent executed']);
        relationship(resident, 'Active', 'Friendly', []);
        relationship(enemy, 'Executed', undefined, []);
      }
    } else {
      requireValue(campaign.condition === 'Damaged' && campaign.enemyChoice === null && campaign.banditChoice === null && campaign.captives === 0 && campaign.feat === null, 'defeat contains victory rewards or decisions');
      requireValue(campaign.casualties.residents === 5 || members.every(item => !item.available), 'defeat has no defeat condition');
      relationship(giver, 'Active', 'Hostile', ['Settlement harmed']);
      relationship(resident, 'Active', 'Hostile', ['Settlement harmed']);
      relationship(enemy, 'Active', 'Hostile', []);
    }
  }
  return { version: 1, campaign };
}
