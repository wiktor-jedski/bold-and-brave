import { test as base, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { arch, platform, release } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import type { Command, FateChoice, Feat, Projection, Snapshot } from '../src/core/types';
import { validateSnapshot } from '../src/core/snapshot';
import { validateProjection } from '../src/scenarios/harness';
import type * as ScenarioPolicy from '../src/scenarios/run';
import type * as CombatModule from '../src/core/combat';
import type * as InterfaceModule from '../src/browser/ui';
import type { CheckpointId } from '../src/scenarios/catalog';
import type { AudioTrace } from '../src/browser/audio';

const execute = promisify(execFile);
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const promised = { browser: '151.0.7922.137', os: 'linux', arch: 'x64', gpu: 'NVIDIA GeForce RTX 2070 SUPER', driver: '610.57.04', width: 1920, height: 1080, dpr: 1 };
interface DeliveryState { running: boolean; lost: boolean; loading: boolean; audio: string }
interface BrowserMetrics { frames: number; averageMs: number; p95Ms: number; longestBelow30Seconds: number }
interface BrowserStamp { timeOrigin: number; milliseconds: number }
interface BattleObservation {
  before: Projection;
  after: Projection;
  endedAt: BrowserStamp;
  metrics: BrowserMetrics;
}
interface BrowserGame {
  project(): Projection;
  submit(command: Command, targetTick?: number): void;
  snapshot(): Snapshot;
  metrics(): BrowserMetrics;
  delivery(): DeliveryState;
  loseDevice(): void;
  commands?(): unknown[];
  audioEvents(): AudioTrace[];
}
interface Probe {
  adapterRequests: (GPURequestAdapterOptions | null)[];
  adapters: Record<string, unknown>[];
  deviceRequests: (GPUDeviceDescriptor | null)[];
  contexts: string[];
  loss: { tick: number | null; at: number } | null;
  input: unknown[];
}
declare global {
  interface Window {
    __pvs: Probe;
    boldAndBrave: BrowserGame;
    __audioSink?: MediaStreamAudioDestinationNode;
    __recording?: { stop(): void; done: Promise<string>; started: number };
  }
}
const game = (page: Page) => page.evaluate(() => window.boldAndBrave.project());
const frames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

const browserStamp = (page: Page) => page.evaluate(() => ({ timeOrigin: performance.timeOrigin, milliseconds: performance.now() }));
const elapsedSeconds = (start: BrowserStamp | null, end: BrowserStamp | null) => start && end && start.timeOrigin === end.timeOrigin ? (end.milliseconds - start.milliseconds) / 1000 : null;
async function buildIdentity() {
  const files: string[] = [];
  async function visit(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else files.push(child);
    }
  }
  await visit('src');
  files.push('package.json', 'bun.lock', 'index.html');
  const contents = await Promise.all(files.sort().map(async path => `${path}\0${hash(await readFile(path))}`));
  return { build: hash(contents.join('\n')), specificationHash: hash(await readFile('.scratch/playable-vertical-slice/spec.md')) };
}
const identity = buildIdentity();

