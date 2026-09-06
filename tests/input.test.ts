import { afterEach, expect, it, vi } from 'vitest';
import { GameInput } from '../src/browser/input';
import type { GameRenderer } from '../src/browser/renderer';
import { Simulation } from '../src/core/simulation';
import type { Command, Sector } from '../src/core/types';

const owned: { input: GameInput; simulation: Simulation }[] = [];
afterEach(() => {
 for (const { input, simulation } of owned.splice(0)) { input.dispose(); simulation.dispose(); }
 vi.unstubAllGlobals();
});

// Native EventTargets exercise GameInput's registered listeners. Only browser hosting
// (focus, capture, lock and camera rendering) is substituted; gameplay uses Simulation.
async function fixture(phase: 'Travel' | 'Settlement' | 'Setup' | 'Battle' = 'Setup') {
 const simulation = await Simulation.create(1301);
 const command = (value: Command) => { simulation.submit(value); simulation.advance(); };
 if (phase !== 'Travel') {
  command({ type: 'speed', speed: 4 });
  command({ type: 'travel', point: { x: 0, z: 0 } });
  while (simulation.project().boundary !== 'Transitioning') simulation.advance();
  command({ type: 'transition-ready' });
  if (phase !== 'Settlement') {
   command({ type: 'talk', agentId: 'giver' });
   command({ type: 'accept' });
   for (let hour = 0; hour < 12; hour++) command({ type: 'wait' });
   if (phase === 'Battle') while (simulation.project().phase === 'Setup') simulation.advance();
  }
 }
 const windowTarget = new EventTarget();
 const documentTarget = Object.assign(new EventTarget(), {
  activeElement: null as ElementTarget | null,
  pointerLockElement: null as ElementTarget | null,
  hidden: false,
  exitPointerLock() {
   this.pointerLockElement = null;
   documentTarget.dispatchEvent(new Event('pointerlockchange'));
  },
 });
 function dispatch(target: EventTarget, type: string, values: object = {}) {
  const event = Object.assign(new Event(type, { cancelable: true }), values);
  Object.defineProperty(event, 'target', { value: target });
  // Outside pointerdown releases input in window capture before a UI action runs.
  if (type === 'pointerdown' && target !== windowTarget) windowTarget.dispatchEvent(event);
  target.dispatchEvent(event);
  if (type !== 'pointerdown' && target !== windowTarget && target !== documentTarget) windowTarget.dispatchEvent(event);
  return event;
 }
 class ElementTarget extends EventTarget {
  tabIndex = -1;
  captures = new Set<number>();
  lockRequests = 0;
  constructor(private tag: string) { super(); }
  closest(selectors: string) { return selectors.split(',').some(selector => selector.trim() === this.tag) ? this : null; }
  focus() { documentTarget.activeElement = this; dispatch(this, 'focusin'); }
  setPointerCapture(id: number) { this.captures.add(id); }
  hasPointerCapture(id: number) { return this.captures.has(id); }
  releasePointerCapture(id: number) { this.captures.delete(id); dispatch(this, 'lostpointercapture', { pointerId: id }); }
  requestPointerLock() { this.lockRequests++; }
 }
 vi.stubGlobal('window', windowTarget);
 vi.stubGlobal('document', documentTarget);
 vi.stubGlobal('HTMLElement', ElementTarget);
 const canvas = new ElementTarget('canvas');
 const button = new ElementTarget('button');
 const textInput = new ElementTarget('input');
 const dialog = new ElementTarget('dialog');
 const renderer = {
  yaw: Math.PI, pitch: 0,
  rotate(dx: number, dy: number) { this.yaw -= dx * .004; this.pitch += dy * .003; },
  facing() { return this.yaw; },
  zoom() {},
  groundPoint() { return { x: 1, z: 14 }; },
 };
 const input = new GameInput(canvas as unknown as HTMLCanvasElement, renderer as unknown as GameRenderer, () => simulation.project(), value => simulation.submit(value));
 owned.push({ input, simulation });
 input.enabled = true;
 canvas.focus();
 return {
  input, simulation, renderer, canvas, button, textInput, dialog, document: documentTarget, window: windowTarget, dispatch, command,
  pointer(type: string, values: Partial<PointerEvent> = {}, target: EventTarget = canvas) {
   dispatch(target, type, { pointerId: 1, pointerType: 'mouse', button: -1, buttons: 0, clientX: 200, clientY: 200, movementX: 0, movementY: 0, ...values });
  },
  key(type: 'keydown' | 'keyup', code: string, target: EventTarget = canvas, repeat = false) { dispatch(target, type, { code, repeat }); },
  frame() { input.update(); simulation.advance(); },
  player() { return simulation.project().combatants.find(value => value.role === 'Player')!; },
  lock() { documentTarget.pointerLockElement = canvas; documentTarget.dispatchEvent(new Event('pointerlockchange')); },
 };
}

