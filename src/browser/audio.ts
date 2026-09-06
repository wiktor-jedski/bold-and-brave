import type { Feedback, Projection, Sector, Vec2, Weapon } from '../core/types';

type AudioState = 'Audio not ready' | 'Audio ready' | 'Audio failed';
type Priority = 0 | 1 | 2 | 3 | 4 | 5;

export type AudioTrace =
  | { type: 'readiness'; at: number; state: AudioState; attempt: number }
  | { type: 'start'; at: number; attempt: number }
  | { type: 'cue'; at: number; tick: number; cue: Feedback['type']; actorId: string | null; sector: Sector | null; weapon: Weapon; priority: Priority; position: Vec2 | null }
  | { type: 'mix'; at: number; priority: number; gain: number; ducked: boolean; duration: number }
  | { type: 'music'; at: number; tick: number; phase: Projection['phase']; gain: number; duration: number };

// The identical four contours are shared by attack and guard, independent of material.
const CONTOURS: Record<Sector, readonly number[]> = {
  Overhead: [720, 420, 210],
  'Left cut': [260, 480, 360],
  'Right cut': [480, 260, 360],
  Thrust: [230, 410, 700],
};
const LEVELS = [0.72, 0.56, 0.46, 0.32, 0.24, 0.12] as const;

/** An event-only presentation adapter. Construction neither opens nor resumes audio. */
export class GameAudio {
  private readiness: AudioState = 'Audio not ready';
  private context: AudioContext | null = null;
  private starting: Promise<void> | null = null;
  private buses: GainNode[] = [];
  private activity = [0, 0, 0, 0, 0, 0];
  private levels: number[] = [];
  private sources = new Set<AudioScheduledSourceNode>();
  private routes: { node: PannerNode; until: number }[] = [];
  private noise: AudioBuffer | null = null;
  private music: GainNode | null = null;
  private ambience: GainNode | null = null;
  private ambiencePosition: PannerNode | null = null;
  private musicLevel = -1;
  private ambienceLevel = -1;
  private scene: Projection['campaign']['scene'] | null = null;
  private outcomeUntil = 0;
  private orderResponses: number[] = [];
  private lastOrder = -1;
  private attempts = 0;
  private event: Feedback | null = null;
  private eventWeapon: Weapon = 'Sword';
  private eventSector: Sector | null = null;

  constructor(private readonly observe?: (event: AudioTrace) => void) {
    this.observe?.({ type: 'readiness', at: performance.now() / 1000, state: this.readiness, attempt: 0 });
  }

  private setReadiness(state: AudioState): void {
    if (state === this.readiness) return;
    this.readiness = state;
    this.observe?.({ type: 'readiness', at: performance.now() / 1000, state, attempt: this.attempts });
  }

  get state(): AudioState {
    if (this.readiness === 'Audio ready' && this.context?.state !== 'running') return 'Audio failed';
    return this.readiness;
  }

  /** Invoke directly from the Start/Retry click handler, before any other awaited work. */
  async start(): Promise<void> {
    if (this.state === 'Audio ready') return;
    if (this.starting) return this.starting;
    this.attempts++;
    this.observe?.({ type: 'start', at: performance.now() / 1000, attempt: this.attempts });
    this.starting = this.initialize().finally(() => { this.starting = null; });
    return this.starting;
  }