class Evidence {
  readonly console: { type: string; text: string; location?: unknown; values?: unknown[] }[] = [];
  readonly errors: string[] = [];
  readonly checkpoints: Record<string, unknown>[] = [];
  readonly commands: { command: Command; targetTick: number }[] = [];
  readonly pendingClips: (() => Promise<void>)[] = [];
  readonly limits = [
    'These browser checks cover only their recorded assertions, not every assertion in a checkpoint.',
    'PNG and silent WebM artifacts require visual review; representative quality and audible mix are not automatically accepted.',
    'Automated input is not a human competent first-playthrough measurement; no minimum or maximum journey or battle duration bound is imposed.',
  ];
  environment: Record<string, unknown> = {};
  scenario = '';
  seed = 0;
  sessionStart: BrowserStamp | null = null;
  journeyStart: BrowserStamp | null = null;
  journeyEnd: BrowserStamp | null = null;
  battle: BattleObservation | null = null;
  recording = 'Visual evidence and configured Playwright tracing can add overhead. Session/journey elapsed time includes in-run assertion, capture and encoding work; deferred encoding after final sampling is excluded. This overhead is unquantified and not subtracted.';
  constructor(readonly page: Page, readonly info: TestInfo) {
    page.on('console', message => {
      const record = { type: message.type(), text: message.text(), location: message.location(), values: [] as unknown[] };
      this.console.push(record);
      void Promise.all(message.args().map(arg => arg.jsonValue().catch(() => '[unserializable]'))).then(values => { record.values = values; });
    });
    page.on('pageerror', error => { this.errors.push(error.stack ?? error.message); });
    page.on('requestfailed', request => this.console.push({ type: 'requestfailed', text: `${request.url()}: ${request.failure()?.errorText}` }));
  }
  async initialize() {
    await this.page.addInitScript(() => {
      const probe: Probe = window.__pvs = { adapterRequests: [], adapters: [], deviceRequests: [], contexts: [], loss: null, input: [] };
      const tick = () => window.boldAndBrave?.project().tick ?? null;
      for (const name of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'click']) {
        document.addEventListener(name, event => {
          const target = event.target instanceof Element ? event.target : null;
          probe.input.push({ type: name, observedAtTick: tick(), time: performance.now(), key: event instanceof KeyboardEvent ? event.code : undefined, x: event instanceof MouseEvent ? event.clientX : undefined, y: event instanceof MouseEvent ? event.clientY : undefined, target: target?.getAttribute('aria-label') ?? target?.textContent?.trim().slice(0, 120) });
        }, true);
      }
      const originalContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof originalContext>) {
        probe.contexts.push(args[0]);
        return Reflect.apply(originalContext, this, args);
      } as typeof originalContext;
      const gpu = navigator.gpu;
      if (!gpu) return;
      const requestAdapter = gpu.requestAdapter.bind(gpu);
      gpu.requestAdapter = async options => {
        probe.adapterRequests.push(options ?? null);
        const adapter = await requestAdapter(options);
        if (!adapter) return adapter;
        const info = adapter.info;
        probe.adapters.push({ vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description, isFallbackAdapter: info.isFallbackAdapter, maxTextureDimension2D: adapter.limits.maxTextureDimension2D, maxBindGroups: adapter.limits.maxBindGroups });
        const requestDevice = adapter.requestDevice.bind(adapter);
        adapter.requestDevice = async descriptor => {
          probe.deviceRequests.push(descriptor ?? null);
          const device = await requestDevice(descriptor);
          void device.lost.then(() => { probe.loss = { tick: tick(), at: performance.now() }; });
          return device;
        };
        return adapter;
      };
    });
    let gpu: unknown;
    try {
      gpu = (await execute('nvidia-smi', ['--query-gpu=name,driver_version', '--format=csv,noheader'])).stdout.trim().split('\n').map(row => {
        const [name, driver] = row.split(',').map(value => value.trim());
        return { name, driver };
      });
    } catch (error) { gpu = { unavailable: String(error) }; }
    this.environment = { browserVersion: this.page.context().browser()?.version(), executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', os: platform(), arch: arch(), kernel: release(), gpu, promised, ...await identity };
  }
  async open(scenario: string, seed: number) {
    this.scenario = scenario; this.seed = seed;
    await this.page.goto(`/?seed=${seed}`);
    this.sessionStart = await browserStamp(this.page);
    const dimensions = await this.page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, secure: isSecureContext, userAgent: navigator.userAgent }));
    Object.assign(this.environment, dimensions);
  }
  async start(scenario: string, seed: number) {
    await this.open(scenario, seed);
    const startButton = this.page.getByRole('button', { name: 'Start new campaign', exact: true });
    const startupFailure = this.page.getByRole('heading', { name: /^(Unsupported|Load failed)$/ });
    await expect(startButton.or(startupFailure)).toBeVisible({ timeout: 45_000 });
    expect(await startButton.isVisible(), await this.page.locator('#delivery').innerText()).toBe(true);
    await expect(this.page.getByRole('heading', { name: 'Audio not ready', exact: true })).toBeVisible();
    this.journeyStart = await browserStamp(this.page);
    await startButton.click();
    await expect.poll(() => this.page.evaluate(() => window.boldAndBrave.delivery())).toMatchObject({ running: true, lost: false, loading: false, audio: 'Audio ready' });
    const probe = await this.page.evaluate(() => window.__pvs);
    expect(probe.adapters.length, 'No observed physical WebGPU adapter').toBeGreaterThan(0);
    for (const adapter of probe.adapters) {
      expect(adapter.isFallbackAdapter).toBe(false);
      expect(JSON.stringify(adapter)).not.toMatch(/swiftshader|llvmpipe|lavapipe|software/i);
    }
    expect(probe.contexts).toContain('webgpu');
    expect(probe.contexts.filter(type => /^webgl/.test(type))).toEqual([]);
    expect(probe.adapterRequests).toContainEqual({ powerPreference: 'high-performance' });
    expect(probe.deviceRequests.length, 'No observed core WebGPU device request').toBeGreaterThan(0);
    for (const request of probe.deviceRequests) {
      expect(request?.requiredFeatures ?? []).toEqual([]);
      expect(request?.requiredLimits ?? {}).toEqual({});
    }
    expect(this.environment).toMatchObject({ width: 1920, height: 1080, dpr: 1, secure: true });
  }
  async completeJourney() {
    const state = await game(this.page);
    expect(state).toMatchObject({ phase: 'Settlement', boundary: 'Safe non-combat' });
    expect(['Resolved', 'Failed']).toContain(state.campaign.contract);
    this.journeyEnd = await browserStamp(this.page);
  }
  async submit(command: Command | Command[]) {
    const commands = Array.isArray(command) ? command : [command];
    const targetTick = await this.page.evaluate(commands => {
      const api = window.boldAndBrave;
      const targetTick = api.project().tick + 1;
      for (const command of commands) api.submit(command, targetTick);
      return targetTick;
    }, commands);
    for (const command of commands) this.commands.push({ command, targetTick });
    await expect.poll(async () => (await game(this.page)).tick).toBeGreaterThanOrEqual(targetTick);
  }
  async captureAudio() {
    await this.page.addInitScript(() => {
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (this: AudioNode, destination: AudioNode | AudioParam, ...ports: number[]) {
        const result = Reflect.apply(connect, this, [destination, ...ports]);
        if (destination === this.context.destination && this.context instanceof AudioContext) {
          const sink = this.context.createMediaStreamDestination();
          Reflect.apply(connect, this, [sink]);
          window.__audioSink = sink;
        }
        return result;
      } as typeof connect;
    });
  }
  async canvasClip(checkpoint: CheckpointId, name: string, action: () => Promise<void>, captureMode: 'action' | 'ending' = 'action') {
    const before = await this.page.evaluate(() => ({ projection: window.boldAndBrave.project(), audio: window.boldAndBrave.audioEvents() }));
    await this.page.evaluate(async captureMode => {
      if (!window.__audioSink) throw new Error('The real game audio output is not connected to capture.');
      const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
      // Headless drawImage(WebGPU canvas) can return black. Read the actual pixels
      // through the image encoder, then record them without changing game rendering.
      const recording = document.createElement('canvas');
      recording.width = canvas.width; recording.height = canvas.height;
      const context = recording.getContext('2d', { alpha: false, willReadFrequently: true })!;
      const image = new Image();
      let frame = 0, stopped = false;
      const copyFrame = async () => {
        image.src = canvas.toDataURL('image/jpeg', .95);
        await image.decode();
        if (stopped) return;
        context.drawImage(image, 0, 0);
        frame = requestAnimationFrame(() => { void copyFrame(); });
      };
      await copyFrame();
      const pixels = context.getImageData(0, 0, recording.width, recording.height).data;
      if (!pixels.some((value, index) => index % 4 !== 3 && value !== 0)) {
        stopped = true; cancelAnimationFrame(frame);
        throw new Error('The captured WebGPU canvas is black; this cannot serve as visual evidence.');
      }
      const stream = new MediaStream([...recording.captureStream(30).getVideoTracks(), ...window.__audioSink.stream.clone().getAudioTracks()]);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 128_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      const timer = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, captureMode === 'ending' ? 180_000 : 7_500);
      const done = new Promise<string>((resolve, reject) => {
        recorder.onerror = () => reject(new Error('The browser media recorder failed.'));
        recorder.onstop = () => {
          clearTimeout(timer);
          stopped = true;
          cancelAnimationFrame(frame);
          stream.getTracks().forEach(track => track.stop());
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error);
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(new Blob(chunks, { type: recorder.mimeType }));
        };
      });
      window.__recording = { done, started: performance.now(), stop: () => { if (recorder.state !== 'inactive') recorder.stop(); } };
      recorder.start();
    }, captureMode);
    let failure: unknown;
    try { await frames(this.page); await action(); await frames(this.page); }
    catch (error) { failure = error; }
    const capture = await this.page.evaluate(async () => {
      const recording = window.__recording!;
      recording.stop();
      const seconds = (performance.now() - recording.started) / 1000;
      const data = await recording.done;
      delete window.__recording;
      return { data, seconds, projection: window.boldAndBrave.project(), audio: window.boldAndBrave.audioEvents() };
    });
    const prefix = `${checkpoint}-${name}`;
    const raw = this.info.outputPath(`${prefix}-recording.webm`);
    await writeFile(raw, Buffer.from(capture.data.slice(capture.data.lastIndexOf(',') + 1), 'base64'));
    const recordedDuration = Number((await execute('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', raw])).stdout);
    const offsetSeconds = captureMode === 'ending' ? Math.max(0, recordedDuration - 7.5) : 0;
    // A low-health enemy can still defend for many seconds. Record the real ending,
    // then select its final uninterrupted window instead of predicting a kill time.
    const encoding = captureMode === 'ending'
      ? ['-ss', String(offsetSeconds), '-t', '7.5', '-vf', 'fps=30', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '6', '-crf', '32', '-b:v', '0', '-c:a', 'libopus']
      : ['-c', 'copy'];
    await execute('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, ...encoding, this.info.outputPath(`${prefix}.webm`)]);
    await rm(raw);
    const media = JSON.parse((await execute('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', this.info.outputPath(`${prefix}.webm`)])).stdout) as { streams: { codec_type: string }[]; format: { duration: string } };
    const duration = Number(media.format.duration);
    await writeFile(this.info.outputPath(`${prefix}.json`), JSON.stringify({ before, after: { projection: capture.projection, audio: capture.audio }, captureSeconds: capture.seconds, clipWindow: { captureMode, offsetSeconds, recordedDuration, stateCoverage: 'States bracket the source recording; the clip window may contain only its ending.' }, media }, null, 2));
    this.checkpoints.push({ checkpoint, name, scenario: this.scenario, seed: this.seed, tick: capture.projection.tick, artifactType: 'webm', artifactPath: `${prefix}.webm`, statePath: `${prefix}.json`, durationSeconds: duration, audio: 'real game master output', surface: 'WebGPU pixels read through the image encoder; DOM panels are not in this capture', visualAssessment: 'unreviewed', actualAssertionResults: failure ? 'failed' : 'capture completed; associated assertions define coverage' });
    expect(capture.seconds, 'The action must complete before the source recorder stops').toBeLessThan(captureMode === 'ending' ? 180 : 7.5);
    expect(duration).toBeGreaterThan(0);
    expect(duration).toBeLessThanOrEqual(8);
    expect(media.streams.map(stream => stream.codec_type).sort()).toEqual(['audio', 'video']);
    if (failure) throw failure;
  }

  async checkpoint(id: CheckpointId, name: string, expected: string[], assert: (state: Projection | null) => Promise<void> | void, visual = true) {
    const prefix = `${String(this.checkpoints.length + 1).padStart(2, '0')}-${id}-${name}`;
    const state = await this.page.evaluate(() => {
      const api = window.boldAndBrave;
      return api ? { projection: api.project(), snapshot: api.project().boundary === 'Safe non-combat' ? api.snapshot() : null, delivery: api.delivery(), metrics: api.metrics(), commands: api.commands?.(), audio: api.audioEvents(), probe: window.__pvs } : null;
    });
    if (state?.snapshot) validateSnapshot(state.snapshot);
    if (state) validateProjection(state.projection);
    const statePath = `${prefix}.json`;
    await writeFile(this.info.outputPath(statePath), JSON.stringify(state, null, 2));
    const result: Record<string, unknown> = { checkpoint: id, name, scenario: this.scenario, seed: this.seed, tick: state?.projection.tick ?? null, expectedAssertions: expected, actualAssertionResults: 'failed', statePath, snapshotKind: state?.snapshot ? 'validated campaign snapshot and projection' : 'projection or delivery only; save-unsafe state is not serialized as a campaign save', outcome: state?.projection.outcome ?? null, artifactType: visual ? 'png' : 'none', artifactPath: visual ? `${prefix}.png` : 'none', visualAssessment: visual ? 'unreviewed' : 'not applicable', frameMetrics: state?.metrics ?? null };
    this.checkpoints.push(result);
    try { await assert(state?.projection ?? null); result.actualAssertionResults = 'passed'; }
    catch (error) { result.failure = String(error); throw error; }
    finally {
      if (visual) {
        await frames(this.page);
        if (state && !state.delivery.lost && !state.delivery.loading) {
          const pixels = await this.page.evaluate(() => document.querySelector<HTMLCanvasElement>('#world')!.toDataURL());
          await writeFile(this.info.outputPath(`${prefix}-canvas.png`), Buffer.from(pixels.split(',')[1], 'base64'));
          result.canvasArtifactPath = `${prefix}-canvas.png`;
          result.canvasCapture = 'Direct WebGPU canvas export; no DOM. Full-page capture can omit the GPU surface in headless Chromium.';
          await this.page.evaluate(async pixels => {
            const image = new Image();
            image.id = '__pvs-frame-readback';
            image.setAttribute('aria-hidden', 'true');
            image.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:0;pointer-events:none';
            image.src = pixels;
            await image.decode();
            document.querySelector('#world')!.after(image);
          }, pixels);
          result.compositeCapture = 'Actual DOM over a decoded copy of the WebGPU frame. The original canvas stays alive; the capture-only image is removed immediately.';
        }
        try { await this.page.screenshot({ path: this.info.outputPath(`${prefix}.png`) }); }
        finally { await this.page.evaluate(() => document.getElementById('__pvs-frame-readback')?.remove()); }
      }
    }
  }
  async clip(checkpoint: CheckpointId, name: string, action: () => Promise<void>, captureMode: 'action' | 'ending' = 'action') {
    const before = await this.page.evaluate(() => ({ projection: window.boldAndBrave?.project(), delivery: window.boldAndBrave?.delivery(), commands: window.boldAndBrave?.commands?.() }));
    const captured: { data: string; time: number }[] = [];
    const start = performance.now();
    const captureLimit = captureMode === 'ending' ? 600_000 : 7_500;
    // Headless CDP screencasts can retain a stale GPU/DOM composite. Sample the
    // same real-canvas readback used by PNG evidence instead of accepting it.
    const capture = async () => {
      await this.page.evaluate(async () => {
        const canvas = document.querySelector<HTMLCanvasElement>('#world');
        if (!canvas) return;
        let image = document.querySelector<HTMLImageElement>('#__pvs-clip-readback');
        if (!image) {
          image = new Image();
          image.id = '__pvs-clip-readback';
          image.setAttribute('aria-hidden', 'true');
          image.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:0;pointer-events:none';
          canvas.after(image);
        }
        image.src = canvas.toDataURL('image/jpeg', .95);
        await image.decode();
      });
      const pixels = await this.page.screenshot({ type: 'jpeg', quality: 85, timeout: 5_000 });
      captured.push({ data: pixels.toString('base64'), time: (performance.now() - start) / 1000 });
      // Retain only the final window of an unpredictable natural outcome.
      if (captureMode === 'ending') {
        const cutoff = captured[captured.length - 1].time - 6.8;
        while (captured.length > 1 && captured[0].time < cutoff) captured.shift();
      }
    };
    let recording = true;
    let failure: unknown;
    await capture();
    const sampling = (async () => {
      while (recording && performance.now() - start < captureLimit) {
        await capture();
        await delay(40);
      }
    })();
    // Observe sampling errors immediately; report them after the action cleanup.
    const sampled = sampling.then(() => null, (error: unknown) => error);
    try {
      await frames(this.page); await action(); await frames(this.page);
      if (captureMode === 'ending') await delay(600);
    }
    catch (error) { failure = error; }
    finally {
      recording = false;
      const captureFailure = await sampled;
      try {
        if (captureFailure) throw captureFailure;
        if (performance.now() - start < captureLimit) await capture();
      } catch (error) { failure ??= error; }
      finally { await this.page.evaluate(() => document.getElementById('__pvs-clip-readback')?.remove()); }
    }
    const duration = (performance.now() - start) / 1000;
    const after = await this.page.evaluate(() => ({ projection: window.boldAndBrave?.project(), delivery: window.boldAndBrave?.delivery(), commands: window.boldAndBrave?.commands?.(), metrics: window.boldAndBrave?.metrics() }));
    if (after.projection) validateProjection(after.projection);
    if (duration >= captureLimit / 1000 && !failure) failure = new Error(`${name}: the transition did not settle within the evidence capture window. The game itself has no load-time limit; this clip cannot substantiate the complete transition.`);
    this.pendingClips.push(async () => {
      const folder = this.info.outputPath(`${checkpoint}-${name}-frames`);
      const output = `${checkpoint}-${name}.webm`;
      const statePath = `${checkpoint}-${name}-transition.json`;
      await writeFile(this.info.outputPath(statePath), JSON.stringify({
        before, after, captureSeconds: duration,
        clipWindow: { captureMode, offsetSeconds: captured[0]?.time, endSeconds: captured[captured.length - 1]?.time,
          stateCoverage: 'States bracket the complete action; ending mode retains only its final uninterrupted window.' },
      }, null, 2));
      await mkdir(folder, { recursive: true });
      if (captured.length < 2) throw new Error(`Cannot substantiate transition ${name}: fewer than two browser frames captured. ${failure ?? ''}`);
      const lines: string[] = [];
      for (let index = 0; index < captured.length; index++) {
        const filename = `frame-${index}.jpg`;
        await writeFile(join(folder, filename), Buffer.from(captured[index].data, 'base64'));
        lines.push(`file '${filename}'`, `duration ${Math.max(0.001, (captured[index + 1]?.time ?? captured[index].time + 1 / 30) - captured[index].time)}`);
      }
      lines.push(`file 'frame-${captured.length - 1}.jpg'`);
      await writeFile(join(folder, 'frames.txt'), lines.join('\n'));
      await execute('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(folder, 'frames.txt'), '-t', '7.5', '-an', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-crf', '34', '-b:v', '0', '-pix_fmt', 'yuv420p', this.info.outputPath(output)]);
      const encodedDuration = Number((await execute('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', this.info.outputPath(output)])).stdout.trim());
      expect(encodedDuration, 'WebM duration must be measured and at most eight seconds').toBeLessThanOrEqual(8);
      expect(encodedDuration).toBeGreaterThan(0);
      await rm(folder, { recursive: true });
      this.checkpoints.push({ checkpoint, name, scenario: this.scenario, seed: this.seed, tick: after.projection?.tick ?? null, statePath, outcome: after.projection?.outcome ?? null, inputTranscriptHash: hash(JSON.stringify(after.commands ?? [])), expectedAssertions: ['Context, input, outcome and settled result fit in an at-most-eight-second transition clip.'], frameMetrics: after.metrics ?? null, artifactType: 'webm', artifactPath: output, durationSeconds: encodedDuration, captureSeconds: duration, audio: 'none', visualAssessment: 'unreviewed', actualAssertionResults: failure ? 'failed' : 'transition action completed; see associated assertions', failure: failure ? String(failure) : undefined });
    });
    if (failure) throw failure;
  }
  async finish() {
    let runtime: { probe: Probe; projection?: Projection; delivery?: DeliveryState; commands?: unknown[]; metrics?: BrowserMetrics; audio?: AudioTrace[] } | null = null;
    let sessionEnd: BrowserStamp | null = null;
    try {
      runtime = await this.page.evaluate(() => {
        const api = window.boldAndBrave;
        return { probe: window.__pvs, projection: api?.project(), delivery: api?.delivery(), commands: api?.commands?.(), metrics: api?.metrics(), audio: api?.audioEvents() };
      });
      sessionEnd = await browserStamp(this.page);
      if (this.info.status !== this.info.expectedStatus) {
        await frames(this.page);
        await this.page.screenshot({ path: this.info.outputPath('failure.png') });
      }
    } catch (error) { this.limits.push(`Final browser diagnostics unavailable: ${error}`); }
    let encodingFailure: unknown;
    for (const encode of this.pendingClips) {
      try { await encode(); }
      catch (error) { encodingFailure = error; this.limits.push(`Transition evidence encoding failed: ${error}`); }
    }
    const transcript = { publicCommands: this.commands, battleObservation: this.battle, runtime };
    await writeFile(this.info.outputPath('input-and-final-state.json'), JSON.stringify(transcript, null, 2));
    await writeFile(this.info.outputPath('console.json'), JSON.stringify({ console: this.console, pageErrors: this.errors }, null, 2));
    const durationEvidence = {
      input: 'automated Playwright UI inputs and ordinary public commands; not a human first playthrough',
      acceptance: 'record only; watchdog expiry is a harness failure, never a duration acceptance failure',
      clock: 'Chromium performance.now() milliseconds relative to the recorded performance.timeOrigin',
      session: { start: this.sessionStart, end: sessionEnd, elapsedSeconds: elapsedSeconds(this.sessionStart, sessionEnd), boundaries: 'After initial page navigation through final browser diagnostics; excludes initial navigation and deferred artifact encoding.' },
      completeJourney: { start: this.journeyStart, end: this.journeyEnd, elapsedSeconds: elapsedSeconds(this.journeyStart, this.journeyEnd), completed: this.journeyEnd !== null, boundaries: 'Immediately before Start new campaign through the first asserted save-safe changed-settlement return, including preparation, travel, combat and resolution. Null end means no complete journey was recorded.' },
      battle: {
        unpausedElapsedSeconds: runtime?.metrics ? runtime.metrics.frames * runtime.metrics.averageMs / 1000 : null,
        source: 'Sum of actual delivered Battle frame intervals, reconstructed as FrameMetrics.frames × averageMs / 1000; never Simulation ticks.',
        boundaries: 'Runtime samples rendered frames whose resulting phase is Battle and paused is false; separately sampled setup, paused, loading and resolution frames are excluded, subject to the boundary precision below.',
        terminalObservation: this.battle ? { at: this.battle.endedAt, outcome: this.battle.after.outcome, phase: this.battle.after.phase } : null,
        frameMetrics: runtime?.metrics ?? null,
      },
      simulationOnly: { tick: this.battle?.after.tick ?? runtime?.projection?.tick ?? null, battleTimeSeconds: this.battle?.after.battleTime ?? runtime?.projection?.battleTime ?? null, meaning: 'Simulation time, not measured real elapsed time; may reset on settlement return.' },
      recordingOverhead: this.recording,
      measurementLimits: [
        'Browser round trips and rendered-frame observations lag the exact command/phase boundary. FrameMetrics can include the interval entering Battle or leaving pause and omit the terminal interval; boundary precision is one delivered frame, not an exact Simulation tick.',
        'FrameMetrics are cumulative in the current document only; reload resets them. Elapsed values are null across different time origins rather than subtracting unrelated monotonic clocks.',
        'Automated decisions, browser scheduling, instrumentation and hardware load affect these observations. No human pacing, learning time or uninstrumented duration is inferred.',
      ],
    };
    const manifest = { ...this.environment, scenario: this.scenario, seed: this.seed, reset: 'fresh isolated Playwright browser context; reload with explicit seed', test: this.info.title, status: encodingFailure ? 'failed' : this.info.status, acceptance: 'partial browser evidence; not a blanket checkpoint or representative-quality acceptance', renderBackend: runtime?.probe.contexts.includes('webgpu') ? 'observed WebGPU canvas' : 'unobserved', inputTranscriptHash: hash(JSON.stringify(runtime?.commands ?? this.commands)), inputTranscriptPath: 'input-and-final-state.json', consolePath: 'console.json', failures: this.info.errors.map(error => ({ message: error.message, stack: error.stack })), failureArtifact: this.info.status !== this.info.expectedStatus ? 'failure.png' : 'none', durationEvidence, checkpoints: this.checkpoints, limitations: this.limits };
    await writeFile(this.info.outputPath('manifest.json'), JSON.stringify(manifest, null, 2));
    await this.info.attach('evidence-manifest', { path: this.info.outputPath('manifest.json'), contentType: 'application/json' });
    if (encodingFailure) throw encodingFailure;
  }
}

