import * as THREE from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { Combatant, DeepReadonly, Feedback, Projection, SceneId, Sector, Vec2 } from '../core/types';
import { ARENA_BOUNDS } from '../core/navigation';
import { WEAPONS } from '../content/catalog';

const MAP_SCALE = 12;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const FIELD = new THREE.Vector3(0, 0, -17);
const ACTOR_IDS = ['player', 'companion', 'troop-1', 'troop-2', 'troop-3', 'troop-4', 'enemy', 'bandit-1', 'bandit-2', 'bandit-3', 'bandit-4', 'bandit-5', 'resident-1', 'resident-2', 'resident-3', 'resident-4', 'resident-5', 'giver', 'resident-agent'] as const;
const RESIDENT_PLACES = [[-6, 9], [6, 9], [-7, 18], [7, 19], [0, 23]] as const;
const CAMERA_SOLIDS = [[-16, -10, 8, 14], [10, 16, 8, 14], [-18, -10, 20, 26], [10, 18, 20, 26]].map(
  ([x1, x2, z1, z2]) => new THREE.Box3(new THREE.Vector3(x1 - .18, 0, z1 - .18), new THREE.Vector3(x2 + .18, 9, z2 + .18)),
);
const POSE_JOINTS = ['Torso', 'Head', 'RightArm', 'LeftArm', 'RightForearm', 'LeftForearm', 'RightHand', 'LeftHand', 'Sword', 'Staff', 'Shield'] as const;
const STAFF_GRIP_JOINTS: Partial<Record<(typeof POSE_JOINTS)[number], true>> = {
  RightArm: true, LeftArm: true, RightForearm: true, LeftForearm: true,
  RightHand: true, LeftHand: true, Staff: true,
};
const RANGER_BONES = ['Hips', 'Torso', 'Head', 'RightArm', 'RightForearm', 'RightHand', 'LeftArm', 'LeftForearm', 'LeftHand', 'RightLeg', 'RightShin', 'RightFoot', 'LeftLeg', 'LeftShin', 'LeftFoot', 'Cloak', 'Helmet'] as const;
const EQUIPMENT_PARENTS = { Sword: 'RightHand', Staff: 'RightHand', Shield: 'LeftForearm' } as const;
const ANIMATION_JOINTS = [...RANGER_BONES, 'Sword', 'Staff', 'Shield'] as const;

type House = { x: number; z: number; width: number; depth: number; height: number; roof: string; door: number };
type Landscape = {
  id: SceneId; asset: string; title: string;
  palette: Record<'sky' | 'fog' | 'earth' | 'path' | 'water' | 'timber' | 'plaster' | 'roof', string>;
  houses: House[]; groves: number[][]; fields: number[][]; hills: number[][]; fences: number[][];
  props: [number, number, string][];
};
type Batch = { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; matrices: THREE.Matrix4[] };
type Actor = {
  root: THREE.Group; figure: THREE.Object3D; joints: Record<string, THREE.Object3D>;
  mixer: THREE.AnimationMixer; walk: THREE.AnimationAction; idle: THREE.AnimationAction;
  materials: THREE.MeshStandardMaterial[]; trail: THREE.Mesh; shadow: THREE.Mesh;
  flash: number; parry: number; reaction: number;
  lastX: number; lastZ: number; gait: number; present: boolean;
  poseAction: string; poseSector: Sector | null; poseBlend: number;
  poseFrom: THREE.Quaternion[]; poseLast: THREE.Quaternion[]; poseRest: THREE.Quaternion[];
  animationRotations: THREE.Quaternion[]; animationPositions: THREE.Vector3[];
  equipmentRest: Record<keyof typeof EQUIPMENT_PARENTS, THREE.Quaternion>;
};

export interface StagedScene {
  commit(): void;
  rollback(): void;
}

/** Read-only gameplay presentation; staged Scene resources commit together with state entry. */
export class GameRenderer {
  private readonly renderer: THREE.WebGPURenderer;
  private readonly camera = new THREE.PerspectiveCamera(51, 1, .08, 1100);
  private scene = new THREE.Scene();
  private sceneId: SceneId | null = null;
  private arena = false;
  private geometry = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private actors = new Map<string, Actor>();
  private readonly ray = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(UP, 0);
  private readonly point = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly screen = new THREE.Vector3();
  private readonly transform = new THREE.Object3D();
  private readonly pointer = new THREE.Vector2();
  private readonly ikStart = new THREE.Vector3();
  private readonly ikJoint = new THREE.Vector3();
  private readonly ikEnd = new THREE.Vector3();
  private readonly ikDirection = new THREE.Vector3();
  private readonly ikPole = new THREE.Vector3();
  private readonly ikElbow = new THREE.Vector3();
  private readonly ikFrom = new THREE.Vector3();
  private readonly ikTo = new THREE.Vector3();
  private readonly ikDelta = new THREE.Quaternion();
  private readonly ikWorld = new THREE.Quaternion();
  private readonly ikParent = new THREE.Quaternion();
  private readonly staffRotation = new THREE.Quaternion();
  private readonly staffHandRotation = new THREE.Quaternion();
  private readonly staffMidpoint = new THREE.Vector3();
  private readonly staffAxis = new THREE.Vector3();
  private readonly staffTarget = new THREE.Vector3();
  private readonly staffOffset = new THREE.Vector3();
  private readonly staffEuler = new THREE.Euler();
  private readonly overlay: HTMLDivElement;
  private readonly indicators: HTMLDivElement[] = [];
  private markers: THREE.Group[] = [];
  private invalid: THREE.Group | null = null;
  private destination: THREE.Group | null = null;
  private banner: THREE.Group | null = null;
  private intact = new THREE.Group();
  private damaged = new THREE.Group();
  private smoke: THREE.Mesh[] = [];
  private river: THREE.Mesh | null = null;
  private gltf: GLTF | null = null;
  private yaw = Math.PI;
  private pitch = .31;
  private distance = 6.2;
  private mapDistance = 43;
  private clock = 0;
  private width = 0;
  private height = 0;
  private snapCamera = true;
  private lastPhase = '';
  private ready = false;
  private disposed = false;

  private constructor(private readonly canvas: HTMLCanvasElement, private readonly device: GPUDevice) {
    this.renderer = new THREE.WebGPURenderer({ canvas, device, forceWebGL: false, antialias: true, alpha: false, colorBufferType: THREE.HalfFloatType });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.16;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.overlay = document.createElement('div');
    this.overlay.setAttribute('aria-hidden', 'true');
    this.overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;overflow:hidden';
    for (let i = 0; i < 2; i++) {
      const indicator = document.createElement('div');
      indicator.style.cssText = `position:absolute;display:none;width:11px;height:11px;border-top:2px solid ${i ? '#e4c48a' : '#a8d4ca'};border-right:2px solid ${i ? '#e4c48a' : '#a8d4ca'};filter:drop-shadow(0 1px 2px #172723);opacity:.72`;
      this.overlay.append(indicator);
      this.indicators.push(indicator);
    }
    document.body.append(this.overlay);
  }

  static async create(canvas: HTMLCanvasElement, device: GPUDevice): Promise<GameRenderer> {
    const view = new GameRenderer(canvas, device);
    try {
      await view.renderer.init();
      if (!('isWebGPUBackend' in view.renderer.backend) || view.renderer.backend.isWebGPUBackend !== true) {
        throw new Error('WebGPU backend required. Three.js WebGL fallback is unsupported.');
      }
      console.info('[scene:startup] [asset:renderer] WebGPU backend ready');
      return view;
    } catch (error) {
      view.dispose();
      throw error;
    }
  }

