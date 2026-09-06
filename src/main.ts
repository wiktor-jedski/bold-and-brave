import './style.css';
import { Simulation } from './core/simulation';
import type { ArenaMode, Command, SaveEntry, SceneId, SlotId } from './core/types';
import { GameRenderer } from './browser/renderer';
import type { StagedScene } from './browser/renderer';
import { GameUI } from './browser/ui';
import { GameInput } from './browser/input';
import { GameAudio } from './browser/audio';
import type { AudioTrace } from './browser/audio';
import { IndexedDBPersistence } from './browser/persistence';
import { FixedClock, FrameMetrics, requestPhysicalDevice } from './browser/runtime';

const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const delivery = document.querySelector<HTMLElement>('#delivery')!;
const gameplaySurfaces = [canvas, document.querySelector<HTMLElement>('#hud')!, document.querySelector<HTMLElement>('#panels')!];
const audioTrace: AudioTrace[] = [];
const audio = new GameAudio(import.meta.env.DEV ? event => audioTrace.push(event) : undefined);
const storage = new IndexedDBPersistence();
const metrics = new FrameMetrics();
let simulation: Simulation;
let renderer: GameRenderer;
let input: GameInput;
let ui: GameUI;
let device: GPUDevice;
let running = false;
let lost = false;
let loading = false;
let lastFrame = 0;
let storageBusy = false;
let frameHandle = 0;
let entries: SaveEntry[] = [];
let savingError: string | undefined;
let readyToStart = false;
let clock = new FixedClock();
let arenaFromStart = false;
const transcript: { command: Command; targetTick: number }[] = [];

function submit(command: Command, targetTick = simulation.project().tick + 1) {
 if (import.meta.env.DEV) transcript.push({ command: structuredClone(command), targetTick });
 simulation.submit(command, targetTick);
}
const escapeHTML = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function setDeliveryVisible(visible: boolean) {
 delivery.hidden = !visible;
 for (const surface of gameplaySurfaces) surface.inert = visible;
}

function showDelivery(title: string, message: string, buttons: { text: string; action: () => void }[] = []) {
 setDeliveryVisible(true);
 delivery.innerHTML = `<section class="delivery-card"><p class="eyebrow">A frontier chronicle</p><h1>Bold and Brave</h1><h2>${escapeHTML(title)}</h2><p>${escapeHTML(message)}</p><div class="delivery-actions"></div><p class="support-note">Support promise: Chromium 151.0.7922.137 · Linux x64 · NVIDIA RTX 2070 SUPER · driver 610.57.04. Keyboard and mouse. WebGPU only.</p></section>`;
 const actions = delivery.querySelector('.delivery-actions')!;
 for (const { text, action } of buttons) {
  const button = document.createElement('button'); button.textContent = text; button.addEventListener('click', action); actions.append(button);
 }
 delivery.querySelector<HTMLButtonElement>('button')?.focus();
}

function showStartMenu() {
 const actions = [
  { text: 'Start new campaign', action: () => { void begin(); } },
  { text: 'Arena practice', action: showArenaMenu },
 ];
 if (entries.some(entry => entry.slot === 'autosave' && entry.snapshot)) actions.push({ text: 'Recover autosave', action: () => { void begin('autosave'); } });
 const recoveryError = entries.find(entry => entry.slot === 'autosave')?.reason;
 const message = recoveryError
  ? `Recovery autosave unavailable: ${recoveryError} Start a new campaign to inspect or reset local saves in the Journal.`
  : 'Lead your Band to the frontier settlement, or practise real combat in the Arena. Arena battles do not change or save a campaign.';
 showDelivery(audio.state, message, actions);
}

function showArenaMenu() {
 showDelivery('Arena practice', 'Choose a Duel against one opponent, or a Team battle with a Companion and four Troops against six opponents. Use the normal weapons, guards and Command groups. Restart at any time. Your campaign and saves remain unchanged.', [
  { text: 'Duel', action: () => { void begin(undefined, 'Duel'); } },
  { text: 'Team battle', action: () => { void begin(undefined, 'Team'); } },
  { text: 'Back', action: showStartMenu },
 ]);
}

function send(command: Command) {
 if (lost || loading || !readyToStart) return;
 submit(command);
}

async function refreshStorage() {
 const result = await storage.list();
 if (result.ok) { entries = result.value!; savingError = undefined; }
 else savingError = result.error ?? 'Saving unavailable.';
 ui?.storage(entries, savingError);
}

