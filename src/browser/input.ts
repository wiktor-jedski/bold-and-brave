import type { Command, Projection, Vec2 } from '../core/types';
import type { GameRenderer } from './renderer';

export class GameInput {
 private keys = new Set<string>();
 private abort = new AbortController();
 private dragging: { button: 0 | 2; x: number; y: number } | null = null;
 private orbit = false;
 private pointerId: number | null = null;
 private lockRequested = false;
 private lastMove = '';
 private active = false;
 get enabled(): boolean { return this.active; }
 set enabled(value: boolean) {
  if (!value) this.release();
  else if (!this.active) this.lastMove = '';
  this.active = value;
 }
 constructor(private canvas: HTMLCanvasElement, private renderer: GameRenderer, private project: () => Projection, private send: (command: Command) => void) {
  canvas.tabIndex = 0;
  const options = { signal: this.abort.signal };
  window.addEventListener('keydown', event => this.key(event, true), options);
  window.addEventListener('keyup', event => this.key(event, false), options);
  window.addEventListener('blur', () => this.release(), options);
  window.addEventListener('pointerdown', event => { if (event.target !== canvas) this.release(); }, { ...options, capture: true });
  window.addEventListener('focusin', event => { if (event.target !== canvas) this.release(); }, options);
  window.addEventListener('pointerup', event => this.up(event), options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) this.release(); }, options);
  document.addEventListener('pointerlockchange', () => {
   if (document.pointerLockElement !== canvas || !this.lockRequested || !this.available(this.project()) || this.project().placingHold || this.isUI(document.activeElement)) this.release();
  }, options);
  document.addEventListener('pointerlockerror', () => { this.lockRequested = false; }, options);
  canvas.addEventListener('contextmenu', event => event.preventDefault(), options);
  canvas.addEventListener('pointerdown', event => this.down(event), options);
  canvas.addEventListener('pointermove', event => this.move(event), options);
  canvas.addEventListener('pointercancel', () => this.release(), options);
  canvas.addEventListener('lostpointercapture', event => { if (event.pointerId === this.pointerId) this.release(); }, options);
  canvas.addEventListener('wheel', event => {
   if (this.available(this.project()) && !this.isUI(document.activeElement)) { event.preventDefault(); this.renderer.zoom(event.deltaY); }
  }, { ...options, passive: false });
 }
 private isUI(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, input, select, textarea, summary, dialog, a, [contenteditable]:not([contenteditable="false"]), [role="dialog"]') !== null;
 }
 private available(state: Projection): boolean {
  return this.enabled && !state.paused && !state.journalOpen && state.dialogue === null && !state.offerOpen
   && state.boundary !== 'Transitioning' && state.boundary !== 'Restoring snapshot' && state.boundary !== 'Load failed'
   && (state.phase === 'Travel' || state.phase === 'Settlement' || state.phase === 'Setup' || state.phase === 'Battle');
 }
 private key(event: KeyboardEvent, down: boolean) {
  if (!down) { this.keys.delete(event.code); return; }
  if (!this.enabled || event.repeat) return;
  if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])') && event.code !== 'Escape') return;
  const state = this.project();
  // Travel shortcuts also work when the Pause panel owns keyboard focus.
  if (state.phase === 'Travel' && !state.journalOpen && !state.dialogue && !state.offerOpen) {
   if (/^Digit[1-4]$/.test(event.code)) { this.send({ type: 'speed', speed: Number(event.code.slice(-1)) }); return; }
   if (event.code === 'Space' && !(event.target instanceof HTMLElement && event.target.closest('button, summary, a'))) {
    event.preventDefault(); this.send({ type: 'pause' }); return;
   }
  }
  if (this.isUI(event.target) && event.code !== 'Escape' && event.code !== 'KeyJ') return;
  if (event.code === 'KeyJ') { this.release(); this.send({ type: 'journal' }); }
  else if (event.code === 'Escape') {
   const locked = this.lockRequested || document.pointerLockElement === this.canvas;
   this.release();
   if (locked) return;
   if (state.journalOpen || state.dialogue || state.offerOpen || state.placingHold) this.send({ type: 'close' });
   else this.send({ type: 'pause' });
  } else {
   if (!this.available(state)) return;
   if (event.code === 'Space') event.preventDefault();
   this.keys.add(event.code);
   if (event.code === 'KeyQ') this.send({ type: 'guard-mode' });
   else if (state.phase === 'Setup' || state.phase === 'Battle') {
    if (event.code === 'Digit1' || event.code === 'Digit2') this.send({ type: 'select-group', group: event.code === 'Digit1' ? 'Companion' : 'Troops' });
    else if (event.code === 'KeyF') this.send({ type: 'order', order: 'Follow' });
    else if (event.code === 'KeyH') { this.release(); this.send({ type: 'order', order: 'Hold' }); }
    else if (event.code === 'KeyE') this.send({ type: 'order', order: 'Engage' });
   }
  }
 }
 private down(event: PointerEvent) {
  const state = this.project();
  if (!this.available(state)) return;
  this.canvas.focus();
  if (state.placingHold) {
   if (event.button === 0) {
    const point = this.renderer.groundPoint(event.clientX, event.clientY);
    if (point) this.send({ type: 'hold-point', point });
   }
   return;
  }
  if (event.button === 1 && state.phase !== 'Travel') {
   event.preventDefault();
   if (this.dragging) return;
   if (this.lockRequested || document.pointerLockElement === this.canvas) this.release();
   else if (this.canvas.requestPointerLock) {
    this.lockRequested = true;
    try { this.canvas.requestPointerLock()?.catch(() => { this.lockRequested = false; }); }
    catch { this.lockRequested = false; }
   }
   return;
  }
  if (event.button === 1 || state.phase === 'Travel' && event.button === 2) this.orbit = true;
  else if (event.button === 0 && state.phase === 'Travel') {
   const point = this.renderer.groundPoint(event.clientX, event.clientY);
   if (point) this.send({ type: 'travel', point });
   return;
  } else if ((event.button === 0 || event.button === 2) && (state.phase === 'Setup' || state.phase === 'Battle')) {
   this.dragging = { button: event.button, x: event.clientX, y: event.clientY };
   this.send({ type: 'pointer', phase: 'down', ...this.dragging });
  } else return;
  this.pointerId = event.pointerId;
  if (document.pointerLockElement !== this.canvas) this.canvas.setPointerCapture(event.pointerId);
 }
 private move(event: PointerEvent) {
  const state = this.project();
  if (!this.available(state) || this.isUI(document.activeElement)) { this.release(); return; }
  if (state.placingHold) return;
  if (this.dragging) {
   // Pointer lock fixes client coordinates; accumulate relative motion for the same combat gesture.
   if (document.pointerLockElement === this.canvas) {
    this.dragging.x += event.movementX; this.dragging.y += event.movementY;
   } else { this.dragging.x = event.clientX; this.dragging.y = event.clientY; }
   // Additional mouse buttons produce pointermove, not another pointerdown.
   if (this.dragging.button === 0 && (event.buttons & 2)) {
    this.dragging.button = 2;
    this.send({ type: 'pointer', phase: 'down', ...this.dragging });
   } else if (!(event.buttons & (this.dragging.button === 0 ? 1 : 2))) this.endPointer();
   else this.send({ type: 'pointer', phase: 'move', ...this.dragging });
   return;
  }
  if (this.orbit) {
   if (event.buttons & 6) this.renderer.rotate(event.movementX, event.movementY);
   else this.endPointer();
  } else if (state.phase !== 'Travel' && event.buttons === 0 && event.pointerType === 'mouse') {
   this.renderer.rotate(event.movementX, event.movementY);
   this.update();
  }
 }
 private up(event: PointerEvent) {
  if (this.pointerId !== event.pointerId || this.dragging && event.button !== this.dragging.button) return;
  if (this.dragging && document.pointerLockElement !== this.canvas) { this.dragging.x = event.clientX; this.dragging.y = event.clientY; }
  this.endPointer();
 }
 private endPointer() {
  const dragging = this.dragging;
  this.dragging = null; this.orbit = false;
  if (dragging && this.enabled) this.send({ type: 'pointer', phase: 'up', ...dragging });
  const pointerId = this.pointerId;
  this.pointerId = null;
  if (pointerId !== null && this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
 }
 update() {
  if (!this.enabled) return;
  const state = this.project();
  if (!this.available(state) || this.isUI(document.activeElement)) {
   if (this.keys.size || this.dragging || this.orbit || this.lockRequested || document.pointerLockElement === this.canvas) this.release();
   return;
  }
  if (state.placingHold && (this.dragging || this.orbit || this.lockRequested || document.pointerLockElement === this.canvas)) this.release();
  if (state.phase === 'Travel') { this.lastMove = ''; return; }
  const x = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
  const z = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
  const yaw = this.renderer.facing();
  const length = Math.hypot(x, z) || 1;
  this.sendMovement({ x: (-x * Math.cos(yaw) + z * Math.sin(yaw)) / length, z: (x * Math.sin(yaw) + z * Math.cos(yaw)) / length });
 }
 private sendMovement(direction: Vec2) {
  const facing = this.renderer.facing();
  const signature = `${direction.x},${direction.z},${facing}`;
  if (signature === this.lastMove) return;
  this.lastMove = signature;
  this.send({ type: 'move', direction, facing });
 }
 private release() {
  this.keys.clear();
  this.endPointer();
  this.lockRequested = false;
  if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  const state = this.project();
  if (this.enabled && (state.phase === 'Settlement' || state.phase === 'Setup' || state.phase === 'Battle')) this.sendMovement({ x: 0, z: 0 });
 }
 dispose() { this.release(); this.abort.abort(); }
}
