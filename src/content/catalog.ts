import type { Feat, Member, Role, Sector, Weapon } from '../core/types';

export const CANDIDATES = Object.freeze([
  Object.freeze({ id: 'troop-1', name: 'Ada' }),
  Object.freeze({ id: 'troop-2', name: 'Bram' }),
  Object.freeze({ id: 'troop-3', name: 'Cora' }),
  Object.freeze({ id: 'troop-4', name: 'Dain' }),
]);

export const AGENTS = Object.freeze([
  Object.freeze({ id: 'giver', name: 'Mara Venn' }),
  Object.freeze({ id: 'resident-agent', name: 'Oren Reed' }),
  Object.freeze({ id: 'enemy', name: 'Aldric Vale' }),
]);

export const FEATS: readonly Feat[] = Object.freeze(['Rapid Guard', 'Rapid Attack', 'Rapid Stamina']);
export const FEAT_EFFECTS = Object.freeze({
  'Rapid Guard': 'Directional Guard changes in 0.20 seconds; Shield Block raises in 0.16 seconds.',
  'Rapid Attack': 'Player attack wind-up and recovery times are multiplied by 0.80. Damage and stamina cost are unchanged.',
  'Rapid Stamina': 'Player stamina regenerates at 30 per second after the unchanged 1.2-second delay.',
});

export const LOADOUTS: Readonly<Record<Member['role'], Readonly<{ weapon: Weapon; shield: boolean; health: number }>>> = Object.freeze({
  Player: Object.freeze({ weapon: 'Sword', shield: true, health: 100 }),
  Companion: Object.freeze({ weapon: 'Sword', shield: false, health: 100 }),
  Troop: Object.freeze({ weapon: 'Staff', shield: false, health: 70 }),
});

export const COMBATANT_VALUES: Readonly<Record<Role, Readonly<{ health: number; speed: number }>>> = Object.freeze({
  Player: Object.freeze({ health: 100, speed: 7 }),
  Companion: Object.freeze({ health: 100, speed: 3.4 }),
  Troop: Object.freeze({ health: 70, speed: 3 }),
  'Enemy Agent': Object.freeze({ health: 110, speed: 2.8 }),
  Bandit: Object.freeze({ health: 40, speed: 2.6 }),
  Resident: Object.freeze({ health: 100, speed: 2 }),
});

export const WEAPONS: Readonly<Record<Weapon, Readonly<Record<Sector, Readonly<{ damage: number; windup: number; recovery: number }>>>>> = Object.freeze({
  Sword: Object.freeze({
    Overhead: Object.freeze({ damage: 24, windup: 0.65, recovery: 0.55 }),
    'Left cut': Object.freeze({ damage: 20, windup: 0.55, recovery: 0.45 }),
    'Right cut': Object.freeze({ damage: 20, windup: 0.55, recovery: 0.45 }),
    Thrust: Object.freeze({ damage: 16, windup: 0.45, recovery: 0.60 }),
  }),
  Staff: Object.freeze({
    Overhead: Object.freeze({ damage: 20, windup: 0.75, recovery: 0.55 }),
    'Left cut': Object.freeze({ damage: 16, windup: 0.65, recovery: 0.45 }),
    'Right cut': Object.freeze({ damage: 16, windup: 0.65, recovery: 0.45 }),
    Thrust: Object.freeze({ damage: 13, windup: 0.55, recovery: 0.60 }),
  }),
});

export const WORLD = Object.freeze({
  overworldLimit: 30,
  entryRadius: 0.5,
  initialPosition: Object.freeze({ x: 0, z: 2 }),
  settlementPosition: Object.freeze({ x: 0, z: 14 }),
  exitPosition: Object.freeze({ x: 0, z: 0.5 }),
  settlementHalfWidth: 22,
  settlementHalfDepth: 26,
  riverHalfWidth: 3,
  bridgeHalfWidth: 2,
  travelSpeed: 0.1,
  hoursPerSecond: 0.8,
  setupSeconds: 15,
});

export const CONTRACT = Object.freeze({
  title: 'The Bridge at Reedford',
  objective: 'Defend Reedford and its five settlement residents. Prepare at the bridge before the Raid deadline.',
  threat: 'Aldric Vale leads five ordinary bandits. The Raid begins 12 Overworld hours after acceptance; arriving late puts the battle in the settlement center.',
  reward: 'Victory grants one Feat: Rapid Guard, Rapid Attack, or Rapid Stamina. Reward: 0 Coin and 0 Provisions.',
  risk: 'Defeat leaves the settlement Damaged and may cost Band members and residents their lives. A late victory also leaves the settlement Damaged.',
});

export const REACTIONS = Object.freeze({
  Available: Object.freeze({
    giver: 'Vale has been seen beyond the river. Stand with us at the bridge, and Reedford will remember who answered. Read the Local Contract before you decide.',
    'resident-agent': 'My family lives nearest the crossing. We need a Band that holds its ground, not another promise. Mara Venn can tell you what is coming.',
  }),
  Accepted: Object.freeze({
    giver: 'You have my word, and we have yours. Prepare your Band in the Journal. When the Raid deadline comes, we make our stand at the bridge.',
    'resident-agent': 'I have moved the children away from the river. Keep the raiders from reaching the residents. We are counting on you.',
  }),
  Release: Object.freeze({
    giver: 'You defended Reedford and spared Aldric Vale. Mercy after a hard victory takes courage. You have a friend here.',
    'resident-agent': 'You saved those you could, but Vale walks free. I will remember the defense. Trust will take longer.',
  }),
  Capture: Object.freeze({
    giver: 'Reedford still stands, and Aldric Vale will answer for the Raid. You kept faith with us. You have my friendship.',
    'resident-agent': 'Vale is a Captive, not a threat at our door. Thank you for protecting the residents. Your Band is welcome with me.',
  }),
  Execute: Object.freeze({
    giver: 'We asked for protection, not an execution after the fighting. You executed Aldric Vale when he could no longer resist. I will not forget that wrong.',
    'resident-agent': 'Aldric Vale will never threaten my family again. The price was hard, but you ended his raids. You have my thanks.',
  }),
  Failed: Object.freeze({
    giver: 'The settlement was harmed under your protection. Look at the losses before you ask anything more of us. There will be no second Local Contract.',
    'resident-agent': 'We trusted your Band to protect the residents. Now Reedford is Damaged and we must live with the cost. I remember who failed us.',
  }),
});
