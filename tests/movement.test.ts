import { expect, it } from 'vitest';
import { Simulation } from '../src/core/simulation';

it('reaches the settlement in fifteen seconds at normal speed with unchanged travel costs', async () => {
 const sim = await Simulation.create(1101);
 try {
  sim.submit({ type: 'travel', point: { x: 0, z: 0 } });
  for (let tick = 0; tick < 899; tick++) sim.advance();
  expect(sim.project().boundary).toBe('Safe non-combat');
  sim.advance();
  expect(sim.project().boundary).toBe('Transitioning');
  expect(sim.project().campaign.position).toEqual({ x: 0, z: .5 });
  expect(sim.project().campaign.time).toBe(20);
  expect(sim.project().campaign.provisions).toBe(9.8);
  expect(sim.project().campaign.provisionRemainder).toBe(0);
 } finally { sim.dispose(); }
});

it('moves the player seven world units in one second through real Scene physics', async () => {
 const sim = await Simulation.create(1101);
 try {
  sim.submit({ type: 'speed', speed: 4 });
  sim.submit({ type: 'travel', point: { x: 0, z: 0 } });
  for (let tick = 0; tick < 225; tick++) sim.advance();
  sim.submit({ type: 'transition-ready' });
  sim.advance();
  sim.submit({ type: 'move', direction: { x: 1, z: 0 }, facing: Math.PI / 2 });
  for (let tick = 0; tick < 60; tick++) sim.advance();
  expect(sim.project().campaign.position.x).toBeCloseTo(7, 3);
  expect(sim.project().campaign.position.z).toBeCloseTo(14, 3);
  expect(sim.project().campaign.time).toBe(20);
  expect(sim.project().campaign.provisions).toBe(9.8);
 } finally { sim.dispose(); }
});