it.each(['Settlement', 'Setup', 'Battle'] as const)('turns camera and player on unpressed mouse movement during %s', async phase => {
 const run = await fixture(phase);
 const before = run.player().position;
 run.pointer('pointermove', { movementX: 80, movementY: 20 });
 run.frame();
 expect(run.renderer.yaw).toBeLessThan(Math.PI);
 expect(run.renderer.pitch).toBeGreaterThan(0);
 expect(run.player().facing).toBe(run.renderer.yaw);
 expect(run.player().position).toEqual(before);
 expect(run.canvas.lockRequests).toBe(0);
});

it('keeps A and D perpendicular to the turned heading without changing facing', async () => {
 const run = await fixture('Settlement');
 run.pointer('pointermove', { movementX: 160 });
 run.frame();
 const heading = run.renderer.yaw;
 for (const [code, sign] of [['KeyD', 1], ['KeyA', -1]] as const) {
  run.key('keydown', code);
  run.frame();
  const { move, facing } = run.simulation.project();
  expect(move.x * Math.sin(heading) + move.z * Math.cos(heading)).toBeCloseTo(0);
  expect(move.x * -Math.cos(heading) + move.z * Math.sin(heading)).toBeCloseTo(sign);
  expect(facing).toBe(heading);
  run.key('keyup', code);
  run.frame();
 }
});

it('keeps right-held Directional Guard gestures separate from turning and retains Q Shield Block', async () => {
 const run = await fixture();
 run.pointer('pointerdown', { button: 2, buttons: 2 });
 run.pointer('pointermove', { buttons: 2, clientX: 248, movementX: 48 });
 run.frame();
 expect(run.player().action).toBe('Guard');
 expect(run.player().sector).toBe('Right cut');
 expect(run.renderer.yaw).toBe(Math.PI);
 run.key('keydown', 'KeyD');
 run.frame();
 expect(run.simulation.project().move.x).toBeCloseTo(1);
 expect(run.player().action).toBe('Guard');
 // Releasing an unrelated button must not drop the held defense.
 run.pointer('pointerup', { button: 0, buttons: 2 });
 run.frame();
 expect(run.player().action).toBe('Guard');
 run.pointer('pointerup', { button: 2, clientX: 248 });
 run.key('keyup', 'KeyD');
 run.frame();
 expect(run.player().action).toBe('Idle');
 run.key('keydown', 'KeyQ');
 run.frame();
 run.pointer('pointerdown', { button: 2, buttons: 2 });
 run.pointer('pointermove', { buttons: 2, clientY: 152, movementY: -48 });
 run.frame();
 expect(run.player().guardMode).toBe('Shield Block');
 expect(run.player().action).toBe('Shield');
 expect(run.renderer.pitch).toBe(0);
 run.pointer('pointerup', { button: 2 });
 run.frame();
 expect(run.player().action).toBe('Idle');
 expect(run.canvas.lockRequests).toBe(0);
});

it.each([
 ['Overhead', 0, -48], ['Left cut', -48, 0], ['Right cut', 48, 0], ['Thrust', 0, 48],
] satisfies [Sector, number, number][])('preserves %s attacks with locked client coordinates', async (sector, movementX, movementY) => {
 const run = await fixture();
 run.pointer('pointerdown', { button: 1, buttons: 4 });
 expect(run.canvas.lockRequests).toBe(1);
 run.lock();
 run.pointer('pointerdown', { button: 0, buttons: 1 });
 run.pointer('pointermove', { buttons: 1, movementX, movementY });
 run.frame();
 expect(run.player().action).toBe('Preview');
 expect(run.player().sector).toBe(sector);
 expect(run.renderer.yaw).toBe(Math.PI);
 expect(run.renderer.pitch).toBe(0);
 run.pointer('pointerup', { button: 0 });
 run.frame();
 expect(run.player().action).toBe('Windup');
 expect(run.player().sector).toBe(sector);
 expect(run.canvas.lockRequests).toBe(1);
});