  async stage(scene: SceneId, onProgress: (stage: string, progress: number) => void, arena = false): Promise<StagedScene> {
    const previous = {
      scene: this.scene, sceneId: this.sceneId, arena: this.arena, geometry: this.geometry, materials: this.materials, actors: this.actors,
      markers: this.markers, invalid: this.invalid, destination: this.destination, banner: this.banner,
      intact: this.intact, damaged: this.damaged, smoke: this.smoke, river: this.river, gltf: this.gltf,
      yaw: this.yaw, pitch: this.pitch, ready: this.ready, snapCamera: this.snapCamera, lastPhase: this.lastPhase,
    };
    const previousCamera = this.camera.clone();
    let pending = true;
    const rollback = () => {
      if (!pending) return;
      pending = false;
      this.releaseScene();
      Object.assign(this, previous);
      this.camera.copy(previousCamera);
    };
    this.ready = false;
    this.sceneId = scene;
    this.arena = arena;
    this.scene = new THREE.Scene();
    this.geometry = new Map(); this.materials = new Map(); this.actors = new Map();
    this.markers = []; this.smoke = []; this.gltf = null;
    this.invalid = null; this.destination = null; this.banner = null; this.river = null;
    const report = (stage: string, progress: number, asset: string) => {
      console.info(`[scene:${scene}] [asset:${asset}] ${stage}`, { progress });
      onProgress(stage, progress);
    };
    let asset = `${scene}.scene.json`;
    let stage = 'Asset download';
    try {
      report(stage, 0, asset);
      const manifestBytes = await this.download(asset, fraction => report(stage, fraction * .12, asset));
      stage = 'Asset decode';
      report(stage, .14, asset);
      const landscape = JSON.parse(new TextDecoder().decode(manifestBytes)) as Landscape;
      if (landscape.id !== scene) throw new Error(`Scene manifest identifies ${landscape.id}, expected ${scene}`);
      asset = landscape.asset;
      stage = 'Asset download';
      report(stage, .17, asset);
      const model = await this.download(asset, fraction => report(stage, .17 + fraction * .30, asset));
      stage = 'Asset decode';
      report(stage, .49, asset);
      this.gltf = await new GLTFLoader().parseAsync(model, '/assets/');
      this.buildLandscape(landscape);
      if (scene === 'settlement') {
        for (const id of ACTOR_IDS) this.createActor(id);
      }
      report(stage, .65, asset);
      this.resize();
      if (scene === 'overworld') {
        this.yaw = Math.PI - .28;
        this.pitch = .72;
        this.target.set(0, 0, 8);
        this.camera.position.set(20, 35, 43);
        this.camera.lookAt(this.target);
      } else {
        this.yaw = Math.PI;
        this.pitch = .31;
        this.target.set(0, 1.2, 14);
        this.camera.position.set(.65, 3.0, 20);
        this.camera.lookAt(0, 1.1, 10);
      }
      this.camera.updateMatrixWorld();
      stage = 'GPU upload';
      asset = `${scene}:landscape+frontier-human`;
      report(stage, .70, asset);
      // Match the live HDR/MSAA framebuffer so first gameplay does not compile different pipelines.
      const stagingTarget = new THREE.RenderTarget(this.width, this.height, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace, samples: this.renderer.samples });
      const previousTarget = this.renderer.getRenderTarget();
      const damagedVisible = this.damaged.visible;
      this.damaged.visible = true;
      this.device.pushErrorScope('validation');
      let gpuError: GPUError | null;
      try {
        this.renderer.setRenderTarget(stagingTarget);
        await this.renderer.compileAsync(this.scene, this.camera);
        await this.renderer.renderAsync(this.scene, this.camera);
        await this.device.queue.onSubmittedWorkDone();
      } finally {
        this.renderer.setRenderTarget(previousTarget);
        stagingTarget.dispose();
        this.damaged.visible = damagedVisible;
        gpuError = await this.device.popErrorScope();
      }
      if (gpuError) throw new Error(gpuError.message);
      report(stage, .94, asset);
      stage = 'Scene readiness';
      this.snapCamera = true;
      this.lastPhase = '';
      report(stage, 1, scene);
      this.ready = true;
    } catch (error) {
      rollback();
      console.error(`[scene:${scene}] [asset:${asset}] ${stage} failed; staged resources discarded, previous Scene retained`, error);
      throw error;
    }
    return {
      commit: () => {
        if (!pending) throw new Error('The staged Scene has already been settled.');
        pending = false;
        this.disposeSceneData(previous.scene, previous.gltf, previous.actors, previous.geometry, previous.materials);
      },
      rollback,
    };
  }

  private async download(asset: string, progress: (fraction: number) => void): Promise<ArrayBuffer> {
    const response = await fetch(`/assets/${asset}`);
    if (!response.ok) throw new Error(`${asset}: HTTP ${response.status}`);
    const total = Number(response.headers.get('content-length'));
    if (!response.body) throw new Error(`${asset}: response body unavailable`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
      bytes += next.value.byteLength;
      if (total > 0) progress(Math.min(bytes / total, 1));
    }
    const result = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    progress(1);
    return result.buffer;
  }

  private meshGeometry(kind: string): THREE.BufferGeometry {
    const cached = this.geometry.get(kind);
    if (cached) return cached;
    let value: THREE.BufferGeometry;
    if (kind === 'box') value = new THREE.BoxGeometry(1, 1, 1);
    else if (kind === 'cone') value = new THREE.ConeGeometry(1, 1, 7);
    else if (kind === 'rock') value = new THREE.IcosahedronGeometry(1, 0);
    else if (kind === 'cylinder') value = new THREE.CylinderGeometry(1, 1, 1, 9);
    else if (kind === 'ring') value = new THREE.RingGeometry(.87, 1, 48);
    else if (kind === 'disc') value = new THREE.CircleGeometry(1, 28);
    else if (kind === 'roof') {
      const vertices = new Float32Array([
        -.5, 0, -.5, 0, 1, -.5, .5, 0, -.5,
        .5, 0, .5, 0, 1, .5, -.5, 0, .5,
        -.5, 0, -.5, 0, 1, .5, 0, 1, -.5, -.5, 0, -.5, -.5, 0, .5, 0, 1, .5,
        0, 1, -.5, .5, 0, .5, .5, 0, -.5, 0, 1, -.5, 0, 1, .5, .5, 0, .5,
      ]);
      value = new THREE.BufferGeometry();
      value.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      value.computeVertexNormals();
    } else throw new Error(`Unknown authored geometry ${kind}`);
    this.geometry.set(kind, value);
    return value;
  }

  private material(color: string, metalness = 0): THREE.MeshStandardMaterial {
    const key = `${color}:${metalness}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: metalness ? .58 : .96, metalness, flatShading: true });
      this.materials.set(key, material);
    }
    return material;
  }

  private buildLandscape(data: Landscape): void {
    const map = data.id === 'overworld';
    const palette = data.palette;
    this.scene.background = new THREE.Color(palette.sky);
    this.scene.fog = new THREE.Fog(palette.fog, map ? 70 : 48, map ? 215 : 140);
    const ambient = new THREE.HemisphereLight('#e3e4c4', '#394b49', 2.1);
    const sun = new THREE.DirectionalLight('#ffdab0', 3.4);
    sun.position.set(-35, 54, 28);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = map ? -43 : -35;
    sun.shadow.camera.right = sun.shadow.camera.top = map ? 43 : 35;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 145;
    sun.shadow.normalBias = .035;
    sun.shadow.bias = -.0002;
    this.scene.add(ambient, sun, sun.target);
    const batches = new Map<string, Batch>();
    const safeBatches = new Map<string, Batch>();
    const damageBatches = new Map<string, Batch>();
    const add = (kind: string, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rz = 0, pool = batches) => {
      const key = `${kind}:${color}`;
      let batch = pool.get(key);
      if (!batch) { batch = { geometry: this.meshGeometry(kind), material: this.material(color), matrices: [] }; pool.set(key, batch); }
      this.transform.position.set(x, y, z);
      this.transform.rotation.set(0, ry, rz);
      this.transform.scale.set(sx, sy, sz);
      this.transform.updateMatrix();
      batch.matrices.push(this.transform.matrix.clone());
    };
    const line = (a: THREE.Vector3, b: THREE.Vector3, width: number, color: string, pool = batches) => {
      const length = a.distanceTo(b);
      const key = `box:${color}`;
      let batch = pool.get(key);
      if (!batch) { batch = { geometry: this.meshGeometry('box'), material: this.material(color), matrices: [] }; pool.set(key, batch); }
      this.transform.position.copy(a).add(b).multiplyScalar(.5);
      this.transform.quaternion.setFromUnitVectors(UP, this.point.copy(b).sub(a).normalize());
      this.transform.scale.set(width, length, width);
      this.transform.updateMatrix();
      batch.matrices.push(this.transform.matrix.clone());
    };
    const flush = (pool: Map<string, Batch>, parent: THREE.Object3D) => {
      for (const batch of pool.values()) {
        const instances = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
        batch.matrices.forEach((m, i) => instances.setMatrixAt(i, m));
        instances.castShadow = true;
        instances.receiveShadow = true;
        instances.computeBoundingSphere();
        parent.add(instances);
      }
    };
    if (this.arena) {
      const { minX, maxX, minZ, maxZ } = ARENA_BOUNDS;
      const centerZ = (minZ + maxZ) / 2;
      this.scene.background = new THREE.Color('#b5ad97');
      this.scene.fog = new THREE.Fog('#b5ad97', 35, 100);
      add('box', '#77634c', 0, -.3, centerZ, 200, .6, 200);
      add('box', '#af9265', 0, -.02, centerZ, maxX - minX, .04, maxZ - minZ);
      for (let i = 0; i < 90; i++) {
        const x = Math.sin(i * 18.71) * 7.3;
        const z = centerZ + Math.cos(i * 11.17) * 8.2;
        add('rock', i % 2 ? '#a58a62' : '#b69b72', x, .002, z, .08 + i % 4 * .045, .009, .16, i);
      }
      for (const x of [minX - .12, maxX + .12]) {
        for (let z = minZ; z <= maxZ; z += 2) {
          add('box', '#544331', x, .75, z, .24, 1.5, .24);
          add('cone', '#66513a', x, 1.55, z, .17, .2, .17);
        }
        for (const y of [.45, 1.05]) add('box', '#786043', x, y, centerZ, .17, .19, maxZ - minZ + .3);
        for (let tier = 0; tier < 3; tier++) {
          add('box', '#71634e', x + Math.sign(x) * (1.2 + tier * 1.0), .22 + tier * .25, centerZ, .9, .32 + tier * .5, maxZ - minZ - 2);
        }
      }
      for (const z of [minZ - .12, maxZ + .12]) {
        for (let x = minX; x <= maxX; x += 2) add('box', '#544331', x, .75, z, .24, 1.5, .24);
        for (const y of [.45, 1.05]) add('box', '#786043', 0, y, z, maxX - minX + .3, .19, .17);
      }
      for (const side of [-1, 1]) {
        const x = side * (maxX + .35);
        add('box', '#51432f', x, 1.9, minZ - .35, .13, 3.8, .13);
        add('box', side < 0 ? '#445e5c' : '#804b37', x, 2.8, minZ - .35, .8, 1.15, .055);
        add('box', '#b5a078', x, 2.8, minZ - .31, .075, 1.0, .02);
      }
      flush(batches, this.scene);
      this.intact = new THREE.Group(); this.damaged = new THREE.Group();
      this.scene.add(this.intact, this.damaged);
      this.markers = [this.makeMarker('#acd6cb', .80), this.makeMarker('#e1c68d', 1.1)];
      this.invalid = this.makeMarker('#d27659', .8);
      return;
    }
    const groundSize = map ? 760 : 260;
    if (map) add('box', palette.earth, 0, -.42, 0, groundSize, .8, groundSize);
    else {
      add('box', palette.earth, 0, -.5, 68, groundSize, 1, 130);
      add('box', '#66745c', 0, -.5, -68, groundSize, 1, 130);
      add('box', '#475a51', 0, -.80, 0, groundSize, .4, 6);
      add('box', '#8b9470', 0, -.04, 3.30, 120, .16, .6);
      add('box', '#7b8968', 0, -.04, -3.30, 120, .16, .6);
    }
    add('box', palette.path, 0, .012, map ? 24 : 16, map ? 2.0 : 5.7, .024, map ? 48 : 25.8);
    if (!map) {
      add('box', '#ad9d79', 0, .023, 14, 19.8, .026, 5.0);
      add('box', '#a39271', 0, .012, -17, 4.2, .024, 28);
      for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 32; i++) {
        const x = side * (3 + i * 1.5);
        add('rock', i % 3 ? '#808670' : '#6e7867', x, -.17, 3.02 + Math.sin(i * 2) * .16, .55 + (i % 3) * .2, .37, .52);
        add('rock', '#798571', x, -.16, -3.03 + Math.cos(i) * .15, .58, .34, .48);
      }
    }
    const water = new THREE.MeshStandardMaterial({ color: palette.water, roughness: .43, metalness: .2, transparent: true, opacity: .88 });
    this.river = new THREE.Mesh(this.meshGeometry('box'), water);
    this.river.position.set(0, map ? -.035 : -.32, map ? -8 : 0);
    this.river.scale.set(map ? 150 : 250, .04, map ? 2.2 : 5.9);
    this.river.receiveShadow = true;
    this.scene.add(this.river);
    for (let i = 0; i < (map ? 35 : 55); i++) {
      add('box', '#789791', -53 + i * 2.13, map ? -.009 : -.287, (map ? -8 : 0) + Math.sin(i * 1.7) * (map ? .7 : 2.4), .5 + (i % 4) * .23, .008, .028);
    }
    const bridgeWidth = map ? 1.9 : 4;
    const bridgeLength = map ? 3.2 : 6.5;
    const bridgeZ = map ? -8 : 0;
    for (let i = 0; i < 24; i++) add('box', i % 3 ? '#8a7552' : '#9c8760', 0, .018, bridgeZ - bridgeLength / 2 + i * bridgeLength / 23, bridgeWidth, .12, bridgeLength / 24 - .015);
    for (const side of [-1, 1]) {
      // Rails are outside the traversable bridge width; visual and physics crossing agree.
      const x = side * (bridgeWidth / 2 + .10);
      for (let i = 0; i < 5; i++) add('box', palette.timber, x, .46, bridgeZ - bridgeLength / 2 + i * bridgeLength / 4, .14, 1, .16);
      add('box', '#706047', x, .83, bridgeZ, .10, .10, bridgeLength + .3);
      add('box', '#65583f', x, .39, bridgeZ, .08, .08, bridgeLength + .3);
      add('box', '#514a39', side * bridgeWidth * .32, -.20, bridgeZ, .25, .28, bridgeLength + .5);
    }
    for (let index = 0; index < data.houses.length; index++) {
      const h = data.houses[index];
      const { x, z, width: w, depth: d, height: ht } = h;
      const roofHeight = w * .51;
      add('box', '#767763', x, .25, z, w, .5, d);
      add('box', index % 2 ? '#bcaf8d' : palette.plaster, x, ht / 2 + .25, z, w - .03, ht - .5, d - .03);
      for (const xx of [-1, 1]) for (const zz of [-1, 1]) add('box', palette.timber, x + xx * (w / 2 - .10), ht / 2, z + zz * (d / 2 - .10), .20, ht, .20);
      for (const zz of [-1, 1]) {
        add('box', palette.timber, x, ht * .56, z + zz * d / 2, w, .14, .12);
        add('box', palette.timber, x, ht - .08, z + zz * d / 2, w + .1, .18, .16);
        for (const xx of [-.28, 0, .28]) add('box', palette.timber, x + xx * w, ht * .72, z + zz * d / 2, .12, ht * .54, .13);
        line(new THREE.Vector3(x - w * .45, ht * .54, z + zz * (d / 2 + .018)), new THREE.Vector3(x - w * .10, ht - .10, z + zz * (d / 2 + .018)), .09, palette.timber);
        line(new THREE.Vector3(x + w * .45, ht * .54, z + zz * (d / 2 + .018)), new THREE.Vector3(x + w * .10, ht - .10, z + zz * (d / 2 + .018)), .09, palette.timber);
      }
      const roofPool = index < 2 && !map ? safeBatches : batches;
      add('roof', h.roof, x, ht, z, w + .75, roofHeight, d + .85, 0, 0, roofPool);
      add('box', '#514438', x, ht + roofHeight + .04, z, .20, .17, d + 1.0, 0, 0, roofPool);
      const slope = Math.atan2(roofHeight, (w + .75) / 2);
      for (const side of [-1, 1]) for (let j = 1; j < 6; j++) {
        const f = j / 6;
        add('box', index % 2 ? '#626257' : '#8b6750', x + side * (w + .75) / 2 * f, ht + roofHeight * (1 - f) + .035, z, .025, .035, d + .89, 0, side * -slope, roofPool);
      }
      // The masonry shaft remains supported when the roof is destroyed.
      const chimneyTop = ht + roofHeight * .9 + .725;
      const chimneyBottom = ht - .04;
      add('box', '#776f5d', x - w * .22, (chimneyTop + chimneyBottom) / 2, z + d * .22, .55, chimneyTop - chimneyBottom, .6);
      add('box', '#4d4e42', x - w * .22, chimneyTop + .005, z + d * .22, .67, .14, .72);
      // Side-wall doors open onto the village lane, not into invisible scenery.
      const doorX = x + h.door * (w / 2 + .025);
      add('box', '#494c3e', doorX, .86, z, .045, 1.7, .86);
      add('box', '#ad956b', doorX + h.door * .035, .86, z, .03, 1.62, .055);
      for (const dz of [-d * .28, d * .28]) {
        add('box', '#454e43', doorX, ht * .67, z + dz, .05, .72, .74);
        add('box', '#c8aa69', doorX + h.door * .04, ht * .67, z + dz, .04, .05, .76);
        add('box', '#6d6450', doorX + h.door * .04, ht * .67, z + dz, .04, .76, .06);
      }
      if (index < 2 && !map) {
        add('roof', '#444c42', x, ht, z, w + .65, roofHeight * .25, d + .7, .035, .08, damageBatches);
        for (let r = 0; r < 6; r++) line(new THREE.Vector3(x - w / 2, ht, z - d / 2 + r * d / 5), new THREE.Vector3(x + .2, ht + roofHeight * .85, z - d / 2 + r * d / 5), .14, '#393c33', damageBatches);
        add('box', '#414a3d', x, .02, z, w + .2, .025, d + .2, 0, 0, damageBatches);
      }
    }
    for (const [cx, cz, sx, sz] of data.fields) {
      add('box', '#84754f', cx, .02, cz, sx, .03, sz);
      for (let i = 0; i < 12; i++) {
        const x = cx - sx * .45 + i * sx * .9 / 11;
        add('box', '#b5a269', x, .19, cz, sx / 29, .35, sz * .94);
        add('box', '#c7b578', x, .38, cz, sx / 48, .08, sz * .91);
      }
    }
    let treeIndex = 0;
    for (const [cx, cz, sx, sz, count] of data.groves) for (let i = 0; i < count; i++) {
      const t = treeIndex++;
      const x = cx + (Math.sin(t * 17.31) * .5) * sx;
      const z = cz + (Math.cos(t * 12.73) * .5) * sz;
      const height = (map ? 2.1 : 4.6) + (Math.sin(t * 3.1) + 1) * (map ? 1.5 : 2.2);
      const shade = ['#344e43', '#3d5847', '#48624b', '#586e4c'][t % 4];
      add('cylinder', '#5a5140', x, height * .36, z, .13, height * .72, .13);
      for (let tier = 0; tier < 3; tier++) add('cone', shade, x, height * (.43 + tier * .21), z, height * (.29 - tier * .055), height * .57, height * (.29 - tier * .055), t);
    }
    for (let i = 0; i < data.hills.length; i++) {
      const [x, z, sx, sy, sz] = data.hills[i];
      add('rock', ['#64796a', '#718473', '#596f66'][i % 3], x, sy * .18, z, sx, sy, sz, i * .7);
    }
    for (const [x1, z1, x2, z2] of data.fences) {
      const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 1.8);
      for (let i = 0; i <= steps; i++) add('box', '#807153', x1 + (x2 - x1) * i / steps, .57, z1 + (z2 - z1) * i / steps, .13, 1.2, .16);
      for (const y of [.42, .88]) line(new THREE.Vector3(x1, y, z1), new THREE.Vector3(x2, y, z2), .085, '#827354');
    }
    for (const [x, z, kind] of data.props) {
      if (kind === 'barrel') {
        add('cylinder', '#8b7652', x, .48, z, .36, .92, .36);
        for (const y of [.15, .75]) add('cylinder', '#4b554b', x, y, z, .37, .07, .37);
      } else if (kind === 'woodpile') {
        for (let i = 0; i < 8; i++) add('box', '#796548', x + (i % 3) * .25, .16 + Math.floor(i / 3) * .22, z, .22, .2, 1.8, .05 * i);
      } else if (kind === 'cart') {
        add('box', '#81714f', x, .64, z, 1.4, .14, 2);
        for (const side of [-1, 1]) { add('box', '#8e7c57', x + side * .65, .92, z, .09, .5, 2); add('rock', '#535547', x + side * .8, .42, z, .15, .5, .5); }
        add('box', '#81714f', x, .61, z + 1.6, .10, .12, 1.5);
      } else {
        add('cylinder', '#858672', x, .5, z, 1.0, .9, 1.0);
        add('cylinder', '#384f4c', x, .96, z, .73, .02, .73);
        for (const side of [-1, 1]) add('box', '#635740', x + side * .9, 1.5, z, .13, 2.3, .15);
        add('roof', '#80654a', x, 2.5, z, 2.4, .8, 1.8);
      }
    }
    // Flat meadow tufts and stones cannot obstruct the movement plane.
    for (let i = 0; i < (map ? 90 : 190); i++) {
      const x = Math.sin(i * 18.71) * (map ? 45 : 21);
      const z = Math.cos(i * 11.17) * (map ? 43 : 25);
      if (Math.abs(x) < (map ? 2.5 : 4) || (!map && Math.abs(z) < 3.6)) continue;
      add('cone', i % 3 ? '#8b936b' : '#a1a374', x, .085, z, .035, .17, .055, i * .3);
    }
    flush(batches, this.scene);
    this.intact = new THREE.Group(); this.damaged = new THREE.Group();
    flush(safeBatches, this.intact); flush(damageBatches, this.damaged);
    this.damaged.visible = false;
    this.scene.add(this.intact, this.damaged);
    if (!map) {
      for (let i = 0; i < 12; i++) {
        const smokeMaterial = new THREE.MeshBasicMaterial({ color: '#4a5149', transparent: true, opacity: .15, depthWrite: false });
        const puff = new THREE.Mesh(this.meshGeometry('rock'), smokeMaterial);
        puff.position.set(i % 2 ? 13 : -13, 5 + i * .5, 11);
        this.smoke.push(puff);
        this.damaged.add(puff);
      }
      this.markers = [this.makeMarker('#acd6cb', .80), this.makeMarker('#e1c68d', 1.1)];
      this.invalid = this.makeMarker('#d27659', .8);
    } else {
      const entry = this.makeMarker('#d5bd7d', 6);
      entry.visible = true;
      entry.position.set(0, .055, 0);
      this.destination = this.makeMarker('#efe2b8', .7);
      this.banner = this.makeBanner();
      this.scene.add(this.banner);
    }
  }

  private makeMarker(color: string, radius: number): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .68, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(this.meshGeometry('ring'), material);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(radius);
    group.add(ring);
    const inner = new THREE.Mesh(this.meshGeometry('ring'), material);
    inner.rotation.x = -Math.PI / 2;
    inner.scale.setScalar(radius * .67);
    group.add(inner);
    group.position.y = .075;
    group.visible = false;
    this.scene.add(group);
    return group;
  }

  private makeBanner(): THREE.Group {
    const root = new THREE.Group();
    const pole = new THREE.Mesh(this.meshGeometry('cylinder'), this.material('#594c36'));
    pole.scale.set(.045, 3.8, .045); pole.position.y = 1.9;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(1.5, -.12); shape.lineTo(1.23, -.73); shape.lineTo(1.42, -1.25); shape.lineTo(0, -1.08); shape.closePath();
    const cloth = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: '#2e5d63', roughness: .95, side: THREE.DoubleSide }));
    cloth.name = 'BannerCloth'; cloth.position.set(.03, 3.55, .02); cloth.castShadow = true;
    const emblem = new THREE.Mesh(this.meshGeometry('ring'), new THREE.MeshBasicMaterial({ color: '#d4bb7f', side: THREE.DoubleSide }));
    emblem.position.set(.55, 3.0, .035); emblem.scale.setScalar(.27);
    const base = new THREE.Mesh(this.meshGeometry('disc'), new THREE.MeshBasicMaterial({ color: '#e1d3a5', transparent: true, opacity: .75 }));
    base.rotation.x = -Math.PI / 2; base.position.y = .06; base.scale.setScalar(.6);
    root.add(pole, cloth, emblem, base);
    return root;
  }

  private createActor(id: string): Actor {
    if (!this.gltf) throw new Error('Character glTF has not decoded');
    const figure = cloneSkeleton(this.gltf.scene);
    const joints: Record<string, THREE.Object3D> = {};
    const materials: THREE.MeshStandardMaterial[] = [];
    const actorMaterials = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
    const raider = id === 'enemy' || id.startsWith('bandit-');
    const resident = id.startsWith('resident-') || id === 'giver';
    const teamColor = raider ? '#765046' : id === 'companion' || id.startsWith('troop-') ? '#8b815e' : null;
    figure.traverse(object => {
      if (ANIMATION_JOINTS.some(name => name === object.name)) {
        if (joints[object.name]) throw new Error(`Character asset has duplicate authored node ${object.name}`);
        joints[object.name] = object;
      }
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = object.receiveShadow = true;
      if (object.userData.ranger_deform === 'cape') object.visible = id === 'player' || id === 'companion' || id === 'enemy';
      const clone = (source: THREE.MeshStandardMaterial) => {
        let material = actorMaterials.get(source);
        if (!material) {
          material = source.clone();
          if (teamColor && (source.name === 'Cloth' || source.name === 'CloakEdge' || source.name === 'Stitch')) material.color.lerp(new THREE.Color(teamColor), .35);
          actorMaterials.set(source, material); materials.push(material);
        }
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(m => clone(m as THREE.MeshStandardMaterial)) : clone(object.material as THREE.MeshStandardMaterial);
    });
    for (const name of RANGER_BONES) {
      if (!(joints[name] instanceof THREE.Bone)) throw new Error(`Character asset is missing authored bone ${name}`);
    }
    for (const [name, parent] of Object.entries(EQUIPMENT_PARENTS)) {
      const equipment = joints[name];
      if (!equipment || equipment instanceof THREE.Mesh || equipment instanceof THREE.Bone || equipment.parent !== joints[parent]) {
        throw new Error(`Character asset requires ${name} equipment group parented to ${parent}`);
      }
      let hasMesh = false;
      equipment.traverse(object => { if (object instanceof THREE.Mesh) hasMesh = true; });
      if (!hasMesh) throw new Error(`Character equipment ${name} has no child meshes`);
    }
    joints.Cloak.visible = id === 'player' || id === 'companion' || id === 'enemy';
    joints.Helmet.visible = id === 'enemy';
    joints.Sword.visible = !resident && !id.startsWith('troop-');
    joints.Staff.visible = id.startsWith('troop-');
    joints.Shield.visible = id === 'player' || id === 'enemy';
    const root = new THREE.Group();
    root.name = `combatant:${id}`;
    root.add(figure);
    if (id === 'enemy') figure.scale.set(1.09, 1.05, 1.09);
    else if (id === 'companion') figure.scale.set(1.03, 1.03, 1.03);
    else if (resident) figure.scale.set(.94, .97, .94);
    const shadow = new THREE.Mesh(this.meshGeometry('disc'), new THREE.MeshBasicMaterial({ color: '#20362e', transparent: true, opacity: .19, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .012; shadow.scale.set(.44, .33, 1);
    root.add(shadow);
    const trail = new THREE.Mesh(new THREE.RingGeometry(.8, 1.0, 18, 1, 0, Math.PI * .8), new THREE.MeshBasicMaterial({ color: raider ? '#e7ac7a' : '#e7dfb9', transparent: true, opacity: .0, side: THREE.DoubleSide, depthWrite: false }));
    trail.position.set(0, 1.2, .65); trail.visible = false; root.add(trail);
    const mixer = new THREE.AnimationMixer(figure);
    const walkClip = THREE.AnimationClip.findByName(this.gltf.animations, 'Walk');
    const idleClip = THREE.AnimationClip.findByName(this.gltf.animations, 'Idle');
    if (!walkClip || !idleClip) throw new Error('Character asset is missing Walk or Idle animation');
    const walk = mixer.clipAction(walkClip).play(); walk.setEffectiveWeight(0);
    const idle = mixer.clipAction(idleClip).play();
    const actor: Actor = {
      root, figure, joints, mixer, walk, idle, materials, trail, shadow,
      flash: 0, parry: 0, reaction: 0, lastX: 0, lastZ: 0, gait: 0, present: false,
      poseAction: '', poseSector: null, poseBlend: 1,
      poseFrom: POSE_JOINTS.map(() => new THREE.Quaternion()),
      poseLast: POSE_JOINTS.map(name => joints[name].quaternion.clone()),
      poseRest: POSE_JOINTS.map(() => new THREE.Quaternion()),
      animationRotations: ANIMATION_JOINTS.map(name => joints[name].quaternion.clone()),
      animationPositions: ANIMATION_JOINTS.map(name => joints[name].position.clone()),
      equipmentRest: { Sword: joints.Sword.quaternion.clone(), Staff: joints.Staff.quaternion.clone(), Shield: joints.Shield.quaternion.clone() },
    };
    this.actors.set(id, actor);
    this.scene.add(root);
    return actor;
  }

  feedback(events: readonly Feedback[]): void {
    for (const event of events) {
      const actor = event.actorId ? this.actors.get(event.actorId) : undefined;
      if (!actor) continue;
      if (event.type === 'struck') { actor.flash = .18; actor.reaction = .18; }
      else if (event.type === 'block') actor.parry = .23;
      else if (event.type === 'interrupted') actor.reaction = .22;
    }
  }

  render(state: Projection, dt: number): void {
    if (!this.ready || this.disposed || (!this.arena && state.campaign.scene !== this.sceneId)) return;
    this.resize();
    const elapsed = Math.min(Math.max(dt, 0), .1);
    this.clock += elapsed;
    this.intact.visible = state.campaign.condition !== 'Damaged';
    this.damaged.visible = state.campaign.condition === 'Damaged';
    for (let i = 0; i < this.smoke.length; i++) {
      const cycle = (this.clock * .17 + i / this.smoke.length) % 1;
      const puff = this.smoke[i];
      puff.position.set((i % 2 ? 13 : -13) + cycle * 3.6, 4.5 + cycle * 8, 11 + Math.sin(i) * .7);
      puff.scale.setScalar(.5 + cycle * 2.4);
      (puff.material as THREE.MeshBasicMaterial).opacity = Math.sin(cycle * Math.PI) * .15;
    }
    if (this.sceneId === 'overworld') this.updateMap(state);
    else this.updateActors(state, elapsed);
    this.updateCamera(state, elapsed);
    this.updateMarkers(state);
    this.renderer.render(this.scene, this.camera);
  }

  private updateMap(state: Projection): void {
    if (this.banner) {
      this.banner.position.set(state.campaign.position.x * MAP_SCALE, .04, state.campaign.position.z * MAP_SCALE);
      const cloth = this.banner.getObjectByName('BannerCloth');
      if (cloth) cloth.rotation.y = Math.sin(this.clock * 2) * .12;
    }
    if (this.destination) {
      this.destination.visible = state.destination !== null;
      if (state.destination) this.destination.position.set(state.destination.x * MAP_SCALE, .06, state.destination.z * MAP_SCALE);
    }
  }

  private updateActors(state: Projection, dt: number): void {
    for (const actor of this.actors.values()) actor.present = false;
    for (const combatant of state.combatants) {
      const actor = this.actors.get(combatant.id);
      if (!actor) continue;
      actor.present = true;
      this.pose(actor, combatant, state, dt);
    }
    // Named settlement Agents retain their social identity, separate from battle Combatants.
    if (state.phase === 'Settlement' && !this.arena) {
      this.setResident('giver', 3, 13, -Math.PI / 2, state, dt);
      this.setResident('resident-agent', -3, 15, Math.PI / 2, state, dt);
      for (let i = 0; i < RESIDENT_PLACES.length - state.campaign.casualties.residents; i++) {
        const [x, z] = RESIDENT_PLACES[i];
        this.setResident(`resident-${i + 1}`, x, z, i % 2 ? -.8 : .8, state, dt);
      }
    }
    for (const actor of this.actors.values()) actor.root.visible = actor.present;
  }

  private animateActor(actor: Actor, dt: number): void {
    // Restore the last mixer output, not bind pose: unchanged tracks may skip writes.
    for (let i = 0; i < ANIMATION_JOINTS.length; i++) {
      const joint = actor.joints[ANIMATION_JOINTS[i]];
      joint.quaternion.copy(actor.animationRotations[i]);
      joint.position.copy(actor.animationPositions[i]);
    }
    actor.mixer.update(dt);
    for (let i = 0; i < ANIMATION_JOINTS.length; i++) {
      const joint = actor.joints[ANIMATION_JOINTS[i]];
      actor.animationRotations[i].copy(joint.quaternion);
      actor.animationPositions[i].copy(joint.position);
    }
  }

  private setResident(id: string, x: number, z: number, facing: number, state: Projection, dt: number): void {
    const actor = this.actors.get(id);
    if (!actor || actor.present) return;
    const agent = state.campaign.agents.find(a => a.id === id);
    if ((id === 'giver' || id === 'resident-agent') && (!agent || agent.fate !== 'Active')) return;
    actor.present = true;
    actor.root.position.set(x, 0, z); actor.root.rotation.set(0, facing, 0);
    actor.figure.rotation.set(0, 0, 0); actor.figure.position.set(0, 0, 0);
    actor.walk.setEffectiveWeight(0); actor.idle.setEffectiveWeight(1); this.animateActor(actor, dt);
    actor.joints.Sword.visible = false; actor.joints.Staff.visible = false; actor.joints.Shield.visible = false;
    actor.trail.visible = false;
    for (const material of actor.materials) material.emissive.set('#000000');
  }

  private pose(actor: Actor, c: DeepReadonly<Combatant>, state: Projection, dt: number): void {
    const fate = state.phase === 'Agent fate' && c.id === 'enemy';
    const frozen = state.paused || (state.phase !== 'Settlement' && state.phase !== 'Setup' && state.phase !== 'Battle');
    // Casualty status remains historical in normal play; it does not make the returning player crawl.
    const standing = c.status === 'Active' || (state.phase === 'Settlement' && c.id === 'player');
    const x = fate ? FIELD.x : c.position.x;
    const z = fate ? FIELD.z : c.position.z;
    const moved = Math.hypot(x - actor.lastX, z - actor.lastZ);
    const first = !actor.root.visible || this.snapCamera;
    const previousX = actor.root.position.x, previousZ = actor.root.position.z;
    if (first || moved > 3 || fate) actor.root.position.set(x, 0, z);
    else actor.root.position.lerp(this.point.set(x, 0, z), 1 - Math.exp(-dt * 25));
    actor.lastX = x; actor.lastZ = z;
    // Turn across the camera so the folded shins are not hidden by the thighs.
    const facing = fate ? 1.0 : c.facing;
    const turn = Math.atan2(Math.sin(facing - actor.root.rotation.y), Math.cos(facing - actor.root.rotation.y));
    actor.root.rotation.y += first || fate ? turn : turn * (1 - Math.exp(-dt * 22));
    actor.joints.Sword.visible = c.armed && c.weapon === 'Sword' && !fate;
    actor.joints.Staff.visible = c.armed && c.weapon === 'Staff' && !fate;
    actor.joints.Shield.visible = c.shield && !fate;
    const poseDt = frozen ? 0 : dt;
    const travel = Math.hypot(actor.root.position.x - previousX, actor.root.position.z - previousZ);
    const walking = standing && !fate && !first && travel > .0001 && !frozen;
    actor.gait = THREE.MathUtils.damp(actor.gait, walking ? 1 : 0, 12, poseDt);
    actor.walk.setEffectiveWeight(standing && !fate ? actor.gait : 0);
    actor.idle.setEffectiveWeight(standing && !fate ? 1 - actor.gait : 0);
    // Distance-driven cadence keeps slowed combat steps from skating at the idle run rate.
    if (walking && dt > 0) actor.walk.setEffectiveTimeScale(THREE.MathUtils.clamp(travel / dt / 1.65, .35, 2.4));
    const j = actor.joints;
    this.animateActor(actor, poseDt);
    actor.figure.position.set(0, 0, 0);
    actor.figure.rotation.set(0, 0, 0);
    // Save the complete resting upper body, not just the shoulder, for recovery.
    for (let i = 0; i < POSE_JOINTS.length; i++) actor.poseRest[i].copy(j[POSE_JOINTS[i]].quaternion);
    actor.trail.visible = false;
    if (fate) {
      actor.figure.position.y = -.385;
      j.RightLeg.rotation.set(-.06, 0, -.10); j.LeftLeg.rotation.set(-.06, 0, .10);
      j.RightShin.rotation.set(1.77, 0, 0); j.LeftShin.rotation.set(1.77, 0, 0);
      j.RightFoot.rotation.set(-1.46, 0, 0); j.LeftFoot.rotation.set(-1.46, 0, 0);
      j.Torso.rotation.set(.16, 0, 0); j.Head.rotation.x = .20;
      j.RightArm.rotation.set(-.56, 0, -.13); j.LeftArm.rotation.set(-.56, 0, .13);
      j.RightForearm.rotation.set(-.94, 0, .18); j.LeftForearm.rotation.set(-.94, 0, -.18);
      actor.shadow.scale.set(.48, .38, 1);
    } else if (!standing) {
      // There is deliberately no Downed/Killed branch: neither visual reveals survival.
      actor.figure.rotation.set(-Math.PI / 2, 0, .14);
      actor.figure.position.set(0, .20, -.44);
      j.RightLeg.rotation.set(.12, 0, -.22); j.LeftLeg.rotation.set(-.13, 0, .13);
      j.RightShin.rotation.set(.22, 0, 0); j.LeftShin.rotation.set(.14, 0, 0);
      j.RightArm.rotation.set(-.25, 0, -.65); j.LeftArm.rotation.set(.3, 0, .7);
      j.Torso.rotation.set(0, 0, .06); j.Head.rotation.y = .38;
      actor.shadow.scale.set(.8, .4, 1);
    } else {
      actor.shadow.scale.set(.44, .33, 1);
      if (c.action === 'Shield') {
        j.LeftArm.rotation.set(-.85, -.20, .32);
        j.LeftForearm.rotation.set(-1.0, .12, -.18);
        // Counter the arm lift so the shield faces the threat rather than the sky.
        j.Shield.rotation.set(1.85, -.22, -.14);
        j.Shield.quaternion.multiply(actor.equipmentRest.Shield);
        j.Torso.rotation.y = -.2;
      } else if (c.action === 'Guard' || c.action === 'Preview' || c.action === 'Windup' || c.action === 'Active' || c.action === 'Recovery') {
        this.weaponPose(actor, c);
        if (c.action === 'Recovery') {
          const sector = c.sector ?? c.effectiveSector ?? 'Overhead';
          const duration = WEAPONS[c.weapon][sector].recovery * (c.role === 'Player' && !state.arena && state.campaign.feat === 'Rapid Attack' ? .8 : 1);
          const progress = THREE.MathUtils.clamp(c.actionTime / duration, 0, 1);
          const settle = progress * progress * (3 - 2 * progress);
          for (let i = 0; i < POSE_JOINTS.length; i++) {
            if (c.weapon !== 'Staff' || !STAFF_GRIP_JOINTS[POSE_JOINTS[i]]) {
              j[POSE_JOINTS[i]].quaternion.slerp(actor.poseRest[i], settle);
            }
          }
        }
      } else if (c.action === 'Stagger') {
        const progress = THREE.MathUtils.clamp(c.actionTime / Math.max(.01, c.guardTime), 0, 1);
        const recoil = Math.sin(Math.PI * Math.min(1, progress * 1.6));
        j.Torso.rotation.set(c.exhausted ? .26 : -.24 * recoil, .12 * recoil, -.08 * recoil);
        j.Head.rotation.x = c.exhausted ? .28 : -.16 * recoil;
        j.RightArm.rotation.set(.18, 0, -.36);
        j.LeftArm.rotation.set(-.25, 0, .28);
        j.RightForearm.rotation.x = c.exhausted ? -.12 : -.55;
        j.LeftForearm.rotation.x = -.45;
      }
    }
    actor.flash = Math.max(0, actor.flash - poseDt); actor.reaction = Math.max(0, actor.reaction - poseDt); actor.parry = Math.max(0, actor.parry - poseDt);
    for (const material of actor.materials) {
      material.emissive.set(actor.flash > 0 ? '#d66d45' : actor.parry > 0 ? (c.action === 'Shield' ? '#f1d69e' : '#8ac4c1') : '#000000');
      material.emissiveIntensity = actor.flash > 0 ? actor.flash * 3.2 : actor.parry * 2.4;
    }
    if (actor.reaction > 0 && c.status === 'Active' && !fate) j.Torso.rotation.x -= Math.sin(actor.reaction * 35) * .10;
    const poseAction = fate ? 'Kneeling' : !standing ? 'Casualty' : c.action;
    if (first || poseAction !== actor.poseAction || c.sector !== actor.poseSector) {
      // Active motion stays on its contact clock; interrupted and held poses ease in.
      actor.poseBlend = first || fate || !standing || c.action === 'Active' ? 1 : 0;
      for (let i = 0; i < POSE_JOINTS.length; i++) actor.poseFrom[i].copy(actor.poseLast[i]);
      actor.poseAction = poseAction;
      actor.poseSector = c.sector;
    }
    actor.poseBlend = Math.min(1, actor.poseBlend + poseDt / .12);
    const blend = actor.poseBlend * actor.poseBlend * (3 - 2 * actor.poseBlend);
    const staffGrip = standing && !fate && c.weapon === 'Staff' &&
      (c.action === 'Preview' || c.action === 'Windup' || c.action === 'Active' || c.action === 'Guard' || c.action === 'Recovery');
    for (let i = 0; i < POSE_JOINTS.length; i++) {
      const rotation = j[POSE_JOINTS[i]].quaternion;
      // Independent joint interpolation breaks the solved two-handed constraint.
      if (!staffGrip || !STAFF_GRIP_JOINTS[POSE_JOINTS[i]]) rotation.slerp(actor.poseFrom[i], 1 - blend);
      actor.poseLast[i].copy(rotation);
    }
  }

  private weaponPose(actor: Actor, c: DeepReadonly<Combatant>): void {
    const j = actor.joints;
    const sector: Sector = c.sector ?? c.effectiveSector ?? 'Overhead';
    const guard = c.action === 'Guard';
    const active = c.action === 'Active';
    const recovery = c.action === 'Recovery';
    const sweep = active ? Math.min(1, c.actionTime / .2) : recovery ? 1 : 0;
    if (c.weapon === 'Staff') this.staffPose(actor, sector, guard, sweep);
    else if (sector === 'Overhead') {
      j.RightArm.rotation.set(-2.65 + sweep * 1.65, -.06, -.16);
      j.RightForearm.rotation.set(guard ? -.55 : -.3 + sweep * .15, 0, 0);
      j.Torso.rotation.x += -.06 + .23 * sweep;
      j.Sword.rotation.set(guard ? -.75 : -.25, 0, guard ? -1.05 : 0);
    } else if (sector === 'Thrust') {
      const extension = active ? Math.min(1, c.actionTime / .11) : recovery ? 1 : 0;
      j.RightArm.rotation.set(.22 - extension * 1.54, 0, -.055);
      j.RightForearm.rotation.set(-1.75 + extension * 1.50, 0, 0);
      // Compensate the shoulder and elbow so the blade keeps pointing forward during extension.
      // Combat angles use the exported weapon axes, not the tilted idle pose.
      j.Sword.rotation.set(-Math.PI / 2 - j.RightArm.rotation.x - j.RightForearm.rotation.x, 0, 0);
      j.Torso.rotation.set(extension * .10, -.08, 0);
    } else {
      const side = sector === 'Left cut' ? -1 : 1;
      j.Torso.rotation.y = side * (.42 - sweep * .95);
      j.RightArm.rotation.set(-1.20, side * (.95 - sweep * 1.8), side * (.7 - sweep * 1.25));
      j.RightForearm.rotation.set(-.65, side * .3, side * -.32);
      j.Sword.rotation.set(-.3, 0, side * -.65);
    }
    if (guard && c.weapon !== 'Staff') {
      j.RightArm.rotation.x -= .12;
      if (sector === 'Thrust') { j.RightArm.rotation.set(-.65, -.2, -.7); j.Sword.rotation.set(-.1, 0, -1.2); }
      j.LeftArm.rotation.set(-.5, 0, .23);
    }
    if (active && sector !== 'Thrust') {
      actor.trail.visible = true;
      (actor.trail.material as THREE.MeshBasicMaterial).opacity = Math.sin(sweep * Math.PI) * .28;
      actor.trail.rotation.set(sector === 'Overhead' ? 0 : -Math.PI / 2, sector === 'Overhead' ? Math.PI / 2 : 0, sector === 'Left cut' ? .5 : -.5);
      actor.trail.scale.setScalar(c.weapon === 'Staff' ? 1.25 : 1);
    }
  }

  private staffPose(actor: Actor, sector: Sector, guard: boolean, sweep: number): void {
    const j = actor.joints;
    const side = sector === 'Left cut' ? -1 : 1;
    if (guard) {
      if (sector === 'Overhead') {
        this.staffEuler.set(0, 0, -Math.PI / 2);
        this.staffMidpoint.set(0, .65, .20);
      } else if (sector === 'Thrust') {
        this.staffEuler.set(.2, 0, -Math.PI / 2);
        this.staffMidpoint.set(0, .06, .28);
      } else {
        this.staffEuler.set(.25, 0, side * .25);
        this.staffMidpoint.set(side * .14, .30, .27);
      }
    } else if (sector === 'Thrust') {
      this.staffEuler.set(Math.PI / 2, 0, 0);
      this.staffMidpoint.set(0, .24, .25 + .08 * sweep);
      j.Torso.rotation.x = .10 * sweep;
    } else if (sector === 'Overhead') {
      this.staffEuler.set(2 * sweep, 0, -Math.PI / 2 + (Math.PI / 2 - .20) * sweep);
      this.staffMidpoint.set(0, .70 - .48 * sweep, .20 + .03 * sweep);
      j.Torso.rotation.x = -.08 + .20 * sweep;
    } else {
      this.staffEuler.set(Math.PI / 2, 0, side * (1.05 - 2.10 * sweep));
      this.staffMidpoint.set(0, .22, .25);
      j.Torso.rotation.y = side * (.30 - .65 * sweep);
    }
    j.Torso.localToWorld(this.staffMidpoint);
    j.Torso.getWorldQuaternion(this.staffRotation);
    this.staffRotation.multiply(this.ikDelta.setFromEuler(this.staffEuler));
    this.staffAxis.set(0, 1, 0).applyQuaternion(this.staffRotation);
    const scale = actor.figure.scale.y;
    // Keep both grips on the shaft; the group remains attached to the right hand.
    this.staffHandRotation.copy(this.staffRotation).multiply(this.ikDelta.copy(actor.equipmentRest.Staff).invert());
    this.staffTarget.copy(this.staffMidpoint).addScaledVector(this.staffAxis, -.11 * scale);
    this.staffOffset.copy(j.Staff.position).multiplyScalar(scale).applyQuaternion(this.staffHandRotation);
    this.staffTarget.sub(this.staffOffset);
    this.solveArm(j.RightArm, j.RightForearm, j.RightHand, this.staffTarget, this.staffHandRotation);
    this.staffTarget.copy(this.staffMidpoint).addScaledVector(this.staffAxis, .11 * scale);
    this.staffOffset.set(.012, -.065, .040).multiplyScalar(scale).applyQuaternion(this.staffRotation);
    this.staffTarget.sub(this.staffOffset);
    this.solveArm(j.LeftArm, j.LeftForearm, j.LeftHand, this.staffTarget, this.staffRotation);
    j.Staff.quaternion.copy(actor.equipmentRest.Staff);
  }

  private solveArm(upper: THREE.Object3D, lower: THREE.Object3D, hand: THREE.Object3D, target: THREE.Vector3, orientation: THREE.Quaternion): void {
    upper.getWorldPosition(this.ikStart);
    lower.getWorldPosition(this.ikJoint);
    hand.getWorldPosition(this.ikEnd);
    const upperLength = this.ikStart.distanceTo(this.ikJoint);
    const lowerLength = this.ikJoint.distanceTo(this.ikEnd);
    this.ikDirection.copy(target).sub(this.ikStart);
    const distance = THREE.MathUtils.clamp(this.ikDirection.length(), Math.abs(upperLength - lowerLength) + .0001, upperLength + lowerLength - .0001);
    this.ikDirection.normalize();
    this.ikPole.copy(this.ikJoint).sub(this.ikStart);
    this.ikPole.addScaledVector(this.ikDirection, -this.ikPole.dot(this.ikDirection));
    if (this.ikPole.lengthSq() < .000001) {
      this.ikPole.set(Math.abs(this.ikDirection.x) < .8 ? 1 : 0, Math.abs(this.ikDirection.x) < .8 ? 0 : 1, 0);
      this.ikPole.addScaledVector(this.ikDirection, -this.ikPole.dot(this.ikDirection));
    }
    this.ikPole.normalize();
    const along = (upperLength * upperLength + distance * distance - lowerLength * lowerLength) / (2 * distance);
    const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
    this.ikElbow.copy(this.ikStart).addScaledVector(this.ikDirection, along).addScaledVector(this.ikPole, height);
    this.ikFrom.copy(this.ikJoint).sub(this.ikStart).normalize();
    this.ikTo.copy(this.ikElbow).sub(this.ikStart).normalize();
    this.ikDelta.setFromUnitVectors(this.ikFrom, this.ikTo);
    upper.getWorldQuaternion(this.ikWorld);
    this.ikWorld.premultiply(this.ikDelta);
    upper.parent!.getWorldQuaternion(this.ikParent).invert();
    upper.quaternion.copy(this.ikParent).multiply(this.ikWorld);
    lower.getWorldPosition(this.ikJoint);
    hand.getWorldPosition(this.ikEnd);
    this.ikFrom.copy(this.ikEnd).sub(this.ikJoint).normalize();
    this.ikTo.copy(target).sub(this.ikJoint).normalize();
    this.ikDelta.setFromUnitVectors(this.ikFrom, this.ikTo);
    lower.getWorldQuaternion(this.ikWorld);
    this.ikWorld.premultiply(this.ikDelta);
    lower.parent!.getWorldQuaternion(this.ikParent).invert();
    lower.quaternion.copy(this.ikParent).multiply(this.ikWorld);
    hand.parent!.getWorldQuaternion(this.ikParent).invert();
    hand.quaternion.copy(this.ikParent).multiply(orientation);
  }

  private updateCamera(state: Projection, dt: number): void {
    const map = this.sceneId === 'overworld';
    const fate = state.phase === 'Agent fate';
    if (state.phase !== this.lastPhase) { this.snapCamera = this.snapCamera || fate || this.lastPhase === 'Agent fate'; this.lastPhase = state.phase; }
    if (fate) {
      // Dedicated open-field framing leaves the right half unobscured for the fate DOM card.
      this.target.copy(FIELD).add(this.point.set(1.45, 1.0, 0));
      this.desired.copy(FIELD).add(this.point.set(2.0, 2.0, 5.2));
      this.lookAt.copy(this.target);
    } else if (map) {
      const position = state.campaign.position;
      this.target.set(position.x * MAP_SCALE, 0, position.z * MAP_SCALE);
      const toSettlement = Math.min(8, this.target.length() * .35);
      this.target.addScaledVector(this.point.copy(this.target).normalize(), -toSettlement);
      this.desired.set(this.target.x - Math.sin(this.yaw) * Math.cos(this.pitch) * this.mapDistance, this.mapDistance * Math.sin(this.pitch), this.target.z - Math.cos(this.yaw) * Math.cos(this.pitch) * this.mapDistance);
      this.lookAt.copy(this.target);
    } else {
      const player = this.actors.get('player');
      const position = player?.root.position;
      this.target.set(position?.x ?? state.campaign.position.x, 1.35, position?.z ?? state.campaign.position.z);
      const rightX = -Math.cos(this.yaw), rightZ = Math.sin(this.yaw);
      const forwardX = Math.sin(this.yaw), forwardZ = Math.cos(this.yaw);
      this.desired.set(this.target.x - forwardX * this.distance * Math.cos(this.pitch) + rightX * .70, this.target.y + this.distance * Math.sin(this.pitch), this.target.z - forwardZ * this.distance * Math.cos(this.pitch) + rightZ * .70);
      this.lookAt.set(this.target.x + forwardX * 2.4 + rightX * .52, this.target.y + .10, this.target.z + forwardZ * 2.4 + rightZ * .52);
      // Keep the shoulder camera out of the four solid authored houses.
      const fullDistance = this.target.distanceTo(this.desired);
      this.ray.ray.set(this.target, this.point.copy(this.desired).sub(this.target).normalize());
      let clearDistance = fullDistance;
      if (!this.arena) for (const solid of CAMERA_SOLIDS) {
        if (this.ray.ray.intersectBox(solid, this.point)) clearDistance = Math.min(clearDistance, Math.max(.65, this.target.distanceTo(this.point) - .20));
      }
      if (clearDistance < fullDistance) this.desired.lerpVectors(this.target, this.desired, clearDistance / fullDistance);
      this.desired.y = Math.max(1.4, this.desired.y);
    }
    if (this.snapCamera) this.camera.position.copy(this.desired);
    else this.camera.position.lerp(this.desired, 1 - Math.exp(-dt * 12));
    this.camera.lookAt(this.lookAt);
    this.camera.updateMatrixWorld();
    this.snapCamera = false;
  }

  private updateMarkers(state: Projection): void {
    const show = state.phase === 'Setup' || state.phase === 'Battle';
    const groups = [state.groups.Companion, state.groups.Troops];
    const rect = this.canvas.getBoundingClientRect();
    for (let i = 0; i < 2; i++) {
      const marker = this.markers[i];
      const position = groups[i].marker;
      const indicator = this.indicators[i];
      indicator.style.display = 'none';
      if (!marker) continue;
      marker.visible = show && position !== null;
      if (!marker.visible || !position) continue;
      marker.position.set(position.x, .08, position.z);
      marker.rotation.y = this.clock * .12;
      this.screen.copy(marker.position).project(this.camera);
      if (Math.abs(this.screen.x) <= .9 && Math.abs(this.screen.y) <= .86 && this.screen.z >= 0 && this.screen.z <= 1) continue;
      this.point.copy(marker.position).applyMatrix4(this.camera.matrixWorldInverse);
      let dx = this.point.x, dy = -this.point.y;
      if (this.point.z > 0) { dx = dx || .001; dy = Math.abs(dy) + 1; }
      const length = Math.max(Math.abs(dx) / Math.max(1, rect.width / 2 - 24), Math.abs(dy) / Math.max(1, rect.height / 2 - 24), .001);
      const x = rect.left + rect.width / 2 + dx / length;
      const y = rect.top + rect.height / 2 + dy / length;
      indicator.style.display = 'block';
      indicator.style.transform = `translate(${x}px,${y}px) rotate(${Math.atan2(dy, dx) + Math.PI / 4}rad)`;
    }
    if (this.invalid) {
      this.invalid.visible = show && state.invalidMarker !== null;
      if (state.invalidMarker) this.invalid.position.set(state.invalidMarker.x, .09, state.invalidMarker.z);
    }
  }

  private resize(): void {
    const width = Math.max(1, this.canvas.clientWidth), height = Math.max(1, this.canvas.clientHeight);
    if (width === this.width && height === this.height) return;
    this.width = width; this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  groundPoint(clientX: number, clientY: number): Vec2 | null {
    if (!this.ready) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    this.pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    if (!this.ray.ray.intersectPlane(this.ground, this.point)) return null;
    const scale = this.sceneId === 'overworld' ? MAP_SCALE : 1;
    return { x: this.point.x / scale, z: this.point.z / scale };
  }

  rotate(dx: number, dy: number): void {
    this.yaw -= dx * .004;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * .003, this.sceneId === 'overworld' ? .38 : .12, this.sceneId === 'overworld' ? 1.13 : .75);
  }

  zoom(delta: number): void {
    const multiplier = Math.exp(THREE.MathUtils.clamp(delta, -200, 200) * .0015);
    if (this.sceneId === 'overworld') this.mapDistance = THREE.MathUtils.clamp(this.mapDistance * multiplier, 24, 85);
    else this.distance = THREE.MathUtils.clamp(this.distance * multiplier, 3.8, 9);
  }

  facing(): number { return this.yaw; }

  private disposeSceneData(scene: THREE.Scene, gltf: GLTF | null, actors: Map<string, Actor>, geometryCache: Map<string, THREE.BufferGeometry>, materialCache: Map<string, THREE.MeshStandardMaterial>): void {
    for (const actor of actors.values()) { actor.mixer.stopAllAction(); actor.mixer.uncacheRoot(actor.figure); }
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const skeletons = new Set<THREE.Skeleton>();
    const dispose = (object: THREE.Object3D) => {
      if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach(m => materials.add(m));
      else materials.add(object.material);
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    };
    scene.traverse(dispose);
    gltf?.scene.traverse(dispose);
    for (const geometry of geometryCache.values()) geometries.add(geometry);
    for (const material of materialCache.values()) materials.add(material);
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    skeletons.forEach(skeleton => skeleton.dispose());
    scene.clear(); geometryCache.clear(); materialCache.clear(); actors.clear();
  }

  private releaseScene(): void {
    this.disposeSceneData(this.scene, this.gltf, this.actors, this.geometry, this.materials);
    this.gltf = null; this.markers = []; this.invalid = null; this.destination = null; this.banner = null; this.smoke = []; this.river = null;
    this.indicators.forEach(indicator => { indicator.style.display = 'none'; });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.ready = false;
    this.releaseScene(); this.overlay.remove(); this.renderer.dispose();
  }
}
