import { describe, expect, it } from 'vitest'
import type { SimulationProjection } from '../../core'
import { createScenePresenter } from './index'
import type {
  PresentedAnimationMixer,
  PresentedCamera,
  PresentedNode,
  PresentedRenderer,
  PresentedScene,
  ScenePresenterHandle,
} from './index'

/**
 * The focused Three.js frame-presenter test (ARCH-009, ARCH-012, REQ-118,
 * PVS-ARC-008).
 *
 * The presenter consumes the loaded startup Scene handle — one Scene, one
 * camera, and one AnimationMixer — plus a renderer, through minimal
 * structural surfaces, so these tests prove the exact presentation
 * behavior without a GPU: projected Band IDs drive presentation-only node
 * visibility, the authored animation advances from the current projection
 * tick and interpolation value, one frame renders per presentation, and
 * the presenter's owned state and reported record contain only Three.js
 * objects, frame metrics, and interpolation history — never a projection,
 * resource value, combat result, relationship result, fate result, or
 * outcome. The presenter also proves it has no authoritative-state write
 * path: it receives only the immutable projection value and returns void.
 */

/** The two projected Band member IDs of a new campaign (REQ-077). */
const PLAYER_ID = 'poc-player-character'
const COMPANION_ID = 'poc-companion'

/** Build one fake Band member record. */
function member(id: string): SimulationProjection['band'][number] {
  return Object.freeze({ id, name: id })
}

/** A fake presented node recording every visibility write. */
interface FakeNode extends PresentedNode {
  readonly visibilityHistory: boolean[]
}

/** Build a fake Band node with its own visibility history. */
function createFakeNode(name: string): FakeNode {
  const visibilityHistory: boolean[] = []
  return {
    name,
    get visible(): boolean {
      return visibilityHistory[visibilityHistory.length - 1] ?? true
    },
    set visible(value: boolean) {
      visibilityHistory.push(value)
    },
    visibilityHistory,
  }
}

/** Build a fake Scene whose named node lookups are recorded. */
function createFakeScene(nodes: readonly FakeNode[]): PresentedScene & { lookups: string[] } {
  const lookups: string[] = []
  return {
    lookups,
    getObjectByName(name: string): FakeNode | undefined {
      lookups.push(name)
      return nodes.find((node) => node.name === name)
    },
  }
}

/** Build a fake mixer recording every absolute animation time. */
function createFakeMixer(): PresentedAnimationMixer & { times: number[] } {
  const times: number[] = []
  return {
    times,
    setTime(time: number): void {
      times.push(time)
    },
  }
}

/** Build a fake camera. */
function createFakeCamera(): PresentedCamera {
  return { position: Object.freeze({ x: 0, y: 3.5, z: 8 }) }
}

/** Build a fake renderer recording every rendered frame. */
function createFakeRenderer(): PresentedRenderer & { renderedFrames: unknown[][] } {
  const renderedFrames: unknown[][] = []
  return {
    renderedFrames,
    render(scene: unknown, camera: unknown): void {
      renderedFrames.push([scene, camera])
    },
  }
}

/** Build a complete presentation handle around the fakes. */
function createHandle(
  nodes: readonly FakeNode[],
): {
  scene: PresentedScene & { lookups: string[] }
  camera: PresentedCamera
  mixer: PresentedAnimationMixer & { times: number[] }
  renderer: PresentedRenderer & { renderedFrames: unknown[][] }
  handle: ScenePresenterHandle
} {
  const scene = createFakeScene(nodes)
  const camera = createFakeCamera()
  const mixer = createFakeMixer()
  const renderer = createFakeRenderer()
  return { scene, camera, mixer, renderer, handle: { scene, camera, mixer } }
}

/** Build a frozen projection at `tick` with the given Band membership. */
function projectionAt(tick: number, band: readonly string[], coin = 100): SimulationProjection {
  return Object.freeze({
    tick,
    agents: Object.freeze([]),
    band: Object.freeze(band.map(member)),
    coin,
    provisions: 10.0,
  })
}