const test = base.extend<{ evidence: Evidence }>({
  evidence: async ({ page }, use, info) => {
    await mkdir(info.outputPath(), { recursive: true });
    const evidence = new Evidence(page, info);
    await evidence.initialize();
    try { await use(evidence); expect(evidence.errors, 'Unexpected uncaught browser errors; see console.json').toEqual([]); }
    finally { await evidence.finish(); }
  },
});

async function enterSettlement(evidence: Evidence) {
  await evidence.page.locator('#world').focus();
  await evidence.page.keyboard.press('4');
  await evidence.submit({ type: 'travel', point: { x: 0, z: 0 } });
  await expect.poll(async () => (await game(evidence.page)).phase, { timeout: 45_000 }).toBe('Settlement');
  await expect.poll(async () => (await game(evidence.page)).boundary).toBe('Safe non-combat');
  await expect.poll(() => evidence.page.evaluate(() => window.boldAndBrave.delivery().loading)).toBe(false);
  await expect(evidence.page.locator('#delivery')).toBeHidden();
}
async function journal(page: Page) {
  if (!(await game(page)).journalOpen) await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Journal', exact: true })).toBeVisible();
}
async function recruit(page: Page, candidateId: string) {
  await journal(page);
  const before = await game(page);
  page.once('dialog', dialog => { void dialog.dismiss(); });
  await page.locator(`[data-focus="recruit-${candidateId}"]`).click();
  expect((await game(page)).campaign).toEqual(before.campaign);
  page.once('dialog', dialog => { void dialog.accept(); });
  await page.locator(`[data-focus="recruit-${candidateId}"]`).click();
  await expect.poll(async () => (await game(page)).campaign.coin).toBe(before.campaign.coin - 25);
}
async function acceptContract(page: Page) {
  if ((await game(page)).journalOpen) {
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await game(page)).journalOpen).toBe(false);
  }
  await page.getByRole('button', { name: /Talk.*Mara Venn/ }).click();
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect.poll(async () => (await game(page)).campaign.contract).toBe('Accepted');
}
async function bridgeSetup(evidence: Evidence) {
  await acceptContract(evidence.page);
  for (let hour = 0; hour < 11; hour++) await evidence.submit({ type: 'wait' });
  await evidence.clip('CP-FLOW-EARLY', 'deadline-to-setup', async () => {
    await evidence.page.getByRole('button', { name: 'Wait', exact: true }).click();
    await expect.poll(async () => (await game(evidence.page)).phase).toBe('Setup');
  });
}

async function lateBattle(evidence: Evidence) {
  const page = evidence.page;
  await acceptContract(page);
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect.poll(async () => (await game(page)).phase).toBe('Travel');
  await expect.poll(async () => (await game(page)).boundary).toBe('Safe non-combat');
  await evidence.submit({ type: 'speed', speed: 4 });
  await evidence.submit({ type: 'travel', point: { x: 0, z: 2.1 } });
  await expect.poll(async () => {
    const state = await game(page);
    return state.campaign.time >= (state.campaign.deadline ?? Infinity);
  }, { timeout: 30_000 }).toBe(true);
  await evidence.checkpoint('CP-FLOW-LATE', 'deadline-outside', ['Passing the deadline outside leaves Overworld travel active and contract Accepted.'], state => {
    expect(state).toMatchObject({ phase: 'Travel', outcome: null });
    expect(state?.campaign.contract).toBe('Accepted');
    expect(state?.campaign.time).toBeGreaterThanOrEqual(state!.campaign.deadline!);
  }, false);
  await evidence.submit({ type: 'travel', point: { x: 0, z: 0 } });
  await expect.poll(async () => (await game(page)).campaign.position.z, { timeout: 30_000 }).toBeLessThan(0.8);
  await evidence.clip('CP-FLOW-LATE', 'boundary-to-center-battle', async () => {
    await expect.poll(async () => (await game(page)).phase).toBe('Battle');
  });
}

async function fightBattle(evidence: Evidence, policy: 'fight' | 'passive' | 'resident-loss' = 'fight') {
  // Observe the live render loop; only the real app advances Simulation.
  evidence.battle = await evidence.page.evaluate(async policy => {
    // Vite must load this policy in Chromium; a static test import would execute in Node.
    const modulePath = '/src/scenarios/run.ts';
    const { fightCommands }: typeof ScenarioPolicy = await import(modulePath);
    return await new Promise<BattleObservation>((resolve, reject) => {
      let active = true;
      let nextDecision = 0;
      let before = window.boldAndBrave.project();
      let waypoint = 0;
      const route = [{ x: 20, z: 17 }, { x: 18, z: 17 }, { x: 18, z: 4.5 }, { x: 20, z: 4.5 }];
      const timer = setTimeout(() => {
        active = false;
        reject(new Error('Harness watchdog expired while observing the live battle; outcome is unresolved, no duration acceptance bound or forced result applies.'));
      }, 600_000);
      const control = () => {
        if (!active) return;
        const state = window.boldAndBrave.project();
        if (state.phase !== 'Battle') {
          active = false; clearTimeout(timer);
          resolve({ before, after: state, endedAt: { timeOrigin: performance.timeOrigin, milliseconds: performance.now() }, metrics: window.boldAndBrave.metrics() });
          return;
        }
        before = state;
        if (state.tick >= nextDecision) {
          if (policy === 'fight') {
            for (const command of fightCommands(state)) window.boldAndBrave.submit(command);
          } else if (policy === 'resident-loss') {
            const player = state.combatants.find(actor => actor.role === 'Player')!;
            if (Math.hypot(route[waypoint]!.x - player.position.x, route[waypoint]!.z - player.position.z) < 1) waypoint = (waypoint + 1) % route.length;
            const dx = route[waypoint]!.x - player.position.x;
            const dz = route[waypoint]!.z - player.position.z;
            const distance = Math.hypot(dx, dz);
            window.boldAndBrave.submit({ type: 'move', direction: { x: dx / distance, z: dz / distance }, facing: Math.atan2(dx, dz) });
          }
          nextDecision = state.tick + (policy === 'resident-loss' ? 6 : 1);
        }
        requestAnimationFrame(control);
      };
      control();
    });
  }, policy);
}

async function expectFacts(root: Locator, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    await expect(root.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]')).toHaveText(value);
  }
}

async function returnedEvidence(evidence: Evidence, choice: FateChoice | 'Failed', condition: 'Safe' | 'Damaged', feat: Feat | null) {
  const page = evidence.page;
  const checkpoint: CheckpointId = choice === 'Failed' ? 'CP-REL-FAILURE' : choice === 'Capture' ? 'CP-REL-CAPTURE' : choice === 'Execute' ? 'CP-REL-EXECUTE' : 'CP-REL-RELEASE';
  const failed = choice === 'Failed';
  const giver = { disposition: failed || choice === 'Execute' ? 'Hostile' : 'Friendly', grievances: failed ? ['Settlement harmed'] : choice === 'Execute' ? ['Agent executed'] : [] };
  const resident = { disposition: failed ? 'Hostile' : choice === 'Release' ? 'Neutral' : 'Friendly', grievances: failed ? ['Settlement harmed'] : [] };
  const enemy = { fate: choice === 'Capture' ? 'Captive' : choice === 'Execute' ? 'Executed' : 'Active', disposition: failed ? 'Hostile' : choice === 'Release' ? 'Neutral' : undefined, grievances: choice === 'Capture' ? ['Agent captured'] : [] };
  await page.locator('#world').focus();
  await page.mouse.move(500, 540);
  // Passive mouse movement turns the camera. Do not enter persistent pointer lock
  // before the following dialogue clicks.
  await page.mouse.move(condition === 'Damaged' ? 168 : 1300, 540, { steps: 12 });
  await evidence.checkpoint(checkpoint, 'changed-settlement', ['The real return preserves exact fate, Disposition, Grievances, Feat, Local Contract state and Settlement condition.'], state => {
    expect(state).toMatchObject({ phase: 'Settlement', boundary: 'Safe non-combat' });
    expect(state?.campaign).toMatchObject({ contract: failed ? 'Failed' : 'Resolved', condition, enemyChoice: failed ? null : choice, feat });
    expect(state?.campaign.agents.map(agent => ({ id: agent.id, fate: agent.fate, disposition: agent.disposition, grievances: agent.grievances }))).toEqual([
      { id: 'giver', fate: 'Active', ...giver },
      { id: 'resident-agent', fate: 'Active', ...resident },
      { id: 'enemy', ...enemy },
    ]);
  });
  for (const [index, agent] of ['giver', 'resident'].entries()) {
    await page.locator(`[data-focus="talk-${agent}"]`).click();
    await evidence.checkpoint(checkpoint, `${agent}-reaction`, ['Returned dialogue exposes the exact Agent relationship; its recorded explanation is assessed visually, not by fixed prose wording.'], async () => {
      const relationship = index === 0 ? giver : resident;
      await expectFacts(page.locator('.game-panel'), { 'Agent fate': 'Active', Disposition: relationship.disposition, Grievances: relationship.grievances.join(' · ') || 'None' });
    });
    await page.locator('[data-focus="close-panel"]').click();
  }
  await journal(page);
  await page.getByRole('heading', { name: 'Persistent consequences', exact: true }).evaluate(heading => heading.parentElement!.scrollIntoView({ block: 'start' }));
  await evidence.checkpoint(checkpoint, 'persistent-journal', ['Journal exposes the resolved fate, Captives, losses and all three Agent relationships; preparation is closed.'], async state => {
    const campaign = state!.campaign;
    await expectFacts(page.locator('.game-panel'), {
      'Settlement condition': condition, 'Raid location': campaign.raidLocation!,
      'Enemy Agent choice': failed ? 'Not resolved' : choice,
      'Ordinary-bandit choice': campaign.banditChoice ?? 'Not resolved',
      'Downed ordinary bandits': String(campaign.banditDowned), 'Killed ordinary bandits': String(campaign.banditKilled),
      Captives: String(choice === 'Capture' ? 1 + campaign.banditDowned : 0),
      'Resident casualties': `${campaign.casualties.residents} of 5`,
    });
    for (const [name, relationship] of [['Mara Venn', { fate: 'Active', ...giver }], ['Oren Reed', { fate: 'Active', ...resident }], ['Aldric Vale', enemy]] as const) {
      const record = page.locator('.agent-record').filter({ has: page.getByRole('heading', { name, exact: true }) });
      await expectFacts(record, { 'Agent fate': relationship.fate, Grievances: relationship.grievances.join(' · ') || 'None' });
      if (relationship.disposition) await expectFacts(record, { Disposition: relationship.disposition });
      else await expect(record.locator('dt').filter({ hasText: /^Disposition$/ })).toHaveCount(0);
    }
    if (feat) await expect(page.getByRole('heading', { name: feat, exact: true })).toBeVisible();
    for (const button of await page.locator('[data-focus^="recruit-"]').all()) await expect(button).toBeDisabled();
  });
}

