import { describe, expect, it } from 'vitest';
import { FixedClock, FrameMetrics } from '../src/browser/runtime';

describe('fixed-tick delivery', () => {
 it('caps each frame at five ticks and retains every catch-up tick rather than dropping debt', () => {
  const clock = new FixedClock();
  let ticks = 0;
  const tick = () => { ticks++; };
  expect(clock.advance(1, tick)).toBe(5);
  expect(ticks).toBe(5);
  expect(clock.pendingSeconds).toBeCloseTo(55 / 60, 10);
  for (let frame = 0; frame < 11; frame++) expect(clock.advance(0, tick)).toBe(5);
  expect(ticks).toBe(60);
  expect(clock.pendingSeconds).toBeCloseTo(0, 10);
  expect(clock.advance(0, tick)).toBe(0);
 });

 it('preserves fractional frame time across renders', () => {
  const clock = new FixedClock();
  let ticks = 0;
  const tick = () => { ticks++; };
  expect(clock.advance(1 / 240, tick)).toBe(0);
  expect(clock.advance(1 / 240, tick)).toBe(0);
  expect(clock.advance(1 / 240, tick)).toBe(0);
  expect(clock.advance(1 / 240, tick)).toBe(1);
  expect(ticks).toBe(1);
 });

 it('rejects invalid durations without poisoning previously retained debt', () => {
  const clock = new FixedClock();
  let ticks = 0;
  const tick = () => { ticks++; };
  clock.advance(1 / 120, tick);
  for (const elapsed of [-1, NaN, Infinity]) expect(() => clock.advance(elapsed, tick)).toThrow();
  expect(clock.advance(1 / 120, tick)).toBe(1);
  expect(ticks).toBe(1);
 });

 it('measures actual frame intervals and resets only the contiguous slow interval', () => {
  const metrics = new FrameMetrics();
  for (const duration of [40, 60, 10, 50, 70]) metrics.record(duration);
  expect(metrics.report()).toEqual({ frames: 5, averageMs: 46, p95Ms: 70, longestBelow30Seconds: .12 });
 });
});
