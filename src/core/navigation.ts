import type { Vec2 } from './types';
import { WORLD } from '../content/catalog';

export const ACTOR_RADIUS = 0.32;
// Stay just inside Rapier's 0.025 controller skin so a wall-contact pose can
// always navigate away again despite floating-point contact tolerances.
export const NAV_CLEARANCE = ACTOR_RADIUS + 0.015;
export const SETTLEMENT_BOUNDS = {
  minX: -WORLD.settlementHalfWidth, maxX: WORLD.settlementHalfWidth,
  minZ: -WORLD.settlementHalfDepth, maxZ: WORLD.settlementHalfDepth,
} as const;
export const ARENA_BOUNDS = { minX: -8, maxX: 8, minZ: 6, maxZ: 24 } as const;

export function arenaTraversable(point: Vec2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.z)
    && point.x >= ARENA_BOUNDS.minX + NAV_CLEARANCE && point.x <= ARENA_BOUNDS.maxX - NAV_CLEARANCE
    && point.z >= ARENA_BOUNDS.minZ + NAV_CLEARANCE && point.z <= ARENA_BOUNDS.maxZ - NAV_CLEARANCE;
}
export interface Obstacle { minX: number; maxX: number; minZ: number; maxZ: number }
export const SOLID_OBSTACLES: readonly Obstacle[] = [
  { minX: -WORLD.settlementHalfWidth, maxX: -WORLD.bridgeHalfWidth, minZ: -WORLD.riverHalfWidth, maxZ: WORLD.riverHalfWidth },
  { minX: WORLD.bridgeHalfWidth, maxX: WORLD.settlementHalfWidth, minZ: -WORLD.riverHalfWidth, maxZ: WORLD.riverHalfWidth },
  { minX: -16, maxX: -10, minZ: 8, maxZ: 14 },
  { minX: 10, maxX: 16, minZ: 8, maxZ: 14 },
  { minX: -18, maxX: -10, minZ: 20, maxZ: 26 },
  { minX: 10, maxX: 18, minZ: 20, maxZ: 26 },
];

export function traversable(point: Vec2, clearance = NAV_CLEARANCE): boolean {
  const { x, z } = point;
  if (!Number.isFinite(x) || !Number.isFinite(z)
    || x < SETTLEMENT_BOUNDS.minX + clearance || x > SETTLEMENT_BOUNDS.maxX - clearance
    || z < SETTLEMENT_BOUNDS.minZ + clearance || z > SETTLEMENT_BOUNDS.maxZ - clearance) return false;
  for (const obstacle of SOLID_OBSTACLES) {
    if (x >= obstacle.minX - clearance && x <= obstacle.maxX + clearance
      && z >= obstacle.minZ - clearance && z <= obstacle.maxZ + clearance) return false;
  }
  return true;
}

function clearSegment(from: Vec2, to: Vec2): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  for (const obstacle of SOLID_OBSTACLES) {
    let enter = 0;
    let exit = 1;
    const minX = obstacle.minX - NAV_CLEARANCE;
    const maxX = obstacle.maxX + NAV_CLEARANCE;
    const minZ = obstacle.minZ - NAV_CLEARANCE;
    const maxZ = obstacle.maxZ + NAV_CLEARANCE;
    if (Math.abs(dx) < 1e-9) {
      if (from.x < minX || from.x > maxX) continue;
    } else {
      const a = (minX - from.x) / dx;
      const b = (maxX - from.x) / dx;
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
    }
    if (Math.abs(dz) < 1e-9) {
      if (from.z < minZ || from.z > maxZ) continue;
    } else {
      const a = (minZ - from.z) / dz;
      const b = (maxZ - from.z) / dz;
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
    }
    if (enter <= exit) return false;
  }
  return true;
}

const anchors: Vec2[] = [
  { x: -0.9, z: -3.8 }, { x: 0.9, z: -3.8 },
  { x: -0.9, z: 3.8 }, { x: 0.9, z: 3.8 },
];
for (const obstacle of SOLID_OBSTACLES.slice(2)) {
  const margin = NAV_CLEARANCE + 0.08;
  for (const x of [obstacle.minX - margin, obstacle.maxX + margin]) {
    for (const z of [obstacle.minZ - margin, obstacle.maxZ + margin]) {
      const point = { x, z };
      if (traversable(point)) anchors.push(point);
    }
  }
}
const edges = new Float64Array(anchors.length * anchors.length).fill(Infinity);
for (let i = 0; i < anchors.length; i++) {
  for (let j = 0; j < anchors.length; j++) {
    if (i !== j && clearSegment(anchors[i], anchors[j])) {
      edges[i * anchors.length + j] = Math.hypot(anchors[i].x - anchors[j].x, anchors[i].z - anchors[j].z);
    }
  }
}

/** Authored visibility graph; scratch storage is private, not gameplay state. */
export class Navigation {
  private readonly distances = new Float64Array(anchors.length);
  private readonly visited = new Uint8Array(anchors.length);
  private readonly first = new Int16Array(anchors.length);

  steer(from: Vec2, target: Vec2, out: Vec2): boolean {
    out.x = 0;
    out.z = 0;
    if (!traversable(target)) return false;
    if (clearSegment(from, target)) {
      this.direction(from, target, out);
      return true;
    }
    this.visited.fill(0);
    this.first.fill(-1);
    for (let i = 0; i < anchors.length; i++) {
      this.distances[i] = clearSegment(from, anchors[i])
        ? Math.hypot(anchors[i].x - from.x, anchors[i].z - from.z) : Infinity;
      if (Number.isFinite(this.distances[i])) this.first[i] = i;
    }
    let shortest = Infinity;
    let first = -1;
    for (let iteration = 0; iteration < anchors.length; iteration++) {
      let node = -1;
      let distance = Infinity;
      for (let i = 0; i < anchors.length; i++) {
        if (!this.visited[i] && this.distances[i] < distance) {
          node = i;
          distance = this.distances[i];
        }
      }
      if (node < 0 || distance >= shortest) break;
      this.visited[node] = 1;
      if (clearSegment(anchors[node], target)) {
        const total = distance + Math.hypot(anchors[node].x - target.x, anchors[node].z - target.z);
        if (total < shortest) {
          shortest = total;
          first = this.first[node];
        }
      }
      for (let next = 0; next < anchors.length; next++) {
        const candidate = distance + edges[node * anchors.length + next];
        if (!this.visited[next] && candidate < this.distances[next]) {
          this.distances[next] = candidate;
          this.first[next] = this.first[node];
        }
      }
    }
    if (first < 0) return false;
    this.direction(from, anchors[first], out);
    return true;
  }

  private direction(from: Vec2, target: Vec2, out: Vec2): void {
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.04) {
      out.x = dx / distance;
      out.z = dz / distance;
    }
  }
}