async function resolveJourney(evidence: Evidence, choice: FateChoice, feat: Feat, late: boolean) {
  const page = evidence.page;
  const condition = late ? 'Damaged' : 'Safe';
  const relationship: CheckpointId = choice === 'Capture' ? 'CP-REL-CAPTURE' : choice === 'Execute' ? 'CP-REL-EXECUTE' : 'CP-REL-RELEASE';
  await evidence.checkpoint(late ? 'CP-FLOW-LATE' : 'CP-FLOW-EARLY', 'natural-victory', ['The live public-command battle naturally reaches Agent fate, not a substituted outcome.'], state => {
    expect(state).toMatchObject({ phase: 'Agent fate', outcome: 'Victory' });
    expect(state?.campaign).toMatchObject({ contract: 'Resolved', condition, enemyChoice: null, feat: null });
    expect(state?.combatants.filter(actor => actor.team === 'Raiders' && actor.status === 'Active')).toHaveLength(0);
  });
  const before = (await game(page)).campaign;
  await page.locator(`[data-focus="fate-${choice}"]`).click();
  await expect.poll(async () => (await game(page)).pendingChoice).toBe(choice);
  await evidence.checkpoint(relationship, `${choice.toLowerCase()}-choice`, ['The selected Agent fate remains pending; no campaign consequence occurs before confirmation.'], state => {
    expect(state).toMatchObject({ phase: 'Agent fate', pendingChoice: choice });
    expect(state?.campaign).toEqual(before);
  });
  await evidence.clip('CP-UI-FATE', `${choice.toLowerCase()}-confirmation`, async () => {
    await page.locator('[data-focus="confirm-fate"]').click();
    await expect.poll(async () => (await game(page)).campaign.enemyChoice).toBe(choice);
  });
  if (before.banditDowned > 0) {
    await expect.poll(async () => (await game(page)).phase).toBe('Bandit fate');
    const agents = (await game(page)).campaign.agents;
    await page.locator(`[data-focus="fate-${choice}"]`).click();
    await expect.poll(async () => (await game(page)).pendingChoice).toBe(choice);
    await evidence.checkpoint(relationship, 'ordinary-survivor-choice', ['Downed ordinary survivors receive a separate pending choice; named-Agent consequences are unchanged.'], state => {
      expect(state).toMatchObject({ phase: 'Bandit fate', pendingChoice: choice });
      expect(state?.campaign.banditChoice).toBeNull();
      expect(state?.campaign.agents).toEqual(agents);
    });
    await page.locator('[data-focus="confirm-fate"]').click();
    await expect.poll(async () => (await game(page)).phase).toBe('Summary');
    expect((await game(page)).campaign.agents).toEqual(agents);
  }
  await evidence.checkpoint('CP-SPEC-END-TO-END', 'victory-summary', ['Summary reports this exact confirmed fate, ordinary survivor decision, Captives, real losses and Settlement condition.'], async state => {
    const campaign = state!.campaign;
    expect(state).toMatchObject({ phase: 'Summary', outcome: 'Victory' });
    expect(campaign.banditDowned + campaign.banditKilled).toBe(5);
    expect(campaign.banditChoice).toBe(before.banditDowned > 0 ? choice : null);
    expect(campaign.captives).toBe(choice === 'Capture' ? 1 + campaign.banditDowned : 0);
    expect(campaign.casualties).toEqual({
      band: state!.combatants.filter(actor => actor.team === 'Band' && actor.status !== 'Active').map(actor => actor.id),
      residents: state!.combatants.filter(actor => actor.role === 'Resident' && actor.status !== 'Active').length,
    });
    await expectFacts(page.locator('.game-panel'), {
      Outcome: 'Victory', 'Local Contract state': 'Resolved', 'Settlement condition': condition,
      'Enemy Agent': `Aldric Vale — ${choice === 'Capture' ? 'Captive' : choice === 'Execute' ? 'Executed' : 'Active'} (${choice})`,
      'Ordinary bandits': `${campaign.banditKilled} killed; ${campaign.banditDowned} Downed${campaign.banditChoice ? ` — ${choice}` : '; no survivor choice'}`,
      Captives: String(campaign.captives), 'Resident casualties': `${campaign.casualties.residents} of 5`,
    });
  });
  await page.locator('[data-focus="continue-summary"]').click();
  await expect.poll(async () => (await game(page)).phase).toBe('Feat');
  await page.locator(`[data-focus="feat-${feat}"]`).click();
  await expect.poll(async () => (await game(page)).phase).toBe('Settlement');
  await evidence.completeJourney();
  await returnedEvidence(evidence, choice, condition, feat);
}

test('promised support row is measured, never inferred from installed Chromium', async ({ evidence }) => {
  await evidence.start('SCN-15-WEBGPU-STARTUP-LOAD', 1801);
  await evidence.checkpoint('CP-SUPPORT-GATE', 'promised-environment', ['Exact promised browser, platform, GPU, driver, viewport and DPR are observed; no software renderer.'], () => {
    expect(String(evidence.environment.browserVersion).replace(/^Chrome\//, ''), 'A different Chromium patch is diagnostic evidence only and cannot accept the promised .137 row.').toBe(promised.browser);
    expect(evidence.environment).toMatchObject({ os: promised.os, arch: promised.arch, width: 1920, height: 1080, dpr: 1 });
    expect(evidence.environment.gpu).toContainEqual({ name: promised.gpu, driver: promised.driver });
  });
});

test('new campaign, confirmed recruitment, actual travel, offer, and timed bridge entry', async ({ evidence, page }) => {
  await evidence.start('SCN-01-FULL-EARLY-RELEASE', 1101);
  await journal(page);
  await evidence.checkpoint('CP-PREP-RECRUIT', 'before-recruitment', ['100 Coin, 10.0 Provisions, player and Companion; four Journal candidates.'], async state => {
    expect(state?.campaign).toMatchObject({ coin: 100, provisions: 10, contract: 'Available', deadline: null, position: { x: 0, z: 2 } });
    expect(state?.campaign.members.map(member => member.role)).toEqual(['Player', 'Companion']);
    expect(await page.getByRole('button', { name: 'Recruit', exact: true }).count()).toBe(4);
  });
  await recruit(page, 'troop-1');
  await recruit(page, 'troop-2');
  await evidence.checkpoint('CP-PREP-RECRUIT', 'default-preparation', ['Two confirmed staff Troops cost exactly 50 Coin.'], state => {
    expect(state?.campaign.coin).toBe(50);
    expect(state?.campaign.members.filter(member => member.role === 'Troop').map(member => ({ id: member.id, weapon: member.weapon, shield: member.shield }))).toEqual([{ id: 'troop-1', weapon: 'Staff', shield: false }, { id: 'troop-2', weapon: 'Staff', shield: false }]);
  });
  await page.keyboard.press('Escape');
  await evidence.submit({ type: 'travel', point: { x: 0, z: 0 } });
  // Public travel input does not perform the canvas focus of a real map click.
  await page.locator('#world').focus();
  await evidence.clip('CP-FLOW-CONTRACT', 'pause-and-speed', async () => {
    await page.keyboard.press('Space');
    await expect.poll(async () => (await game(page)).paused).toBe(true);
    const paused = (await game(page)).campaign;
    await frames(page);
    expect((await game(page)).campaign).toEqual(paused);
    for (const speed of [1, 2, 3, 4]) {
      await page.keyboard.press(String(speed));
      await expect.poll(async () => ({ speed: (await game(page)).speed, paused: (await game(page)).paused })).toEqual({ speed, paused: false });
    }
  });
  await expect.poll(async () => (await game(page)).phase, { timeout: 45_000 }).toBe('Settlement');
  await expect.poll(async () => (await game(page)).boundary).toBe('Safe non-combat');
  await page.getByRole('button', { name: /Talk.*Mara Venn/ }).click();
  await expect.poll(async () => (await game(page)).offerOpen).toBe(true);
  await evidence.checkpoint('CP-FLOW-CONTRACT', 'offer', ['Offer precedes acceptance and exposes objective, enemy, five bandits, one Feat, 0 Coin, settlement risk.'], async state => {
    expect(state?.offerOpen).toBe(true);
    expect(state?.campaign).toMatchObject({ contract: 'Available', deadline: null });
    const text = await page.locator('#panels').innerText();
    for (const pattern of [/bridge/i, /Aldric Vale/, /five.*bandits/i, /one Feat/i, /0 Coin/, /Damaged/, /Available/]) expect(text).toMatch(pattern);
  });
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  expect((await game(page)).campaign).toMatchObject({ contract: 'Available', deadline: null });
  await bridgeSetup(evidence);
  await evidence.checkpoint('CP-FLOW-EARLY', 'bridge-setup', ['Settlement deadline starts bridge setup with disabled saving and six raiders/five residents.'], state => {
    expect(state).toMatchObject({ phase: 'Setup', boundary: 'Battle and resolution' });
    expect(state?.campaign.raidLocation).toBe('Bridge');
    expect(state?.campaign.time).toBe(state?.campaign.deadline);
    expect(state?.setupRemaining).toBeGreaterThan(10);
    expect(state?.setupRemaining).toBeLessThanOrEqual(15);
    expect(state?.combatants.filter(actor => actor.team === 'Raiders')).toHaveLength(6);
    expect(state?.combatants.filter(actor => actor.role === 'Resident')).toHaveLength(5);
  });
  await expect.poll(async () => (await game(page)).phase, { timeout: 30_000 }).toBe('Battle');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toBeVisible();
  await evidence.checkpoint('CP-SAVE-BOUNDARY', 'battle-save-disabled', ['Battle/pause/Journal never enables manual save or load.'], async state => {
    expect(state?.boundary).toBe('Battle and resolution');
    const actions = page.locator('[data-focus^="save-"], [data-focus^="load-"]:not([data-focus="load-autosave"])');
    expect(await actions.count()).toBe(6);
    for (const button of await actions.all()) await expect(button).toBeDisabled();
  });
});

test('manual save roundtrip restores campaign through real IndexedDB and UI', async ({ evidence, page }) => {
  await evidence.start('SCN-13-SAVE-RESTORE', 1701);
  await recruit(page, 'troop-1');
  const saved = await page.evaluate(() => window.boldAndBrave.snapshot());
  page.once('dialog', dialog => { void dialog.accept(); });
  await page.locator('[data-focus="save-1"]').click();
  await expect(page.locator('[data-focus="load-1"]')).toBeEnabled();
  await recruit(page, 'troop-2');
  expect((await game(page)).campaign.coin).toBe(50);
  await page.locator('[data-focus="load-1"]').click();
  await expect.poll(async () => (await game(page)).campaign.coin).toBe(75);
  await journal(page);
  await evidence.checkpoint('CP-SAVE-RESTORE', 'manual-roundtrip', ['Save/load through visible controls restores all campaign fields, including random state and provision remainder.'], async () => {
    expect(await page.evaluate(() => window.boldAndBrave.snapshot())).toEqual(saved);
  });
  await page.keyboard.press('Escape');
  await enterSettlement(evidence);
  const arrival = (await game(page)).campaign;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Recover autosave', exact: true })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Recover autosave', exact: true }).click();
  await expect.poll(async () => (await game(page)).campaign.scene).toBe('settlement');
  await journal(page);
  await evidence.checkpoint('CP-SAVE-RESTORE', 'launch-recovery', ['Scene-entry autosave survives reload and restores exact arrival state.'], state => { expect(state?.campaign).toEqual(arrival); });
});

