export type Vec2 = { x: number; z: number };
export type SceneId = 'overworld' | 'settlement';
export type Sector = 'Overhead' | 'Left cut' | 'Right cut' | 'Thrust';
export type Weapon = 'Sword' | 'Staff';
export type Role = 'Player' | 'Companion' | 'Troop' | 'Enemy Agent' | 'Bandit' | 'Resident';
export type Fate = 'Active' | 'Captive' | 'Executed';
export type Disposition = 'Friendly' | 'Neutral' | 'Hostile';
export type Grievance = 'Agent captured' | 'Agent executed' | 'Settlement harmed';
export type FateChoice = 'Release' | 'Capture' | 'Execute';
export type Feat = 'Rapid Guard' | 'Rapid Attack' | 'Rapid Stamina';
export type GroupId = 'Companion' | 'Troops';
export type Order = 'Follow' | 'Hold' | 'Engage';
export type Phase = 'Travel' | 'Settlement' | 'Setup' | 'Battle' | 'Agent fate' | 'Bandit fate' | 'Summary' | 'Feat';
export type SaveBoundary = 'Safe non-combat' | 'Transitioning' | 'Restoring snapshot' | 'Battle and resolution' | 'Load failed';
export type ActionPhase = 'Idle' | 'Preview' | 'Windup' | 'Active' | 'Recovery' | 'Guard' | 'Shield' | 'Stagger';
export interface Agent { id: string; name: string; fate: Fate; disposition?: Disposition; grievances: Grievance[] }
export interface Member { id: string; name: string; role: 'Player' | 'Companion' | 'Troop'; health: number; available: boolean; weapon: Weapon; shield: boolean }
export interface Combatant {
 id: string; name: string; role: Role; team: 'Band' | 'Raiders' | 'Residents'; position: Vec2; facing: number;
 health: number; maxHealth: number; stamina: number; speed: number; weapon: Weapon; shield: boolean; armed: boolean;
 status: 'Active' | 'Downed' | 'Killed'; action: ActionPhase; sector: Sector | null; effectiveSector: Sector | null;
 actionTime: number; guardTime: number; spendTime: number; exhausted: boolean; cooldown: number; target: string | null;
 hitIds: string[]; attackId: number; guardMode: 'Directional Guard' | 'Shield Block';
}
export interface Group { order: Order; marker: Vec2 | null; target: string | null }
export interface Campaign {
 scene: SceneId; position: Vec2; time: number; coin: number; provisions: number; provisionRemainder: number;
 members: Member[]; agents: Agent[]; contract: 'Available' | 'Accepted' | 'Resolved' | 'Failed'; deadline: number | null;
 raidLocation: 'Bridge' | 'Settlement center' | null; condition: 'Safe' | 'Damaged' | null;
 captives: number; enemyChoice: FateChoice | null; banditChoice: FateChoice | null; banditDowned: number; banditKilled: number;
 feat: Feat | null; randomState: number; casualties: { band: string[]; residents: number };
}
export type ArenaMode = 'Duel' | 'Team';
export interface ArenaSession { mode: ArenaMode; randomState: number; exiting: boolean }
export interface GameState {
 tick: number; campaign: Campaign; phase: Phase; boundary: SaveBoundary; paused: boolean; speed: number;
 destination: Vec2 | null; move: Vec2; facing: number; combatants: Combatant[]; groups: Record<GroupId, Group>;
 selectedGroup: GroupId; placingHold: boolean; invalidMarker: Vec2 | null; setupRemaining: number; battleTime: number;
 outcome: 'Victory' | 'Defeat' | null; dialogue: string | null; offerOpen: boolean; journalOpen: boolean;
 pendingChoice: FateChoice | null; transition: SceneId | null; pointer: { button: 0 | 2; x: number; y: number } | null;
 arena?: ArenaSession;
}
export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type Projection = DeepReadonly<GameState>;
export interface Snapshot { version: 1; campaign: Campaign }
export type Command =
 | { type: 'travel'; point: Vec2 } | { type: 'speed'; speed: number } | { type: 'pause' }
 | { type: 'move'; direction: Vec2; facing: number }
 | { type: 'talk'; agentId: string } | { type: 'close' } | { type: 'journal' }
 | { type: 'accept' } | { type: 'decline' } | { type: 'wait' } | { type: 'leave' }
 | { type: 'recruit'; candidateId: string; confirmed: boolean }
 | { type: 'pointer'; phase: 'down' | 'move' | 'up'; button: 0 | 2; x: number; y: number }
 | { type: 'guard-mode' } | { type: 'select-group'; group: GroupId }
 | { type: 'order'; order: Order } | { type: 'hold-point'; point: Vec2 }
 | { type: 'choose-fate'; choice: FateChoice } | { type: 'confirm-fate' } | { type: 'cancel-fate' }
 | { type: 'continue' } | { type: 'choose-feat'; feat: Feat }
 | { type: 'arena-start'; mode: ArenaMode } | { type: 'arena-restart' } | { type: 'arena-exit' }
 | { type: 'transition-ready' } | { type: 'transition-failed' } | { type: 'retry-transition' };
export interface Feedback { tick: number; type: 'invalid' | 'attack' | 'guard' | 'block' | 'hit' | 'struck' | 'miss' | 'interrupted' | 'downed' | 'killed' | 'order' | 'response' | 'footstep' | 'interaction' | 'journal' | 'confirm' | 'cancel' | 'accepted' | 'deadline' | 'victory' | 'defeat' | 'choice' | 'transition' | 'save' | 'load'; actorId?: string; sector?: Sector; weapon?: Weapon; position?: Vec2; message?: string }
export type Emit = (event: Omit<Feedback, 'tick'>) => void;
export interface SimulationPort {
 submit(command: Command, targetTick?: number): void;
 advance(): void;
 project(): Projection;
 drainEvents(): Feedback[];
 snapshot(): Snapshot;
 restore(snapshot: unknown): void;
 dispose(): void;
}
export type SlotId = '1' | '2' | '3' | 'autosave';
export interface SaveEntry { slot: SlotId; savedAt: string; snapshot: Snapshot | null; reason?: string }
export interface StorageResult<T> { ok: boolean; value?: T; error?: string }
export interface PersistencePort {
 list(): Promise<StorageResult<SaveEntry[]>>;
 read(slot: SlotId): Promise<StorageResult<Snapshot>>;
 write(slot: SlotId, snapshot: Snapshot): Promise<StorageResult<void>>;
 delete(slot: Exclude<SlotId, 'autosave'>): Promise<StorageResult<void>>;
 reset(): Promise<StorageResult<void>>;
 retry(): Promise<StorageResult<void>>;
}