async function restoreCampaign(slot: SlotId) {
 const saved = await storage.read(slot);
 if (!saved.ok) throw new Error(saved.error);
 const previous = simulation;
 const replacement = await Simulation.create();
 let staged: StagedScene | undefined;
 try {
  replacement.restore(saved.value);
  staged = await renderer.stage(replacement.project().campaign.scene, progress);
  if (lost) throw new Error('WebGPU device lost.');
  const state = replacement.project();
  audio.update(state);
  ui.render(state);
 } catch (error) {
  staged?.rollback();
  replacement.dispose();
  if (!lost) { audio.update(previous.project()); ui.render(previous.project()); }
  throw error;
 }
 simulation = replacement;
 staged.commit();
 previous.dispose();
 clock = new FixedClock();
 lastFrame = 0;
}

async function storageAction(action: 'save' | 'load' | 'delete' | 'reset' | 'retry', slot?: SlotId) {
 if (lost || loading || storageBusy) return;
 storageBusy = true;
 try {
  if (action === 'retry') { const result = await storage.retry(); if (!result.ok) throw new Error(result.error); await refreshStorage(); return; }
  if (simulation.project().arena || simulation.project().boundary !== 'Safe non-combat') throw new Error('Save and load are unavailable in the Arena, during battle or a Scene transition.');
  if (action === 'save' && slot && slot !== 'autosave') {
   const result = await storage.write(slot, simulation.snapshot());
   if (!result.ok) throw new Error(result.error);
   audio.play([{ tick: simulation.project().tick, type: 'save' }], simulation.project());
   ui.notify('Campaign saved.');
  } else if (action === 'load' && slot) {
   loading = true; input.enabled = false;
   try {
    await restoreCampaign(slot);
    if (lost) return;
    audio.play([{ tick: simulation.project().tick, type: 'load' }], simulation.project());
    ui.notify('Campaign loaded.');
   } finally { loading = false; input.enabled = running && !lost; if (!lost) setDeliveryVisible(false); }
  } else if (action === 'delete' && slot && slot !== 'autosave') {
   const result = await storage.delete(slot); if (!result.ok) throw new Error(result.error); ui.notify('Save slot deleted.');
  } else if (action === 'reset') {
   const result = await storage.reset(); if (!result.ok) throw new Error(result.error); ui.notify('Local campaign saves deleted. Current play is unchanged.');
  }
  await refreshStorage();
 } catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await refreshStorage();
  ui.notify(savingError === message ? '' : message);
 } finally { storageBusy = false; }
}

function progress(stage: string, fraction: number) {
 if (!lost) showDelivery('Loading Scene', `${stage} · ${Math.round(fraction * 100)}%`);
}

async function transition(scene: SceneId) {
 loading = true; input.enabled = false;
 const before = simulation.project();
 const arenaTransition = Boolean(before.arena);
 const returningToStart = Boolean(before.arena?.exiting && arenaFromStart);
 let staged: StagedScene | undefined;
 try {
  staged = await renderer.stage(scene, progress, Boolean(before.arena && !before.arena.exiting));
  if (lost) { staged.rollback(); return; }
  submit({ type: 'transition-ready' }); simulation.advance();
  const entered = simulation.project();
  if (entered.transition !== null || (entered.arena ? entered.boundary !== 'Battle and resolution' : entered.boundary !== 'Safe non-combat' || entered.campaign.scene !== scene)) {
   throw new Error('Scene state entry failed. The previous Scene is retained.');
  }
  staged.commit();
  const state = simulation.project();
  if (!arenaTransition && state.boundary === 'Safe non-combat') {
   const saved = await storage.write('autosave', simulation.snapshot());
   if (!saved.ok) savingError = saved.error ?? 'Saving unavailable.';
   await refreshStorage();
  }
  if (lost) return;
  ui.render(simulation.project());
  if (returningToStart) {
   arenaFromStart = false; running = false; input.enabled = false; loading = false;
   renderer.render(simulation.project(), 0); audio.update(simulation.project());
   clock = new FixedClock(); lastFrame = 0;
   showStartMenu();
   return;
  }
  setDeliveryVisible(false); loading = false; input.enabled = running;
 } catch (error) {
  staged?.rollback();
  if (lost) return;
  if (simulation.project().boundary === 'Transitioning') { submit({ type: 'transition-failed' }); simulation.advance(); }
  showDelivery('Load failed', error instanceof Error ? error.message : String(error), [{ text: 'Retry', action: () => {
   submit({ type: 'retry-transition' }); simulation.advance();
   void transition(scene).then(() => {
    if (!running && arenaFromStart && simulation.project().boundary === 'Battle and resolution') void begin();
   });
  } }]);
 }
}