for (const fault of ['insecure-context', 'webgpu-absent', 'null-adapter', 'software-adapter', 'device-denied'] as const) {
  test(`startup rejects ${fault} without entering gameplay`, async ({ evidence, page }) => {
    await page.addInitScript(fault => {
      if (fault === 'insecure-context') Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
      else if (fault === 'webgpu-absent') Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
      else if (fault === 'null-adapter') navigator.gpu.requestAdapter = async () => null;
      else if (fault === 'software-adapter') {
        // A rejected startup sentinel, never a usable rendering device.
        const software = { info: { vendor: 'Google', architecture: 'SwiftShader', device: 'software', description: 'Injected software adapter', isFallbackAdapter: true }, limits: { maxTextureDimension2D: 8192, maxBindGroups: 4 }, requestDevice: async () => { throw new Error('Software adapter must be rejected before device request.'); } } as unknown as GPUAdapter;
        navigator.gpu.requestAdapter = async () => software;
      }
      else {
        const request = navigator.gpu.requestAdapter.bind(navigator.gpu);
        navigator.gpu.requestAdapter = async options => {
          const adapter = await request(options);
          if (adapter) adapter.requestDevice = async () => { throw new DOMException('Injected physical-device initialization denial', 'NotAllowedError'); };
          return adapter;
        };
      }
    }, fault);
    await evidence.open('SCN-15-WEBGPU-STARTUP-LOAD', 1801);
    await expect(page.getByRole('heading', { name: 'Unsupported', exact: true })).toBeVisible();
    await evidence.checkpoint('CP-SUPPORT-GATE', fault, ['The selected failed gate shows a readable error and starts neither Scene load nor campaign.'], async state => {
      expect(state).toBeNull();
      await expect(page.getByRole('button', { name: 'Start new campaign', exact: true })).toHaveCount(0);
      expect(evidence.console.filter(record => /\[scene:overworld\].*(download|decode|upload|readiness)/i.test(record.text))).toEqual([]);
      const text = await page.locator('#delivery').innerText();
      expect(text).toMatch(fault === 'insecure-context' ? /secure context/i : fault === 'webgpu-absent' ? /WebGPU.*unavailable/i : fault === 'device-denied' ? /device.*initialization/i : /physical.*adapter/i);
    });
  });
}

test('audio resume failure blocks start and explicit Retry recovers', async ({ evidence, page }) => {
  await page.addInitScript(() => {
    const resume = AudioContext.prototype.resume;
    let fail = true;
    AudioContext.prototype.resume = function () {
      if (fail) { fail = false; return Promise.reject(new DOMException('Injected audio initialization failure', 'NotAllowedError')); }
      return resume.call(this);
    };
  });
  await evidence.open('SCN-18-PRESENTATION-AUDIO', 1901);
  await expect(page.getByRole('button', { name: 'Start new campaign', exact: true })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Start new campaign', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Audio failed', exact: true })).toBeVisible();
  await evidence.checkpoint('CP-AUDIO', 'initialization-failure', ['Audio failure is visible and campaign remains stopped until explicit Retry.'], async () => {
    expect(await page.evaluate(() => window.boldAndBrave.delivery())).toMatchObject({ running: false, audio: 'Audio failed' });
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.boldAndBrave.delivery())).toMatchObject({ running: true, audio: 'Audio ready' });
});

for (const fault of ['SecurityError', 'QuotaExceededError'] as const) {
  test(`storage ${fault} preserves in-memory campaign and Retry recovers`, async ({ evidence, page }) => {
    await evidence.start('SCN-14-SAVE-FAILURES', 1702);
    await journal(page);
    const before = (await game(page)).campaign;
    await page.evaluate(fault => {
      const put = IDBObjectStore.prototype.put;
      let deny = true;
      IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
        if (deny) { deny = false; throw new DOMException('Injected storage write failure', fault); }
        return Reflect.apply(put, this, args);
      };
    }, fault);
    page.once('dialog', dialog => { void dialog.accept(); });
    await page.locator('[data-focus="save-1"]').click();
    await evidence.checkpoint('CP-SAVE-FAILURE', fault, ['Write failure is persistent, disables save/load, and preserves exact in-memory campaign.'], async () => {
      await expect(page.locator('#panels')).toContainText(/Saving unavailable/i);
      await expect(page.getByRole('alert')).toHaveCount(1);
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.locator('.notices .notice:visible')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Journal', exact: true })).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
      expect((await game(page)).campaign).toEqual(before);
      const actions = page.locator('[data-focus^="save-"], [data-focus^="load-"]');
      expect(await actions.count()).toBe(7);
      for (const button of await actions.all()) await expect(button).toBeDisabled();
    });
    await page.locator('[data-focus="retry-storage-panel"]').click();
    await expect(page.locator('[data-focus="save-1"]')).toBeEnabled();
    page.once('dialog', dialog => { void dialog.accept(); });
    await page.locator('[data-focus="save-1"]').click();
    await expect(page.locator('[data-focus="load-1"]')).toBeEnabled();
  });
}

test('real rendering device destruction freezes active battle before Reload', async ({ evidence, page }) => {
  await evidence.start('SCN-16-WEBGPU-DEVICE-LOSS', 1802);
  await enterSettlement(evidence);
  await bridgeSetup(evidence);
  await expect.poll(async () => (await game(page)).phase, { timeout: 30_000 }).toBe('Battle');
  await evidence.clip('CP-DELIVERY-DEVICE-LOSS', 'active-battle-device-loss', async () => {
    await page.evaluate(() => window.boldAndBrave.loseDevice());
    await expect(page.getByRole('heading', { name: 'Device lost', exact: true })).toBeVisible();
    const loss = await page.evaluate(() => window.__pvs.loss);
    expect(loss?.tick, 'Tick sampled in the native GPUDevice.lost handler is required.').not.toBeNull();
    await expect.poll(() => page.evaluate(() => window.boldAndBrave.delivery())).toMatchObject({ lost: true, running: false });
    const frozen = await game(page);
    expect(frozen.tick).toBe(loss?.tick);
    for (let sample = 0; sample < 30; sample++) {
      await frames(page);
      expect(await game(page)).toEqual(frozen);
    }
    await page.keyboard.press('w');
    await frames(page);
    expect(await game(page)).toEqual(frozen);
  });
  await evidence.checkpoint('CP-DELIVERY-DEVICE-LOSS', 'stopped', ['Device loss exposes Reload and preserves the complete stopped battle projection.'], async () => {
    await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
    expect((await game(page)).tick).toBe((await page.evaluate(() => window.__pvs.loss))?.tick);
  });
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start new campaign', exact: true })).toBeVisible({ timeout: 45_000 });
  expect((await page.evaluate(() => window.__pvs)).adapters.length).toBeGreaterThan(0);
});