it('selects all Directional Guard sectors using accumulated locked mouse movement', async () => {
 const run = await fixture();
 run.pointer('pointerdown', { button: 1, buttons: 4 });
 run.lock();
 run.pointer('pointerdown', { button: 2, buttons: 2 });
 for (const [sector, movementX, movementY] of [
  ['Overhead', 0, -48], ['Right cut', 48, 48], ['Thrust', -48, 48], ['Left cut', -48, -48],
 ] satisfies [Sector, number, number][]) {
  run.pointer('pointermove', { buttons: 2, movementX, movementY });
  run.frame();
  expect(run.player().action).toBe('Guard');
  expect(run.player().sector).toBe(sector);
 }
 expect(run.renderer.yaw).toBe(Math.PI);
 expect(run.renderer.pitch).toBe(0);
 run.pointer('pointerup', { button: 2 });
 run.frame();
 expect(run.player().action).toBe('Idle');
});

it('handles browser chorded-button moves without committing the cancelled attack or dropping defense early', async () => {
 const run = await fixture();
 run.pointer('pointerdown', { button: 0, buttons: 1 });
 run.pointer('pointermove', { buttons: 1, clientX: 248, movementX: 48 });
 run.frame();
 expect(run.player().action).toBe('Preview');
 run.pointer('pointermove', { button: 2, buttons: 3, clientX: 248 });
 run.frame();
 expect(run.player().action).toBe('Guard');
 run.pointer('pointermove', { button: 0, buttons: 2, clientX: 200, movementX: -48 });
 run.frame();
 expect(run.player().action).toBe('Guard');
 expect(run.player().sector).toBe('Left cut');
 run.pointer('pointerup', { button: 2 });
 run.frame();
 expect(run.player().action).toBe('Idle');
 expect(run.renderer.yaw).toBe(Math.PI);
});

it('releases defense and movement before a UI click pauses gameplay', async () => {
 const run = await fixture();
 run.key('keydown', 'KeyW');
 run.pointer('pointerdown', { button: 2, buttons: 2 });
 run.frame();
 run.button.addEventListener('pointerdown', () => run.simulation.submit({ type: 'pause' }));
 run.pointer('pointerdown', { button: 0, buttons: 1 }, run.button);
 run.frame();
 expect(run.simulation.project().paused).toBe(true);
 expect(run.player().action).toBe('Idle');
 expect(run.simulation.project().pointer).toBeNull();
 expect(run.simulation.project().move).toEqual({ x: 0, z: 0 });
 expect(run.canvas.captures.size).toBe(0);
 run.button.focus();
 run.pointer('pointermove', { movementX: 100 });
 run.key('keyup', 'KeyW', run.button);
 run.key('keydown', 'Escape', run.button);
 run.frame();
 run.canvas.focus();
 run.frame();
 expect(run.simulation.project().paused).toBe(false);
 expect(run.simulation.project().move).toEqual({ x: 0, z: 0 });
 expect(run.renderer.yaw).toBe(Math.PI);
});

it('retains key and pointer release when disabled or focused in an input field', async () => {
 const run = await fixture();
 run.key('keydown', 'KeyD');
 run.pointer('pointerdown', { button: 2, buttons: 2 });
 run.frame();
 run.input.enabled = false;
 run.simulation.advance();
 expect(run.player().action).toBe('Idle');
 expect(run.simulation.project().move).toEqual({ x: 0, z: 0 });
 expect(run.canvas.captures.size).toBe(0);
 run.textInput.focus();
 run.key('keyup', 'KeyD', run.textInput);
 run.pointer('pointerup', { button: 2 }, run.textInput);
 run.input.enabled = true;
 run.canvas.focus();
 run.frame();
 expect(run.player().action).toBe('Idle');
 expect(run.simulation.project().move).toEqual({ x: 0, z: 0 });
 run.key('keydown', 'KeyW');
 run.frame();
 run.textInput.focus();
 run.frame();
 run.canvas.focus();
 run.key('keydown', 'KeyW', run.canvas, true);
 run.frame();
 expect(run.simulation.project().move).toEqual({ x: 0, z: 0 });
});

it.each(['blur', 'pointercancel', 'lostpointercapture'] as const)('releases held input on %s', async type => {
 const run = await fixture();
 run.key('keydown', 'KeyW');
 run.pointer('pointerdown', { button: 2, buttons: 2 });
 run.frame();
 if (type === 'blur') run.dispatch(run.window, type);
 else run.pointer(type);
 run.frame();
 expect(run.player().action).toBe('Idle');
 expect(run.simulation.project().pointer).toBeNull();
 expect(run.simulation.project().move).toEqual({ x: 0, z: 0 });
 expect(run.canvas.captures.size).toBe(0);
});