describe('Three.js frame presenter (ARCH-009, ARCH-012, REQ-118, PVS-ARC-008)', () => {
  it('shows the nodes of every projected Band member and hides a bound node whose member is no longer projected', () => {
    const player = createFakeNode(PLAYER_ID)
    const companion = createFakeNode(COMPANION_ID)
    const { handle, renderer } = createHandle([player, companion])
    const presenter = createScenePresenter(handle, renderer)

    // Both initial Band members are projected: both nodes are shown and
    // the visibility writes record exactly one show per node.
    presenter.present(projectionAt(0, [PLAYER_ID, COMPANION_ID]), 0)
    expect(player.visibilityHistory).toEqual([true])
    expect(companion.visibilityHistory).toEqual([true])

    // The companion leaves the Band: the bound companion node is hidden
    // while the player node stays shown.
    presenter.present(projectionAt(60, [PLAYER_ID]), 0)
    expect(player.visibilityHistory).toEqual([true, true])
    expect(companion.visibilityHistory).toEqual([true, false])
  })

  it('binds each Band node once and reuses it across presented frames', () => {
    const player = createFakeNode(PLAYER_ID)
    const companion = createFakeNode(COMPANION_ID)
    const { handle, scene, renderer } = createHandle([player, companion])
    const presenter = createScenePresenter(handle, renderer)

    presenter.present(projectionAt(0, [PLAYER_ID, COMPANION_ID]), 0)
    presenter.present(projectionAt(60, [PLAYER_ID, COMPANION_ID]), 0.5)

    // Each Band node was looked up exactly once; later frames reuse the
    // bound Three.js object.
    expect(scene.lookups).toEqual([PLAYER_ID, COMPANION_ID])
  })

  it('ignores a projected Band member that has no node in the loaded Scene', () => {
    const player = createFakeNode(PLAYER_ID)
    const { handle, scene, renderer } = createHandle([player])
    const presenter = createScenePresenter(handle, renderer)

    // A projected member without an authored node must not throw and must
    // not enter the presented set.
    presenter.present(projectionAt(0, [PLAYER_ID, 'poc-troop-1']), 0)
    expect(scene.lookups).toEqual([PLAYER_ID, 'poc-troop-1'])
    expect(presenter.readFramePresentation().presentedNodes).toEqual([PLAYER_ID])
  })

  it('advances the authored animation from the projection tick and interpolation value and renders one frame', () => {
    const player = createFakeNode(PLAYER_ID)
    const { handle, mixer, renderer, camera, scene } = createHandle([player])
    const presenter = createScenePresenter(handle, renderer)

    // Tick 120 plus interpolation 0.5 is 120.5 fixed ticks, which is
    // 120.5 / 60 = 2.00833... Simulation seconds.
    presenter.present(projectionAt(120, [PLAYER_ID]), 0.5)
    expect(mixer.times).toEqual([120.5 / 60])

    // The frame rendered exactly once with the loaded Scene and camera on
    // the one frame loop.
    expect(renderer.renderedFrames).toEqual([[scene, camera]])
  })

  it('presents the initial tick with zero interpolation on the baseline frame', () => {
    const player = createFakeNode(PLAYER_ID)
    const { handle, mixer, renderer } = createHandle([player])
    const presenter = createScenePresenter(handle, renderer)

    presenter.present(projectionAt(0, [PLAYER_ID]), 0)
    expect(mixer.times).toEqual([0])
    expect(renderer.renderedFrames).toHaveLength(1)
  })

  it('reads only presentation facts and never a projection, resource, combat, relationship, fate, or outcome value', () => {
    const player = createFakeNode(PLAYER_ID)
    const { handle, renderer } = createHandle([player])
    const presenter = createScenePresenter(handle, renderer)

    // Present a variety of authoritative states — different ticks, Band
    // membership, Coin, Provisions, Agents, and Grievances — and confirm
    // the reported record stays presentation-only.
    presenter.present(
      Object.freeze({
        tick: 90,
        agents: Object.freeze([
          Object.freeze({
            id: 'poc-enemy-agent',
            name: 'Varek',
            role: 'Enemy Agent',
            fate: 'Active',
            disposition: 'Hostile',
            grievances: Object.freeze([Object.freeze({ cause: 'raid' })]),
          }),
        ]),
        band: Object.freeze([member(PLAYER_ID)]),
        coin: 37,
        provisions: 2.5,
      }),
      0.25,
    )

    const record = presenter.readFramePresentation()
    expect(record).toEqual({
      presentedNodes: [PLAYER_ID],
      presentedFrames: 1,
      animationTime: 90.25 / 60,
    })
    expect(Object.isFrozen(record)).toBe(true)
    expect(Object.isFrozen(record.presentedNodes)).toBe(true)
    // No gameplay value is present anywhere in the record.
    expect(JSON.stringify(record)).not.toMatch(/coin|provisions|Varek|raid|Hostile|tick|band/)
  })

  it('receives the public immutable projection and has no write operation on it', () => {
    const player = createFakeNode(PLAYER_ID)
    const { handle, mixer, renderer } = createHandle([player])
    const presenter = createScenePresenter(handle, renderer)

    // The runtime passes the frozen public projection; the presenter's
    // `present` operation returns void and never mutates it.
    const frozen = projectionAt(1, [PLAYER_ID])
    const result: void = presenter.present(frozen, 0)
    expect(result).toBeUndefined()
    expect(Object.isFrozen(frozen)).toBe(true)
    expect(frozen.tick).toBe(1)
    expect(mixer.times).toEqual([1 / 60])
    expect(renderer.renderedFrames).toHaveLength(1)
  })
})