test('Scene download failure stops at first error and explicit Retry completes real loading', async ({ evidence, page }) => {
  await evidence.start('SCN-15-WEBGPU-STARTUP-LOAD', 1801);
  let requests = 0;
  await page.route('**/assets/overworld.scene.json', async route => {
    requests++;
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Injected asset download failure' });
  });
  await evidence.clip('CP-SUPPORT-LOAD', 'first-load-error', async () => {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Load failed', exact: true })).toBeVisible();
  });
  await evidence.checkpoint('CP-SUPPORT-LOAD', 'download-failed', ['Failed asset is identified; loading stops with Retry and no automatic second request.'], async () => {
    await expect(page.locator('#delivery')).toContainText('overworld.scene.json');
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
    await frames(page);
    expect(requests).toBe(1);
    expect(evidence.console.some(record => /\[scene:overworld\].*\[asset:overworld\.scene\.json\].*failed/i.test(record.text))).toBe(true);
  });
  await page.unroute('**/assets/overworld.scene.json');
  const before = evidence.console.length;
  await evidence.clip('CP-SUPPORT-LOAD', 'explicit-load-retry', async () => {
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start new campaign', exact: true })).toBeVisible({ timeout: 45_000 });
  });
  await evidence.checkpoint('CP-SUPPORT-LOAD', 'ready-after-retry', ['Successful retry includes asset download, decode, GPU upload and Scene readiness diagnostics.'], async () => {
    const records = evidence.console.slice(before).filter(record => /\[scene:overworld\].*\[asset:/.test(record.text));
    for (const stage of ['Asset download', 'Asset decode', 'GPU upload', 'Scene readiness']) {
      expect(records.some(record => record.text.includes(stage)), `Missing observed ${stage} stage`).toBe(true);
    }
  });
});

test('old and corrupt saves remain unavailable, with confirmed deletion and reset', async ({ evidence, page }) => {
  await evidence.start('SCN-14-SAVE-FAILURES', 1702);
  await journal(page);
  page.once('dialog', dialog => { void dialog.accept(); });
  await page.locator('[data-focus="save-1"]').click();
  await expect(page.locator('[data-focus="load-1"]')).toBeEnabled();
  await page.evaluate(async () => {
    const snapshot = window.boldAndBrave.snapshot();
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('bold-and-brave', 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const database = open.result;
        const transaction = database.transaction('campaigns', 'readwrite');
        const store = transaction.objectStore('campaigns');
        store.put({ slot: '2', savedAt: new Date().toISOString(), snapshot: { ...snapshot, version: 0 } });
        store.put({ slot: '3', savedAt: new Date().toISOString(), snapshot: 'corrupt' });
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onabort = () => { database.close(); reject(transaction.error); };
      };
    });
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start new campaign', exact: true })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Start new campaign', exact: true }).click();
  await journal(page);
  const before = (await game(page)).campaign;
  await page.getByRole('heading', { name: 'Campaign saves', exact: true }).evaluate(heading => heading.parentElement!.scrollIntoView({ block: 'start' }));
  await evidence.checkpoint('CP-SAVE-FAILURE', 'invalid-entries', ['Old schema and corrupt records show unavailable reasons; a new campaign preserves the valid existing manual slot.'], async () => {
    await expect(page.locator('[data-focus="load-1"]')).toBeEnabled();
    for (const slot of ['2', '3']) {
      await expect(page.locator(`[data-focus="load-${slot}"]`)).toBeDisabled();
      await expect(page.locator('.save-slot').filter({ has: page.locator(`[data-focus="load-${slot}"]`) })).toContainText('Unavailable:');
    }
  });
  page.once('dialog', dialog => { void dialog.dismiss(); });
  await page.locator('[data-focus="delete-1"]').click();
  await expect(page.locator('[data-focus="load-1"]')).toBeEnabled();
  page.once('dialog', dialog => { void dialog.accept(); });
  await page.locator('[data-focus="delete-1"]').click();
  await expect(page.locator('[data-focus="load-1"]')).toBeDisabled();
  await expect(page.locator('.save-slot').filter({ has: page.locator('[data-focus="load-2"]') })).toContainText('Unavailable:');
  page.once('dialog', dialog => { void dialog.dismiss(); });
  await page.locator('[data-focus="reset-storage"]').click();
  await expect(page.locator('.save-slot').filter({ has: page.locator('[data-focus="load-2"]') })).toContainText('Unavailable:');
  page.once('dialog', dialog => { void dialog.accept(); });
  await page.locator('[data-focus="reset-storage"]').click();
  await expect.poll(() => page.evaluate(() => new Promise<number>((resolve, reject) => {
    const open = indexedDB.open('bold-and-brave', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction('campaigns', 'readonly');
      const count = transaction.objectStore('campaigns').count();
      transaction.oncomplete = () => { database.close(); resolve(count.result); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  }))).toBe(0);
  expect((await game(page)).campaign).toEqual(before);
  await evidence.checkpoint('CP-SAVE-FAILURE', 'confirmed-reset', ['Confirmed reset clears all local slots without changing the active in-memory campaign.'], async () => {
    const buttons = page.locator('[data-focus^="load-"]');
    expect(await buttons.count()).toBe(4);
    for (const button of await buttons.all()) await expect(button).toBeDisabled();
    await expect(page.locator('.save-slot .inline-error')).toHaveCount(0);
    for (const slot of ['1', '2', '3']) await expect(page.locator(`[data-focus="delete-${slot}"]`)).toBeDisabled();
  });
});

test('late return crosses the real Overworld deadline and starts center battle without setup', async ({ evidence, page }) => {
  await evidence.start('SCN-04-FULL-LATE-VICTORY', 1201);
  await enterSettlement(evidence);
  await lateBattle(evidence);
  await page.keyboard.press('Escape');
  await evidence.checkpoint('CP-FLOW-LATE', 'center-battle', ['Boundary entry after deadline starts settlement-center Battle with no setup window.'], state => {
    expect(state).toMatchObject({ phase: 'Battle', setupRemaining: 0, boundary: 'Battle and resolution' });
    expect(state?.campaign.raidLocation).toBe('Settlement center');
    expect(state?.combatants.filter(actor => actor.role === 'Resident')).toHaveLength(5);
  });
});

test('real bridge combat reaches confirmed fate, Feat and changed settlement without outcome injection', async ({ evidence, page }) => {
  test.setTimeout(240_000);
  await evidence.captureAudio();
  await evidence.start('SCN-01-FULL-EARLY-RELEASE', 1101);
  await enterSettlement(evidence);
  await recruit(page, 'troop-1');
  await recruit(page, 'troop-2');
  await bridgeSetup(evidence);
  await page.locator('#world').focus();
  for (const key of ['1', 'e', '2', 'e']) await page.keyboard.press(key);
  await expect.poll(async () => (await game(page)).phase, { timeout: 30_000 }).toBe('Battle');
  const battle = fightBattle(evidence).then(() => null, (error: unknown) => error);
  await evidence.canvasClip('CP-AUDIO', 'combat-duck', async () => {
    const start = (await game(page)).battleTime;
    await expect.poll(async () => (await game(page)).battleTime, { intervals: [50] }).toBeGreaterThan(start + 2);
  });
  await page.waitForFunction(() => {
    const state = window.boldAndBrave.project();
    if (state.phase !== 'Battle') throw new Error(`The live battle reached ${state.outcome} before the fate capture. No outcome was substituted.`);
    const remainingHealth = state.combatants.filter(actor => actor.team === 'Raiders' && actor.status === 'Active').reduce((total, actor) => total + actor.health, 0);
    return remainingHealth <= 80;
  }, null, { timeout: 180_000, polling: 'raf' });
  await evidence.canvasClip('CP-AUDIO', 'fate-music-fade', async () => {
    const battleError = await battle;
    if (battleError !== null) throw battleError;
    await expect.poll(() => page.evaluate(() => {
      const fade = window.boldAndBrave.audioEvents().find(event => event.type === 'music' && event.phase === 'Agent fate' && event.gain === 0);
      return fade ? performance.now() / 1000 - fade.at : 0;
    }), { intervals: [50] }).toBeGreaterThanOrEqual(.65);
  }, 'ending');
  const audio = await page.evaluate(() => window.boldAndBrave.audioEvents());
  const cues = audio.filter(event => event.type === 'cue');
  expect(cues.some(event => event.cue === 'attack' && event.weapon === 'Sword' && event.position !== null)).toBe(true);
  expect(cues.some(event => event.cue === 'attack' && event.weapon === 'Staff' && event.position !== null)).toBe(true);
  expect(cues.filter(event => event.cue === 'order')).toHaveLength(2);
  expect(cues.filter(event => event.cue === 'response')).toHaveLength(2);
  expect(cues.filter(event => event.cue === 'order').every(event => event.position === null)).toBe(true);
  expect(cues.filter(event => event.cue === 'response').every(event => event.position !== null)).toBe(true);
  expect(cues.some(event => event.cue === 'transition' || event.cue === 'killed')).toBe(false);
  for (let priority = 1; priority <= 5; priority++) expect(audio.some(event => event.type === 'mix' && event.priority === priority && event.ducked)).toBe(true);
  const state = await game(page);
  await evidence.checkpoint('CP-FLOW-EARLY', 'observed-battle-outcome', ['Real combat leaves Battle; no health, outcome, position or campaign state is forced.'], state => {
    expect(state?.phase, 'The live browser battle must reach a natural outcome.').not.toBe('Battle');
    expect(['Victory', 'Defeat']).toContain(state?.outcome);
  });
  if (state.outcome === 'Defeat') {
    await page.locator('[data-focus="continue-summary"]').click();
    await expect.poll(async () => (await game(page)).phase).toBe('Settlement');
    await evidence.checkpoint('CP-FLOW-DEFEAT', 'observed-defeat-return', ['The observed defeat skips fate/Feat and leaves the settlement Damaged. This does not substitute for the required victory.'], state => {
      expect(state?.campaign).toMatchObject({ contract: 'Failed', condition: 'Damaged', feat: null });
    });
    throw new Error('The public-command policy lost the actual battle. Fate/Feat victory evidence remains blocked; no substitute victory was injected.');
  }
  await evidence.checkpoint('CP-UI-FATE', 'kneeling-choice', ['Victory presents Release, Capture and Execute and no fate has yet been committed.'], async state => {
    expect(state?.phase).toBe('Agent fate');
    expect(state?.campaign.enemyChoice).toBeNull();
    for (const choice of ['Release', 'Capture', 'Execute']) await expect(page.locator(`[data-focus="fate-${choice}"]`)).toBeVisible();
  });
  const beforeChoice = (await game(page)).campaign;
  await page.locator('[data-focus="fate-Release"]').click();
  await expect.poll(async () => (await game(page)).pendingChoice).toBe('Release');
  expect((await game(page)).campaign).toEqual(beforeChoice);
  await page.locator('[data-focus="cancel-fate"]').click();
  await expect.poll(async () => (await game(page)).pendingChoice).toBeNull();
  expect((await game(page)).campaign).toEqual(beforeChoice);
  await evidence.clip('CP-UI-FATE', 'release-confirmation', async () => {
    await page.locator('[data-focus="fate-Release"]').click();
    await page.locator('[data-focus="confirm-fate"]').click();
    await expect.poll(async () => (await game(page)).campaign.enemyChoice).toBe('Release');
  });
  if ((await game(page)).phase === 'Bandit fate') {
    const agents = (await game(page)).campaign.agents;
    await page.locator('[data-focus="fate-Release"]').click();
    await page.locator('[data-focus="confirm-fate"]').click();
    await expect.poll(async () => (await game(page)).phase).toBe('Summary');
    expect((await game(page)).campaign.agents).toEqual(agents);
  }
  await evidence.checkpoint('CP-SPEC-END-TO-END', 'victory-summary', ['Summary exposes actual casualties, fates, Captives, Settlement condition and Local Contract state.'], async state => {
    expect(state).toMatchObject({ phase: 'Summary', outcome: 'Victory' });
    const text = await page.locator('.game-panel').innerText();
    for (const label of ['Band casualties', 'Resident casualties', 'Enemy Agent', 'Ordinary bandits', 'Captives', 'Settlement condition', 'Local Contract state']) expect(text).toContain(label);
  });
  await page.locator('[data-focus="continue-summary"]').click();
  await expect.poll(async () => (await game(page)).phase).toBe('Feat');
  await evidence.checkpoint('CP-FEAT', 'choice', ['Victory offers the three specified Feats exactly once.'], async state => {
    expect(state?.phase).toBe('Feat');
    expect(await page.locator('[data-focus^="feat-"]').count()).toBe(3);
  });
  await page.locator('[data-focus="feat-Rapid Guard"]').click();
  await expect.poll(async () => (await game(page)).phase).toBe('Settlement');
  await evidence.completeJourney();
  await evidence.checkpoint('CP-REL-RELEASE', 'changed-settlement', ['Release and Rapid Guard persist in a Resolved/Safe settlement with exact named-Agent dispositions.'], state => {
    expect(state?.campaign).toMatchObject({ contract: 'Resolved', condition: 'Safe', enemyChoice: 'Release', feat: 'Rapid Guard' });
    expect(state?.campaign.agents.map(agent => ({ id: agent.id, fate: agent.fate, disposition: agent.disposition, grievances: agent.grievances }))).toEqual([
      { id: 'giver', fate: 'Active', disposition: 'Friendly', grievances: [] },
      { id: 'resident-agent', fate: 'Active', disposition: 'Neutral', grievances: [] },
      { id: 'enemy', fate: 'Active', disposition: 'Neutral', grievances: [] },
    ]);
  });
  for (const agent of ['giver', 'resident']) {
    await page.locator(`[data-focus="talk-${agent}"]`).click();
    await evidence.checkpoint('CP-REL-RELEASE', `${agent}-reaction`, ['Returned settlement Agent exposes a changed authored reaction.'], async () => {
      await expect(page.locator('.dialogue-text')).toContainText(agent === 'giver' ? /defended|spared|friend/i : /saved|defense|trust/i);
    });
    await page.locator('[data-focus="close-panel"]').click();
  }
  await journal(page);
  await evidence.checkpoint('CP-FEAT', 'persistent-journal', ['Journal preserves Rapid Guard and all preparation remains read-only after resolution.'], async () => {
    await expect(page.locator('.game-panel')).toContainText('Rapid Guard');
    for (const button of await page.locator('[data-focus^="recruit-"]').all()) await expect(button).toBeDisabled();
  });
});

test.describe('metrics-only bridge evidence', () => {
  test('SCN-17-PERFORMANCE-BRIDGE/1803 records natural combat without image or video encoding', async ({ evidence, page }) => {
    test.setTimeout(720_000); // Harness watchdog, not an accepted journey/battle duration.
    evidence.recording = 'Metrics only: Playwright trace/screenshots/video are disabled and no evidence PNG, screencast or canvas encoder runs during Battle. Browser command logging, live automated policy and frame instrumentation remain; their overhead is unquantified, not subtracted.';
    await evidence.start('SCN-17-PERFORMANCE-BRIDGE', 1803);
    await enterSettlement(evidence);
    await recruit(page, 'troop-1');
    await recruit(page, 'troop-2');
    await acceptContract(page);
    for (let hour = 0; hour < 12; hour++) await evidence.submit({ type: 'wait' });
    await evidence.checkpoint('CP-PERFORMANCE', 'fresh-two-troop-bridge-setup', ['A fresh campaign fields exactly the Player, Companion and two recruited staff Troops at the real bridge.'], state => {
      expect(state).toMatchObject({ phase: 'Setup', outcome: null });
      expect(state?.campaign).toMatchObject({ coin: 50, raidLocation: 'Bridge', contract: 'Accepted' });
      expect(state?.campaign.members.filter(member => member.role === 'Troop').map(member => member.id)).toEqual(['troop-1', 'troop-2']);
      expect(state?.combatants.filter(actor => actor.team === 'Raiders')).toHaveLength(6);
      expect(state?.combatants.filter(actor => actor.role === 'Resident')).toHaveLength(5);
    }, false);
    await page.locator('#world').focus();
    for (const key of ['1', 'e', '2', 'e']) await page.keyboard.press(key);
    await expect.poll(async () => (await game(page)).phase, { timeout: 30_000 }).toBe('Battle');
    await fightBattle(evidence);
    await evidence.checkpoint('CP-PERFORMANCE', 'natural-outcome-frame-metrics', ['Delivered Battle frames meet the unchanged average, p95 and continuous below-30fps floor; duration is recorded only and either natural outcome is retained.'], state => {
      expect(['Victory', 'Defeat']).toContain(state?.outcome);
      expect(state?.phase).toBe(state?.outcome === 'Victory' ? 'Agent fate' : 'Summary');
      const metrics = evidence.battle!.metrics;
      expect(metrics.frames, 'A real Battle frame sample is required.').toBeGreaterThan(0);
      expect(metrics.averageMs).toBeLessThanOrEqual(16.67);
      expect(metrics.p95Ms).toBeLessThanOrEqual(33.33);
      expect(metrics.longestBelow30Seconds).toBeLessThanOrEqual(1);
    }, false);
  });
});

for (const journey of [
  { scenario: 'SCN-02-FULL-EARLY-CAPTURE', seed: 1102, choice: 'Capture', feat: 'Rapid Stamina', late: false },
  { scenario: 'SCN-03-FULL-EARLY-EXECUTE', seed: 1103, choice: 'Execute', feat: 'Rapid Attack', late: false },
  { scenario: 'SCN-04-FULL-LATE-VICTORY', seed: 1201, choice: 'Release', feat: 'Rapid Guard', late: true },
] as const) {
  test(`${journey.scenario}/${journey.seed} records ${journey.choice}, summary and changed-settlement reactions`, async ({ evidence, page }) => {
    test.setTimeout(720_000); // Harness watchdog only; no duration acceptance gate.
    await evidence.start(journey.scenario, journey.seed);
    await enterSettlement(evidence);
    await recruit(page, 'troop-1');
    await recruit(page, 'troop-2');
    if (journey.late) {
      await lateBattle(evidence);
      expect(await game(page)).toMatchObject({ phase: 'Battle', setupRemaining: 0, campaign: { raidLocation: 'Settlement center' } });
    } else await bridgeSetup(evidence);
    await page.locator('#world').focus();
    for (const key of ['1', 'e', '2', 'e']) await page.keyboard.press(key);
    await expect.poll(async () => (await game(page)).phase, { timeout: 30_000 }).toBe('Battle');
    await fightBattle(evidence);
    await resolveJourney(evidence, journey.choice, journey.feat, journey.late);
  });
}

for (const defeat of [
  { scenario: 'SCN-05-BAND-DEFEAT', seed: 1202, policy: 'passive' },
  { scenario: 'SCN-06-RESIDENT-LOSS', seed: 1203, policy: 'resident-loss' },
] as const) {
  test(`${defeat.scenario}/${defeat.seed} records natural defeat and Failed/Damaged return`, async ({ evidence, page }) => {
    test.setTimeout(720_000); // Harness watchdog only; no duration acceptance gate.
    await evidence.start(defeat.scenario, defeat.seed);
    await enterSettlement(evidence);
    if (defeat.policy === 'resident-loss') {
      await recruit(page, 'troop-1');
      await recruit(page, 'troop-2');
    }
    await bridgeSetup(evidence);
    if (defeat.policy === 'resident-loss') {
      for (const group of ['Companion', 'Troops'] as const) {
        await evidence.submit([{ type: 'select-group', group }, { type: 'order', order: 'Hold' }, { type: 'hold-point', point: { x: 20, z: 18 } }]);
      }
      // Match the public core recipe's 299-tick setup walk, not a position edit
      // or a wall-time delay. Simulation ticks here schedule inputs only.
      const stopTick = await page.evaluate(() => {
        const api = window.boldAndBrave;
        const targetTick = api.project().tick + 1;
        api.submit({ type: 'move', direction: { x: 1, z: 0 }, facing: Math.PI }, targetTick);
        api.submit({ type: 'move', direction: { x: 0, z: 0 }, facing: Math.PI }, targetTick + 299);
        return targetTick + 299;
      });
      await expect.poll(async () => (await game(page)).tick).toBeGreaterThanOrEqual(stopTick);
    }
    await evidence.checkpoint('CP-FLOW-DEFEAT', 'public-recipe-setup', ['Canonical seed and public setup inputs establish the distinct defeat route without state injection.'], state => {
      expect(state).toMatchObject({ phase: 'Setup', outcome: null });
      expect(state?.campaign).toMatchObject({ contract: 'Accepted', raidLocation: 'Bridge' });
      if (defeat.policy === 'passive') {
        expect(state?.campaign.members.map(member => member.role)).toEqual(['Player', 'Companion']);
        expect(state?.groups.Companion.order).toBe('Follow');
      } else {
        expect(state?.campaign.members.filter(member => member.role === 'Troop').map(member => member.id)).toEqual(['troop-1', 'troop-2']);
        for (const group of ['Companion', 'Troops'] as const) expect(state?.groups[group]).toMatchObject({ order: 'Hold', marker: { x: 20, z: 18 } });
        expect(state?.combatants.find(actor => actor.role === 'Player')?.position.x).toBeGreaterThan(18);
      }
    });
    await expect.poll(async () => (await game(page)).phase, { timeout: 30_000 }).toBe('Battle');
    await evidence.clip('CP-FLOW-DEFEAT', 'natural-trigger-to-summary', async () => {
      await fightBattle(evidence, defeat.policy);
      await expect(page.getByRole('heading', { name: 'Defeat', exact: true })).toBeVisible();
    }, 'ending');
    await evidence.checkpoint('CP-FLOW-DEFEAT', 'natural-defeat-summary', ['The specified natural defeat trigger leads immediately to Summary, Failed/Damaged, no fate choice and no Feat.'], async state => {
      expect(state).toMatchObject({ phase: 'Summary', outcome: 'Defeat' });
      const campaign = state!.campaign;
      expect(campaign).toMatchObject({ contract: 'Failed', condition: 'Damaged', enemyChoice: null, banditChoice: null, feat: null, captives: 0 });
      expect(state?.combatants.some(actor => actor.team === 'Raiders' && actor.status === 'Active')).toBe(true);
      if (defeat.policy === 'passive') {
        expect(state?.combatants.filter(actor => actor.team === 'Band').every(actor => actor.status !== 'Active')).toBe(true);
        expect(state?.combatants.some(actor => actor.role === 'Resident' && actor.status === 'Active')).toBe(true);
      } else {
        expect(state?.combatants.filter(actor => actor.role === 'Resident' && actor.status === 'Killed')).toHaveLength(5);
        expect(state?.combatants.some(actor => actor.team === 'Band' && actor.status === 'Active')).toBe(true);
        expect(campaign.casualties.residents).toBe(5);
        // Chromium can advance several core ticks per delivered frame: this is
        // the preceding rendered sample, not an invented exact-tick observation.
        expect(evidence.battle?.before.combatants.some(actor => actor.role === 'Resident' && actor.status === 'Active')).toBe(true);
      }
      await expectFacts(page.locator('.game-panel'), {
        Outcome: 'Defeat', 'Local Contract state': 'Failed', 'Settlement condition': 'Damaged',
        'Enemy Agent': 'Aldric Vale — Active; survivor fate not chosen',
        'Ordinary bandits': `${campaign.banditKilled} killed; ${campaign.banditDowned} Downed; no survivor choice`,
        Captives: '0', 'Resident casualties': `${campaign.casualties.residents} of 5`,
      });
      await expect(page.locator('[data-focus^="fate-"], [data-focus^="feat-"]')).toHaveCount(0);
    });
    const defeated = (await game(page)).campaign;
    await evidence.submit([{ type: 'choose-fate', choice: 'Capture' }, { type: 'choose-feat', feat: 'Rapid Attack' }]);
    expect((await game(page)).campaign).toEqual(defeated);
    await evidence.clip('CP-FLOW-DEFEAT', 'defeat-summary-to-changed-settlement', async () => {
      await page.locator('[data-focus="continue-summary"]').click();
      await expect.poll(async () => (await game(page)).phase).toBe('Settlement');
      await evidence.completeJourney();
    });
    await returnedEvidence(evidence, 'Failed', 'Damaged', null);
  });
}

test('W and D move forward and right relative to the default shoulder camera', async ({ evidence, page }) => {
  await evidence.start('SCN-07-COMBAT-SECTOR-MATRIX', 1301);
  await enterSettlement(evidence);
  await page.locator('#world').focus();
  const before = (await game(page)).campaign.position;
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => (await game(page)).campaign.position.z, { timeout: 1500 }).toBeLessThan(before.z - 1);
  } finally { await page.keyboard.up('w'); }
  const beforeRight = (await game(page)).campaign.position;
  await page.keyboard.down('d');
  try {
    await expect.poll(async () => (await game(page)).campaign.position.x, { timeout: 1500 }).toBeGreaterThan(beforeRight.x + 1);
  } finally { await page.keyboard.up('d'); }
  await evidence.checkpoint('CP-COMBAT-INPUT', 'camera-forward-right', ['W moves forward and D moves right in the camera view.'], state => {
    expect(state!.campaign.position.z).toBeLessThan(before.z - 1);
    expect(state!.campaign.position.x).toBeGreaterThan(beforeRight.x + 1);
  });
});