it('turns continuously when explicitly locked and Escape releases before a second Escape opens the menu', async () => {
 const run = await fixture();
 run.pointer('pointermove', { movementX: 80 });
 expect(run.canvas.lockRequests).toBe(0);
 run.pointer('pointerdown', { button: 1, buttons: 4 });
 run.lock();
 for (let turn = 0; turn < 20; turn++) run.pointer('pointermove', { movementX: 100 });
 run.frame();
 expect(run.renderer.yaw).toBeLessThan(-Math.PI);
 expect(run.player().facing).toBe(run.renderer.yaw);
 run.key('keydown', 'KeyW');
 run.pointer('pointerdown', { button: 2, buttons: 2 });
 run.frame();
 run.key('keydown', 'Escape');
 run.frame();
 expect(run.document.pointerLockElement).toBeNull();
 expect(run.simulation.project().paused).toBe(false);
 expect(run.player().action).toBe('Idle');
 expect(run.simulation.project().move).toEqual({ x: 0, z: 0 });
 run.key('keydown', 'Escape');
 run.frame();
 expect(run.simulation.project().paused).toBe(true);
});

it('keeps Journal usable when a pending lock request finishes after it opens', async () => {
 const run = await fixture();
 run.pointer('pointerdown', { button: 1, buttons: 4 });
 run.key('keydown', 'KeyJ');
 run.frame();
 run.lock();
 expect(run.document.pointerLockElement).toBeNull();
 run.pointer('pointermove', { movementX: 100 });
 run.frame();
 expect(run.simulation.project().journalOpen).toBe(true);
 expect(run.renderer.yaw).toBe(Math.PI);
 run.key('keydown', 'Escape', run.textInput);
 run.frame();
 expect(run.simulation.project().journalOpen).toBe(false);
});

it('unlocks for Hold placement and leaves mouse motion for targeting rather than turning', async () => {
 const run = await fixture();
 run.pointer('pointerdown', { button: 1, buttons: 4 });
 run.lock();
 run.key('keydown', 'KeyH');
 run.frame();
 expect(run.document.pointerLockElement).toBeNull();
 expect(run.simulation.project().placingHold).toBe(true);
 run.pointer('pointermove', { movementX: 100, movementY: 40 });
 run.pointer('pointerdown', { button: 2, buttons: 2 });
 run.frame();
 expect(run.player().action).toBe('Idle');
 expect(run.renderer.yaw).toBe(Math.PI);
 expect(run.renderer.pitch).toBe(0);
 run.pointer('pointerdown', { button: 0, buttons: 1 });
 run.frame();
 expect(run.simulation.project().placingHold).toBe(false);
 expect(run.simulation.project().groups.Companion.marker).toEqual({ x: 1, z: 14 });
});

it('preserves explicit Overworld orbit without passive turning or pointer lock', async () => {
 const run = await fixture('Travel');
 run.pointer('pointermove', { movementX: 80 });
 expect(run.renderer.yaw).toBe(Math.PI);
 run.pointer('pointerdown', { button: 2, buttons: 2 });
 run.pointer('pointermove', { buttons: 2, movementX: 80 });
 run.pointer('pointerup', { button: 2 });
 expect(run.renderer.yaw).toBeLessThan(Math.PI);
 expect(run.canvas.lockRequests).toBe(0);
 expect(run.simulation.project().destination).toBeNull();
});

it('resumes paused travel with speed keys and Space from the focused pause panel', async () => {
 const run = await fixture('Travel');
 run.command({ type: 'pause' });
 run.dialog.focus();
 run.key('keydown', 'Digit3', run.dialog);
 run.frame();
 expect(run.simulation.project()).toMatchObject({ paused: false, speed: 3 });
 run.command({ type: 'pause' });
 run.key('keydown', 'Space', run.dialog);
 run.frame();
 expect(run.simulation.project()).toMatchObject({ paused: false, speed: 3 });
 run.command({ type: 'pause' });
 run.key('keydown', 'Space', run.button);
 run.key('keydown', 'Digit1', run.textInput);
 run.frame();
 expect(run.simulation.project()).toMatchObject({ paused: true, speed: 3 });
});