function frame(now: number) {
 if (!running || lost) return;
 if (audio.state !== 'Audio ready') {
  running = false; input.enabled = false;
  showDelivery('Audio failed', 'Play is paused until audio is ready.', [{ text: 'Retry', action: () => { void begin(); } }]);
  return;
 }
 const elapsed = lastFrame ? (now - lastFrame) / 1000 : 0;
 lastFrame = now;
 if (!loading) {
  input.update();
  clock.advance(elapsed, () => {
   if (lost || loading) return false;
   simulation.advance();
   const state = simulation.project();
   const events = simulation.drainEvents();
   renderer.feedback(events);
   audio.play(events, state);
   if (state.boundary === 'Battle and resolution') {
    if (events.some(event => event.type === 'deadline')) ui.notify('');
   } else {
    for (const event of events) if (event.type === 'invalid' && event.message) ui.notify(event.message);
   }
   if (state.boundary === 'Transitioning' && state.transition) void transition(state.transition);
  });
  if (!lost && !loading) {
   const state = simulation.project();
   renderer.render(state, elapsed); ui.render(state); audio.update(state);
   if (state.phase === 'Battle' && !state.paused && elapsed > 0) metrics.record(elapsed * 1000);
  }
 }
 frameHandle = requestAnimationFrame(frame);
}

async function begin(slot?: SlotId, arenaMode?: ArenaMode) {
 if (!readyToStart || lost || loading || running) return;
 loading = true; input.enabled = false;
 showDelivery(audio.state, 'Preparing your Band.');
 try {
  await audio.start();
  if (audio.state !== 'Audio ready') throw new Error('Audio failed.');
  if (slot) await restoreCampaign(slot);
  if (arenaMode) {
   arenaFromStart = true;
   if (!simulation.project().arena) {
    submit({ type: 'arena-start', mode: arenaMode }); simulation.advance();
   } else if (simulation.project().boundary === 'Load failed') {
    submit({ type: 'retry-transition' }); simulation.advance();
   }
   await transition('settlement');
   if (simulation.project().boundary !== 'Battle and resolution') return;
  }
  if (lost) return;
  audio.update(simulation.project());
  setDeliveryVisible(false); running = true; input.enabled = true; lastFrame = 0;
  ui.render(simulation.project()); frameHandle = requestAnimationFrame(frame);
 } catch (error) {
  if (lost) return;
  showDelivery(audio.state === 'Audio ready' ? 'Load failed' : audio.state, error instanceof Error ? error.message : String(error), [{ text: 'Retry', action: () => { void begin(slot, arenaMode); } }]);
 } finally { loading = false; }
}

async function boot() {
 showDelivery('Checking WebGPU', 'The frontier needs a physical graphics device.');
 try {
  ({ device } = await requestPhysicalDevice());
  void device.lost.then(info => {
   lost = true; running = false; if (input) input.enabled = false; cancelAnimationFrame(frameHandle);
   audio.dispose();
   showDelivery('Device lost', `Rendering stopped. No further gameplay ticks will run. ${info.message}`, [{ text: 'Reload', action: () => location.reload() }]);
  });
  renderer = await GameRenderer.create(canvas, device);
 } catch (error) {
  if (lost) return;
  showDelivery('Unsupported', error instanceof Error ? error.message : String(error), [{ text: 'Reload', action: () => location.reload() }]); return;
 }
 if (lost) return;
 try {
  const requestedSeed = Number(new URLSearchParams(location.search).get('seed') ?? 1101);
  const seed = Number.isInteger(requestedSeed) && requestedSeed >= 0 && requestedSeed <= 0xffffffff ? requestedSeed : 1101;
  simulation = await Simulation.create(seed);
  ui = new GameUI(document.querySelector('#hud')!, document.querySelector('#panels')!, send, (action, slot) => { void storageAction(action, slot); });
  input = new GameInput(canvas, renderer, () => simulation.project(), send);
  await loadStart();
 } catch (error) {
  if (!lost) showDelivery('Load failed', error instanceof Error ? error.message : String(error), [{ text: 'Reload', action: () => location.reload() }]);
 }
}

async function loadStart() {
 loading = true;
 try {
  const staged = await renderer.stage('overworld', progress);
  if (lost) { staged.rollback(); return; }
  staged.commit();
  renderer.render(simulation.project(), 0);
  await refreshStorage();
  readyToStart = true;
  showStartMenu();
  if (import.meta.env.DEV) {
   Object.assign(window, { boldAndBrave: {
    project: () => simulation.project(), submit,
    commands: () => structuredClone(transcript),
    audioEvents: () => structuredClone(audioTrace),
    snapshot: () => simulation.snapshot(), metrics: () => metrics.report(),
    delivery: () => ({ running, lost, loading, audio: audio.state }),
    loseDevice: () => device.destroy(),
   } });
  }
 } catch (error) {
  if (!lost) showDelivery('Load failed', error instanceof Error ? error.message : String(error), [{ text: 'Retry', action: () => { void loadStart(); } }]);
 } finally { loading = false; }
}

window.addEventListener('beforeunload', () => { running = false; input?.dispose(); simulation?.dispose(); renderer?.dispose(); audio.dispose(); });
void boot();