test('released movement keys do not resume after focus or loading changes', async ({ evidence, page }) => {
  await evidence.start('SCN-07-COMBAT-SECTOR-MATRIX', 1301);
  await enterSettlement(evidence);
  await page.locator('#world').focus();
  const start = await game(page);
  await page.keyboard.down('w');
  await expect.poll(async () => (await game(page)).campaign.position.z).toBeLessThan(start.campaign.position.z - 1);
  await page.getByRole('button', { name: 'Journal', exact: true }).focus();
  await page.keyboard.up('w');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Journal', exact: true })).toBeVisible();
  page.once('dialog', dialog => { void dialog.accept(); });
  await page.locator('[data-focus="save-1"]').click();
  await expect(page.locator('[data-focus="load-1"]')).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.locator('#world').focus();
  const released = await game(page);
  await expect.poll(async () => (await game(page)).tick).toBeGreaterThan(released.tick + 20);
  expect((await game(page)).campaign.position).toEqual(released.campaign.position);

  let releaseLoad!: () => void;
  const heldLoad = new Promise<void>(resolve => { releaseLoad = resolve; });
  await page.route('**/assets/settlement.scene.json', async route => { await heldLoad; await route.continue(); });
  await page.keyboard.down('w');
  await journal(page);
  await page.locator('[data-focus="load-1"]').click();
  await expect.poll(() => page.evaluate(() => window.boldAndBrave.delivery().loading)).toBe(true);
  await page.keyboard.up('w');
  releaseLoad();
  await expect.poll(() => page.evaluate(() => window.boldAndBrave.delivery().loading)).toBe(false);
  await expect(page.locator('#delivery')).toBeHidden();
  const restored = await game(page);
  await expect.poll(async () => (await game(page)).tick).toBeGreaterThan(restored.tick + 20);
  expect((await game(page)).campaign.position).toEqual(restored.campaign.position);
  await evidence.checkpoint('CP-COMBAT-INPUT', 'released-across-focus-and-load', ['Released movement does not restart after Journal focus or Scene rebuilding.'], state => {
    expect(state?.campaign.position).toEqual(restored.campaign.position);
  });
});

test('failed launch recovery retains the prior campaign until explicit Retry succeeds', async ({ evidence, page }) => {
  await evidence.start('SCN-14-SAVE-FAILURES', 1702);
  await enterSettlement(evidence);
  const arrival = (await game(page)).campaign;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Recover autosave', exact: true })).toBeVisible({ timeout: 45_000 });
  const prior = (await game(page)).campaign;
  await page.route('**/assets/settlement.scene.json', route => route.abort('failed'));
  await page.getByRole('button', { name: 'Recover autosave', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Load failed', exact: true })).toBeVisible();
  expect((await game(page)).campaign).toEqual(prior);
  expect(await page.evaluate(() => window.boldAndBrave.delivery())).toMatchObject({ running: false, loading: false });
  await page.unroute('**/assets/settlement.scene.json');
  await page.evaluate(async () => {
    const moduleURL = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/browser/ui.ts')!.name;
    const { GameUI }: typeof InterfaceModule = await import(moduleURL);
    const render = GameUI.prototype.render;
    let fail = true;
    GameUI.prototype.render = function (state) {
      if (fail && state.campaign.scene === 'settlement') { fail = false; throw new Error('Injected UI binding failure'); }
      return render.call(this, state);
    };
  });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('#delivery')).toContainText('Injected UI binding failure');
  expect((await game(page)).campaign).toEqual(prior);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.boldAndBrave.delivery())).toMatchObject({ running: true, loading: false });
  await evidence.checkpoint('CP-SAVE-FAILURE', 'transactional-launch-recovery', ['Asset and UI binding failures retain the old campaign; explicit Retry restores the exact autosave.'], state => {
    expect(state?.campaign).toEqual(arrival);
  });
});

test('failed core Scene entry retains the old Scene and offers Retry', async ({ evidence, page }) => {
  await evidence.start('SCN-15-WEBGPU-STARTUP-LOAD', 1801);
  await page.evaluate(async () => {
    const moduleURL = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/core/combat.ts')!.name;
    const { CombatSystem }: typeof CombatModule = await import(moduleURL);
    const rebuild = CombatSystem.prototype.rebuild;
    let fail = true;
    CombatSystem.prototype.rebuild = function (state) {
      if (fail && state.campaign.scene === 'settlement') { fail = false; throw new Error('Injected physics state-entry failure'); }
      return rebuild.call(this, state);
    };
  });
  await evidence.submit([{ type: 'speed', speed: 4 }, { type: 'travel', point: { x: 0, z: 0 } }]);
  await expect(page.getByRole('heading', { name: 'Load failed', exact: true })).toBeVisible({ timeout: 45_000 });
  const failed = await game(page);
  expect(failed).toMatchObject({ phase: 'Travel', boundary: 'Load failed', campaign: { scene: 'overworld' } });
  await frames(page);
  expect((await game(page)).tick).toBe(failed.tick);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(async () => (await game(page)).phase).toBe('Settlement');
  await expect(page.locator('#delivery')).toBeHidden();
  await evidence.checkpoint('CP-SUPPORT-LOAD', 'state-entry-retry', ['Physics entry failure is explicit, freezes the old campaign, and permits a successful retry.'], state => {
    expect(state).toMatchObject({ boundary: 'Safe non-combat', campaign: { scene: 'settlement' } });
  });
});

test('real audio preserves four attack and guard sectors and silent passive HUD updates', async ({ evidence, page }) => {
  await evidence.captureAudio();
  await evidence.start('SCN-18-PRESENTATION-AUDIO', 1901);
  const ready = await page.evaluate(() => window.boldAndBrave.audioEvents());
  expect(ready.filter(event => event.type === 'readiness').map(event => event.state)).toEqual(['Audio not ready', 'Audio ready']);
  await enterSettlement(evidence);
  await bridgeSetup(evidence);
  await page.locator('#world').focus();
  const sectors = [
    { name: 'Overhead', x: 960, y: 470 },
    { name: 'Left cut', x: 890, y: 540 },
    { name: 'Right cut', x: 1030, y: 540 },
    { name: 'Thrust', x: 960, y: 610 },
  ] as const;
  for (const sector of sectors) {
    await evidence.canvasClip('CP-AUDIO', `${sector.name}-attack-contour`, async () => {
      await page.mouse.move(960, 540);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(sector.x, sector.y);
      await page.mouse.up({ button: 'left' });
      await expect.poll(async () => (await game(page)).combatants.find(actor => actor.id === 'player')?.action, { intervals: [16] }).not.toBe('Idle');
      await expect.poll(async () => (await game(page)).combatants.find(actor => actor.id === 'player')?.action, { intervals: [16] }).toBe('Idle');
    });
  }
  await evidence.canvasClip('CP-AUDIO', 'four-guard-contours', async () => {
    for (const sector of sectors) {
      await page.mouse.move(960, 540);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(sector.x, sector.y);
      await expect.poll(async () => (await game(page)).combatants.find(actor => actor.id === 'player')?.effectiveSector, { intervals: [16] }).toBe(sector.name);
      await page.mouse.up({ button: 'right' });
      await expect.poll(async () => (await game(page)).combatants.find(actor => actor.id === 'player')?.action, { intervals: [16] }).toBe('Idle');
    }
  });
  const audio = await page.evaluate(() => window.boldAndBrave.audioEvents());
  const player = audio.filter((event): event is Extract<AudioTrace, { type: 'cue' }> => event.type === 'cue' && event.actorId === 'player');
  for (const cue of ['attack', 'guard'] as const) {
    expect(player.filter(event => event.cue === cue).map(event => event.sector)).toEqual(sectors.map(sector => sector.name));
  }
  expect(player.filter(event => event.cue === 'miss')).toHaveLength(4);
  expect(player.filter(event => event.cue === 'hit' || event.cue === 'interrupted')).toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await game(page)).paused).toBe(true);
  const cueCount = (await page.evaluate(() => window.boldAndBrave.audioEvents())).filter(event => event.type === 'cue').length;
  const tick = (await game(page)).tick;
  await expect.poll(async () => (await game(page)).tick).toBeGreaterThan(tick + 30);
  expect((await page.evaluate(() => window.boldAndBrave.audioEvents())).filter(event => event.type === 'cue')).toHaveLength(cueCount);
  await evidence.checkpoint('CP-AUDIO', 'sector-and-passive-feedback', ['Four distinct sector cues survive actual pointer input; misses and passive HUD silence match the real event stream.'], state => {
    expect(state?.paused).toBe(true);
  });
});