  private async initialize(): Promise<void> {
    let context: AudioContext | null = null;
    let timeout: number | undefined;
    this.setReadiness('Audio not ready');
    try {
      if (!globalThis.navigator?.userActivation?.isActive) throw new Error('Audio requires an explicit Start or Retry gesture.');
      if (typeof AudioContext === 'undefined') throw new Error('Web Audio is unavailable.');
      context = this.context ?? new AudioContext({ latencyHint: 'interactive' });
      this.context = context;
      // resume() is invoked synchronously while transient user activation is still present.
      const resumed = context.resume();
      await Promise.race([
        resumed,
        new Promise<never>((_, reject) => { timeout = window.setTimeout(() => reject(new Error('Audio did not become ready. Select Retry.')), 4000); }),
      ]);
      if (this.context !== context) throw new Error('Audio initialization was cancelled.');
      if (context.state !== 'running') throw new Error(`Audio is ${context.state}, not running.`);
      if (this.buses.length === 0) this.buildGraph(context);
      const activeContext = context;
      context.onstatechange = () => {
        if (this.context === activeContext && this.readiness === 'Audio ready' && activeContext.state !== 'running') this.setReadiness('Audio failed');
      };
      this.setReadiness('Audio ready');
    } catch (error) {
      if (!context || this.context === context) {
        this.dispose();
        this.setReadiness('Audio failed');
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private buildGraph(context: AudioContext): void {
    const master = context.createGain();
    master.gain.value = 0.7;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    master.connect(limiter).connect(context.destination);
    this.buses = LEVELS.map((level) => {
      const gain = context.createGain();
      gain.gain.value = level;
      gain.connect(master);
      return gain;
    });
    this.levels = [...LEVELS];
    this.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = this.noise.getChannelData(0);
    let seed = 0x173ab54;
    for (let i = 0; i < samples.length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      samples[i] = (seed >>> 0) / 0x80000000 - 1;
    }

    // A single authored sixteen-second phrase, not state-selected stems or an adaptive score.
    const musicBuffer = context.createBuffer(1, 16 * 22050, 22050);
    const phrase = [146.8324, 164.8138, 130.8128, 110] as const;
    const musicSamples = musicBuffer.getChannelData(0);
    for (let i = 0; i < musicSamples.length; i++) {
      const time = i / 22050;
      const note = Math.floor(time / 4);
      const local = time % 4;
      const envelope = Math.sin(Math.PI * local / 4) ** 2;
      const phase = 2 * Math.PI * phrase[note]! * local;
      musicSamples[i] = envelope * (0.38 * Math.sin(phase) + 0.07 * Math.sin(phase * 2) + 0.045 * Math.sin(phase * 3));
    }
    this.music = context.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.buses[5]!);
    const musicSource = context.createBufferSource();
    musicSource.buffer = musicBuffer;
    musicSource.loop = true;
    musicSource.connect(this.music);
    this.track(musicSource);
    musicSource.start();

    this.ambience = context.createGain();
    this.ambience.gain.value = 0;
    this.ambiencePosition = this.panner({ x: 0, z: 0 }, 12);
    this.ambience.connect(this.ambiencePosition).connect(this.buses[5]!);
    const wind = context.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 430;
    filter.Q.value = 0.5;
    wind.connect(filter).connect(this.ambience);
    this.track(wind, filter);
    wind.start();
  }

  update(state: Projection): void {
    const context = this.context;
    if (!context || this.state !== 'Audio ready') return;
    const now = context.currentTime;
    const player = state.combatants.find((actor) => actor.id === 'player');
    const position = state.campaign.scene === 'settlement' && player ? player.position : state.campaign.position;
    const listener = context.listener;
    listener.positionX.setTargetAtTime(position.x, now, 0.025);
    listener.positionY.setTargetAtTime(1.5, now, 0.025);
    listener.positionZ.setTargetAtTime(position.z, now, 0.025);
    listener.forwardX.setTargetAtTime(Math.sin(state.facing), now, 0.025);
    listener.forwardY.setValueAtTime(0, now);
    listener.forwardZ.setTargetAtTime(Math.cos(state.facing), now, 0.025);
    listener.upX.setValueAtTime(0, now);
    listener.upY.setValueAtTime(1, now);
    listener.upZ.setValueAtTime(0, now);

    if (this.scene !== state.campaign.scene && this.ambiencePosition) {
      this.scene = state.campaign.scene;
      this.ambiencePosition.positionX.setTargetAtTime(this.scene === 'settlement' ? 8 : -4, now, 0.6);
      this.ambiencePosition.positionZ.setTargetAtTime(this.scene === 'settlement' ? 0 : 3, now, 0.6);
    }
    const fate = state.phase === 'Agent fate' || state.phase === 'Bandit fate';
    const majorOutcome = state.phase === 'Summary' || now < this.outcomeUntil;
    const musicLevel = fate ? 0 : state.phase === 'Battle' ? 0.035 : majorOutcome ? 0.07 : 0.38;
    if (musicLevel !== this.musicLevel && this.music) {
      this.fade(this.music.gain, musicLevel, fate ? 0.65 : 0.8);
      this.musicLevel = musicLevel;
      this.observe?.({ type: 'music', at: performance.now() / 1000, tick: state.tick, phase: state.phase, gain: musicLevel, duration: fate ? 0.65 : 0.8 });
    }
    const ambienceLevel = state.phase === 'Battle' || majorOutcome ? 0.25 : 0.7;
    if (ambienceLevel !== this.ambienceLevel && this.ambience) {
      this.fade(this.ambience.gain, ambienceLevel, 0.5);
      this.ambienceLevel = ambienceLevel;
    }
    this.mix(now);
    for (let i = this.routes.length - 1; i >= 0; i--) {
      if (this.routes[i]!.until > now) continue;
      this.routes[i]!.node.disconnect();
      this.routes.splice(i, 1);
    }
    while (this.orderResponses.length && this.orderResponses[0]! < now - 1) this.orderResponses.shift();
  }

  play(events: readonly Feedback[], state: Projection): void {
    if (this.state !== 'Audio ready' || !this.context) return;
    this.update(state);
    for (const event of events) this.playEvent(event, state);
    this.event = null;
  }

  private playEvent(event: Feedback, state: Projection): void {
    const context = this.context!;
    const now = context.currentTime;
    const actor = event.actorId ? state.combatants.find((combatant) => combatant.id === event.actorId) : undefined;
    const position = event.position ?? actor?.position;
    const sector = event.sector ?? actor?.sector;
    const weapon = event.weapon ?? actor?.weapon ?? 'Sword';
    if (this.observe) { this.event = event; this.eventWeapon = weapon; this.eventSector = sector ?? null; }
    switch (event.type) {
      case 'attack': {
        const route = this.route(0, position, now, 0.3);
        if (sector) this.tone(route, CONTOURS[sector], now, 0.19, 0.3, 'triangle');
        this.hiss(route, now, 0.18, 0.32, 'bandpass', 1600);
        this.material(route, weapon, now + 0.035, 0.13);
        break;
      }
      case 'guard': {
        const route = this.route(0, position, now, 0.22);
        if (sector) this.tone(route, CONTOURS[sector], now, 0.14, 0.18, 'sine');
        this.material(route, weapon, now, 0.1);
        break;
      }
      case 'block': {
        const directional = actor?.action === 'Guard' || (actor?.action !== 'Shield' && actor?.guardMode === 'Directional Guard');
        const route = this.route(0, position, now, 0.38);
        if (directional) {
          if (sector) this.tone(route, CONTOURS[sector], now, 0.19, 0.38, 'sine');
          this.material(route, weapon, now, 0.36);
          this.tone(route, [980, 1480], now + 0.035, 0.22, 0.16, 'sine');
        } else {
          this.hiss(route, now, 0.16, 0.6, 'lowpass', 750);
          this.tone(route, [170, 75], now, 0.25, 0.5, 'triangle');
          this.tone(route, [340, 290], now + 0.025, 0.11, 0.12, 'sine');
        }
        break;
      }
      case 'hit': {
        const route = this.route(0, position, now, 0.2);
        this.hiss(route, now, 0.11, 0.5, 'bandpass', 870);
        this.tone(route, [145, 80], now, 0.17, 0.33, 'triangle');
        break;
      }
      case 'struck': {
        const route = this.route(0, position, now, 0.32);
        this.hiss(route, now, 0.2, 0.6, 'lowpass', 390);
        this.tone(route, [100, 48], now, 0.29, 0.55, 'sine');
        break;
      }
      case 'miss': {
        const route = this.route(0, position, now, 0.21);
        this.hiss(route, now, 0.2, 0.3, 'highpass', 2400);
        break;
      }
      case 'interrupted': {
        const route = this.route(0, position, now, 0.26);
        this.tone(route, [190, 90], now, 0.09, 0.32, 'square');
        this.hiss(route, now + 0.075, 0.14, 0.34, 'bandpass', 530);
        break;
      }
      case 'order': {
        const at = Math.max(now, this.lastOrder + 0.2);
        this.lastOrder = at;
        this.orderResponses.push(at + 0.14);
        const route = this.route(1, undefined, at, 0.11);
        this.tone(route, [440, 550], at, 0.09, 0.31, 'triangle');
        break;
      }
      case 'response': {
        const queued = this.orderResponses.shift();
        // A response is one event from Simulation, never one confirmation per group member.
        const at = Math.max(now, queued ?? now);
        const route = this.route(1, position, at, 0.28);
        if (actor?.role === 'Companion' || event.actorId === 'companion') {
          this.tone(route, [260, 325], at, 0.17, 0.29, 'triangle');
          this.hiss(route, at + 0.04, 0.14, 0.22, 'bandpass', 950);
        } else {
          this.footstep(route, at);
          this.hiss(route, at + 0.08, 0.16, 0.3, 'bandpass', 1200);
        }
        break;
      }
      case 'downed': {
        const named = actor?.role === 'Companion' || actor?.role === 'Enemy Agent' || state.campaign.agents.some((agent) => agent.id === event.actorId);
        if (!named) break;
        const route = this.route(2, position, now, 0.6);
        // One fixed, nonverbal breath/fall reaction for every named Agent; no dialogue or variants.
        this.tone(route, [145, 112, 73], now, 0.42, 0.25, 'sine');
        this.hiss(route, now + 0.045, 0.48, 0.6, 'bandpass', 470);
        break;
      }
      case 'footstep': {
        this.footstep(this.route(3, position, now, 0.2), now);
        break;
      }
      case 'interaction': {
        const route = this.route(3, undefined, now, 0.18);
        this.tone(route, [330, 440], now, 0.16, 0.3, 'sine');
        break;
      }
      case 'accepted':
      case 'deadline':
      case 'victory':
      case 'defeat': {
        const duration = event.type === 'accepted' ? 0.5 : 1.1;
        this.outcomeUntil = now + 3;
        const route = this.route(2, undefined, now, duration);
        const notes = event.type === 'accepted' ? [220, 277, 330]
          : event.type === 'deadline' ? [220, 220, 147]
          : event.type === 'victory' ? [196, 247, 294]
          : [196, 165, 110];
        notes.forEach((note, index) => this.tone(route, [note], now + index * duration / 4, duration / 2, 0.34, 'triangle'));
        this.update(state);
        break;
      }
      case 'invalid': {
        const route = this.route(4, undefined, now, 0.14);
        this.tone(route, [100, 82], now, 0.13, 0.26, 'sine');
        break;
      }
      case 'journal':
      case 'confirm':
      case 'cancel':
      case 'choice':
      case 'save':
      case 'load': {
        const route = this.route(4, undefined, now, 0.19);
        const notes = event.type === 'cancel' ? [330, 240]
          : event.type === 'journal' ? [280, 350]
          : event.type === 'save' ? [520, 650]
          : event.type === 'load' ? [390, 520]
          : event.type === 'choice' ? [440, 660] : [350, 440];
        this.tone(route, notes, now, 0.16, 0.28, 'sine');
        break;
      }
      case 'transition':
      case 'killed':
        // Scene entry is silent. Ordinary casualty audio must not disclose survival.
        break;
    }
  }

  private panner(position: Readonly<Vec2>, reference = 3): PannerNode {
    const panner = this.context!.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = reference;
    panner.maxDistance = 70;
    panner.rolloffFactor = 1.2;
    panner.positionX.value = position.x;
    panner.positionY.value = 1;
    panner.positionZ.value = position.z;
    return panner;
  }

  private route(priority: Priority, position: Readonly<Vec2> | undefined, at: number, duration: number): AudioNode {
    this.activity[priority] = Math.max(this.activity[priority]!, at + duration);
    this.mix(this.context!.currentTime);
    const bus = this.buses[priority]!;
    if (this.event) this.observe?.({
      type: 'cue', at: performance.now() / 1000 + at - this.context!.currentTime,
      tick: this.event.tick, cue: this.event.type, actorId: this.event.actorId ?? null,
      sector: this.eventSector, weapon: this.eventWeapon, priority,
      position: position ? { x: position.x, z: position.z } : null,
    });
    if (!position) return bus;
    const panner = this.panner(position);
    panner.connect(bus);
    this.routes.push({ node: panner, until: at + duration + 0.1 });
    return panner;
  }

  private mix(now: number): void {
    for (let group = 0; group < this.buses.length; group++) {
      let multiplier = 1;
      for (let higher = 0; higher < group; higher++) {
        if (this.activity[higher]! > now) multiplier = Math.min(multiplier, higher === 0 ? 0.2 : 0.55);
      }
      const level = LEVELS[group]! * multiplier;
      if (level === this.levels[group]) continue;
      const duration = level < this.levels[group]! ? 0.008 : 0.16;
      this.fade(this.buses[group]!.gain, level, duration);
      this.levels[group] = level;
      this.observe?.({ type: 'mix', at: performance.now() / 1000, priority: group, gain: level, ducked: multiplier < 1, duration });
    }
  }

  private fade(parameter: AudioParam, value: number, duration: number): void {
    const now = this.context!.currentTime;
    parameter.cancelAndHoldAtTime(now);
    parameter.linearRampToValueAtTime(value, now + duration);
  }

  private track(source: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
    this.sources.add(source);
    source.onended = () => {
      source.disconnect();
      for (const node of nodes) node.disconnect();
      this.sources.delete(source);
    };
  }

  private envelope(route: AudioNode, at: number, duration: number, amplitude: number): GainNode {
    const gain = this.context!.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(amplitude, at + Math.min(0.008, duration / 8));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    gain.gain.setValueAtTime(0, at + duration + 0.005);
    gain.connect(route);
    return gain;
  }

  private tone(route: AudioNode, frequencies: readonly number[], at: number, duration: number, amplitude: number, wave: OscillatorType): void {
    const oscillator = this.context!.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequencies[0]!, at);
    for (let i = 1; i < frequencies.length; i++) {
      oscillator.frequency.exponentialRampToValueAtTime(frequencies[i]!, at + duration * i / (frequencies.length - 1));
    }
    const gain = this.envelope(route, at, duration, amplitude);
    oscillator.connect(gain);
    this.track(oscillator, gain);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.01);
  }