test('combat rejection keeps its audio response without new or stale text notices', async ({ evidence, page }) => {
  await evidence.start('SCN-18-PRESENTATION-AUDIO', 1901);
  await enterSettlement(evidence);
  await page.locator('#world').focus();
  await page.keyboard.press('q');
  const notice = page.locator('.notices .notice:not(.notice-error)');
  await expect(notice).toBeVisible();
  await bridgeSetup(evidence);
  await evidence.checkpoint('CP-UI-HUD', 'no-stale-notice-in-setup', ['Entering Setup clears the old action notice.'], async () => {
    await expect(notice).toBeHidden();
  });
  await page.locator('#world').focus();
  await page.mouse.move(960, 540);
  await page.mouse.down();
  await page.mouse.move(960, 470);
  await expect.poll(async () => (await game(page)).combatants.find(actor => actor.id === 'player')?.action).toBe('Preview');
  const invalidCount = () => page.evaluate(() => window.boldAndBrave.audioEvents().filter(event => event.type === 'cue' && event.cue === 'invalid').length);
  const before = await invalidCount();
  await page.keyboard.press('q');
  await expect.poll(invalidCount).toBe(before + 1);
  await evidence.checkpoint('CP-UI-HUD', 'rejected-action-keeps-preview-and-audio', ['Rejected guard-mode input leaves Attack preview intact, plays its invalid-action cue, and adds no text notice.'], async state => {
    expect(state!.combatants.find(actor => actor.id === 'player')?.action).toBe('Preview');
    await expect(notice).toBeHidden();
  });
  await page.mouse.up();
});

test('SCN-10/1401 keeps Hold markers independent and visible when the camera turns away', async ({ evidence, page }) => {
  await evidence.start('SCN-10-COMMAND-GROUPS', 1401);
  await enterSettlement(evidence);
  for (const id of ['troop-1', 'troop-2', 'troop-3', 'troop-4']) await recruit(page, id);
  await bridgeSetup(evidence);
  const companionPoint = { x: -3, z: 4.5 };
  const troopPoint = { x: 3, z: 4.5 };
  await evidence.submit([{ type: 'select-group', group: 'Companion' }, { type: 'order', order: 'Hold' }, { type: 'hold-point', point: companionPoint }]);
  await evidence.submit([{ type: 'order', order: 'Hold' }, { type: 'hold-point', point: { x: -3, z: 0 } }]);
  await evidence.checkpoint('CP-COMMAND-GROUPS', 'invalid-river-preserves-hold', ['Rejected river placement keeps the prior Hold position and shows its separate invalid marker.'], state => {
    expect(state!.groups.Companion.marker).toEqual(companionPoint);
    expect(state!.invalidMarker).toEqual({ x: -3, z: 0 });
  });
  await evidence.submit({ type: 'hold-point', point: companionPoint });
  await evidence.submit([{ type: 'select-group', group: 'Troops' }, { type: 'order', order: 'Hold' }, { type: 'hold-point', point: troopPoint }]);
  const arrows = page.locator('body > div[aria-hidden="true"] > div:visible');
  await expect(arrows).toHaveCount(0);
  await evidence.checkpoint('CP-COMMAND-GROUPS', 'two-world-hold-markers', ['Both Command groups retain their distinct visible world positions.'], state => {
    expect(state!.groups.Companion.marker).toEqual(companionPoint);
    expect(state!.groups.Troops.marker).toEqual(troopPoint);
  });
  await page.locator('#world').focus();
  // Passive look includes the move from the last UI control. Read that facing
  // before turning toward the near bank, away from both Hold markers.
  await page.mouse.move(960, 540);
  await frames(page);
  const facing = (await game(page)).facing;
  const turn = Math.atan2(Math.sin(facing), Math.cos(facing));
  await page.mouse.move(960 + turn / .004, 540, { steps: 30 });
  await expect(arrows).toHaveCount(2);
  await evidence.checkpoint('CP-COMMAND-GROUPS', 'offscreen-hold-directions', ['Turning the real camera away shows both direction indicators inside the viewport.'], async state => {
    expect(state!.groups.Companion.marker).toEqual(companionPoint);
    expect(state!.groups.Troops.marker).toEqual(troopPoint);
    for (const arrow of await arrows.all()) {
      await expect(arrow).toBeInViewport({ ratio: 1 });
    }
    const controls = (await page.locator('.context-actions').boundingBox())!;
    for (const arrow of await arrows.all()) {
      const box = (await arrow.boundingBox())!;
      expect(box.x + box.width <= controls.x || box.x >= controls.x + controls.width
        || box.y + box.height <= controls.y || box.y >= controls.y + controls.height,
      'Direction indicators must not overlap the Command controls.').toBe(true);
    }
  });
  await evidence.clip('CP-COMMAND-GROUPS', 'independent-order-transitions', async () => {
    await delay(400);
    await evidence.submit({ type: 'order', order: 'Follow' });
    await expect(arrows).toHaveCount(1);
    expect((await game(page)).groups.Companion.marker).toEqual(companionPoint);
    await evidence.submit([{ type: 'select-group', group: 'Companion' }, { type: 'order', order: 'Follow' }]);
    await expect(arrows).toHaveCount(0);
    await evidence.submit([{ type: 'order', order: 'Engage' }, { type: 'select-group', group: 'Troops' }, { type: 'order', order: 'Engage' }]);
    expect((await game(page)).groups).toMatchObject({ Companion: { order: 'Engage' }, Troops: { order: 'Engage' } });
    await delay(600);
  });
  await page.mouse.move(960, 540);
  await frames(page);
  const battleFacing = (await game(page)).facing - Math.PI;
  await page.mouse.move(960 + Math.atan2(Math.sin(battleFacing), Math.cos(battleFacing)) / .004, 540, { steps: 30 });
  await expect.poll(async () => (await game(page)).phase, { timeout: 30_000 }).toBe('Battle');
  await evidence.clip('CP-COMMAND-AI', 'resident-flee-and-capped-pressure', async () => {
    const samples = await page.evaluate(async () => {
      const start = performance.now();
      const samples: { tick: number; committed: number; residents: { id: string; x: number; z: number }[] }[] = [];
      await new Promise<void>(resolve => {
        const sample = () => {
          const state = window.boldAndBrave.project();
          samples.push({
            tick: state.tick,
            committed: state.combatants.filter(actor => actor.team === 'Raiders' && (actor.action === 'Windup' || actor.action === 'Active')).length,
            residents: state.combatants.filter(actor => actor.role === 'Resident' && !actor.armed)
              .map(actor => ({ id: actor.id, ...actor.position })),
          });
          if (performance.now() - start >= 6_200) resolve();
          else requestAnimationFrame(sample);
        };
        sample();
      });
      return samples;
    });
    await writeFile(evidence.info.outputPath('CP-COMMAND-AI-rendered-samples.json'), JSON.stringify(samples, null, 2));
    expect(samples.every(sample => sample.committed <= 2)).toBe(true);
    expect(samples.some(sample => sample.committed > 0)).toBe(true);
    expect(samples[0].residents.some(resident => samples.some(sample => sample.residents.some(
      current => current.id === resident.id && Math.hypot(current.x - resident.x, current.z - resident.z) > 1,
    )))).toBe(true);
  });
});

test('three real save slots retain distinct campaigns and fractional provisions', async ({ evidence, page }) => {
  await evidence.start('SCN-13-SAVE-RESTORE', 1701);
  const saved: Snapshot[] = [];
  for (let slot = 1; slot <= 3; slot++) {
    await recruit(page, `troop-${slot}`);
    await page.keyboard.press('Escape');
    const position = (await game(page)).campaign.position;
    await evidence.submit({ type: 'travel', point: { x: position.x + .1, z: position.z } });
    await expect.poll(async () => (await game(page)).destination).toBeNull();
    await journal(page);
    const snapshot = await page.evaluate(() => window.boldAndBrave.snapshot());
    expect(snapshot.campaign.provisionRemainder).toBeGreaterThan(0);
    expect(snapshot.campaign.provisionRemainder).toBeLessThan(.5);
    saved.push(snapshot);
    page.once('dialog', dialog => { void dialog.accept(); });
    await page.locator(`[data-focus="save-${slot}"]`).click();
    await expect(page.locator(`[data-focus="load-${slot}"]`)).toBeEnabled();
  }
  await page.reload();
  await page.getByRole('button', { name: 'Start new campaign', exact: true }).click();
  for (let slot = 1; slot <= 3; slot++) {
    await journal(page);
    await page.locator(`[data-focus="load-${slot}"]`).click();
    await expect.poll(async () => (await game(page)).campaign.coin).toBe(100 - slot * 25);
    await journal(page);
    await evidence.checkpoint('CP-SAVE-RESTORE', `slot-${slot}-fractional-restore`, ['Each real IndexedDB slot survives reload and restores its own complete campaign, including a non-zero fractional provision remainder.'], async () => {
      expect(await page.evaluate(() => window.boldAndBrave.snapshot())).toEqual(saved[slot - 1]);
    });
  }
});

test('SCN-11/1501 shows zero Provisions without stopping travel or harming the Band', async ({ evidence, page }) => {
  test.setTimeout(180_000);
  await evidence.start('SCN-11-PREPARATION-TRAVEL', 1501);
  await journal(page);
  await evidence.checkpoint('CP-PREP-PROVISIONS', 'initial-ten-provisions', ['The Journal shows the initial 10.0 Provisions.'], async () => {
    await expectFacts(page.locator('.game-panel'), { Provisions: '10.0' });
  });
  for (const id of ['troop-1', 'troop-2', 'troop-3', 'troop-4']) await recruit(page, id);
  const members = (await game(page)).campaign.members;
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await game(page)).journalOpen).toBe(false);
  await page.locator('#world').focus();
  await page.keyboard.press('4');
  await expect.poll(async () => (await game(page)).speed).toBe(4);
  await evidence.submit({ type: 'travel', point: { x: 30, z: (await game(page)).campaign.position.z } });
  await expect.poll(async () => (await game(page)).campaign.provisions, { timeout: 120_000 }).toBe(0);
  const exhausted = (await game(page)).campaign.position.x;
  await expect.poll(async () => (await game(page)).campaign.position.x).toBeGreaterThan(exhausted + .1);
  await journal(page);
  await evidence.checkpoint('CP-PREP-PROVISIONS', 'zero-provisions-travel', ['Actual moving member-days reach zero; travel continues and Band health, membership, availability and equipment remain unchanged.'], async state => {
    expect(state!.campaign.members).toEqual(members);
    await expectFacts(page.locator('.game-panel'), { Provisions: '0.0' });
  });
});

test('Arena exit isolates start-menu keyboard focus from gameplay controls', async ({ evidence, page }) => {
  await evidence.open('SCN-15-WEBGPU-STARTUP-LOAD', 1801);
  await page.getByRole('button', { name: 'Arena practice', exact: true }).click();
  await page.getByRole('button', { name: 'Duel', exact: true }).click();
  await expect.poll(async () => (await game(page)).phase).toBe('Battle');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Exit Arena', exact: true }).click();
  const start = page.getByRole('button', { name: 'Start new campaign', exact: true });
  await expect(start).toBeVisible();
  await start.focus();
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('#world, #hud, #panels') !== null),
      'Tab must not reach gameplay behind the delivery menu.').toBe(false);
  }
  await start.click();
  await expect(page.locator('#delivery')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toBeVisible();
  await evidence.checkpoint('CP-SUPPORT-GATE', 'delivery-focus-restored', [
    'After Arena exit, Tab cannot reach covered gameplay controls; starting play restores keyboard input.',
  ], state => { expect(state).toMatchObject({ phase: 'Travel', paused: true }); });
});