  private hiss(route: AudioNode, at: number, duration: number, amplitude: number, type: BiquadFilterType, frequency: number): void {
    const source = this.context!.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context!.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    const gain = this.envelope(route, at, duration, amplitude);
    source.connect(filter).connect(gain);
    this.track(source, filter, gain);
    source.start(at, 0, duration + 0.01);
  }

  private material(route: AudioNode, weapon: Weapon, at: number, amplitude: number): void {
    if (weapon === 'Sword') {
      this.tone(route, [1320, 1270], at, 0.21, amplitude, 'sine');
      this.tone(route, [2087, 1980], at, 0.15, amplitude * 0.38, 'sine');
      this.hiss(route, at, 0.06, amplitude * 0.8, 'highpass', 2900);
    } else {
      this.tone(route, [240, 160], at, 0.12, amplitude, 'triangle');
      this.hiss(route, at, 0.09, amplitude * 1.7, 'bandpass', 640);
    }
  }

  private footstep(route: AudioNode, at: number): void {
    // These exact samples, envelopes, and equipment frequencies never vary with surface or gait.
    this.hiss(route, at, 0.11, 0.48, 'lowpass', 420);
    this.tone(route, [85, 52], at, 0.1, 0.28, 'sine');
    this.hiss(route, at + 0.045, 0.11, 0.2, 'bandpass', 1800);
    this.tone(route, [930, 860], at + 0.045, 0.08, 0.065, 'sine');
  }

  dispose(): void {
    const context = this.context;
    this.context = null;
    if (context) context.onstatechange = null;
    for (const source of this.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* A finished one-shot may already have stopped. */ }
      source.disconnect();
    }
    this.sources.clear();
    for (const route of this.routes) route.node.disconnect();
    for (const bus of this.buses) bus.disconnect();
    this.music?.disconnect();
    this.ambience?.disconnect();
    this.ambiencePosition?.disconnect();
    this.routes = [];
    this.buses = [];
    this.levels = [];
    this.activity.fill(0);
    this.noise = null;
    this.music = null;
    this.ambience = null;
    this.ambiencePosition = null;
    this.musicLevel = -1;
    this.ambienceLevel = -1;
    this.scene = null;
    this.outcomeUntil = 0;
    this.orderResponses = [];
    this.lastOrder = -1;
    this.event = null;
    this.setReadiness('Audio not ready');
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }
}
