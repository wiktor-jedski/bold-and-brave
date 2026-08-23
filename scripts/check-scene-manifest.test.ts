/**
 * Scene-manifest and Overworld content-contract tests (ARCH-003, ARCH-014,
 * ARCH-015, ARCH-016, REQ-017, REQ-035, REQ-117, REQ-136, PVS-FLW-001,
 * PVS-FLW-022).
 */
import { describe, expect, it } from 'vitest'
import { OVERWORLD, SCENES } from '../src/core/content'
import type { OverworldContent, OverworldDestinationContent } from '../src/core/content'
import {
  distanceBetween,
  isPositionInTraversableGround,
  validateDestinationRecord,
  validateOverworldContent,
  validateOverworldGltfAsset,
  validateSceneManifest,
} from './check-scene-manifest'

type DeepMutable<T> = { -readonly [Key in keyof T]: DeepMutable<T[Key]> }

/** Helper to create a mutable clone of the authored OVERWORLD record. */
function cloneOverworld(): DeepMutable<OverworldContent> {
  return JSON.parse(JSON.stringify(OVERWORLD))
}

/** Helper to deeply freeze an object and its nested properties. */
function deepFreeze<T extends object>(obj: T): T {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value)
    }
  }
  return Object.freeze(obj)
}

describe('Overworld content contract (ARCH-003, ARCH-014, ARCH-015, ARCH-016)', () => {
  it('accepts the authored Overworld content record from the catalog', () => {
    const rejections = validateOverworldContent(OVERWORLD)
    expect(rejections).toEqual([])
  })

  it('proves that the start position and settlement entry boundary are exactly 1.5 world units apart', () => {
    const settlement = OVERWORLD.destinations.find((d) => d.id === 'poc-settlement')
    expect(settlement).toBeDefined()

    const distance = distanceBetween(OVERWORLD.startPosition, settlement!.entryBoundary.position)
    expect(distance).toBe(1.5)
  })

  it('proves that the route represents 0.5 Overworld day at 3 world units per day', () => {
    const settlement = OVERWORLD.destinations.find((d) => d.id === 'poc-settlement')
    const distance = distanceBetween(OVERWORLD.startPosition, settlement!.entryBoundary.position)
    const routeDays = distance / OVERWORLD.travel.speedWorldUnitsPerDay

    expect(OVERWORLD.travel.speedWorldUnitsPerDay).toBe(3.0)
    expect(routeDays).toBe(0.5)
    expect(OVERWORLD.travel.realSecondsPerOverworldHour).toBe(5.0)
    expect(OVERWORLD.travel.hoursPerOverworldDay).toBe(24)
    expect(OVERWORLD.travel.provisionsPerMemberPerDay).toBe(0.2)
  })

  it('proves that production scale is exactly 1.0', () => {
    expect(OVERWORLD.productionScale).toBe(1.0)
  })

  it('proves that every navigation anchor belongs to traversable ground', () => {
    expect(OVERWORLD.navigationAnchors.length).toBeGreaterThan(0)
    for (const anchor of OVERWORLD.navigationAnchors) {
      expect(isPositionInTraversableGround(anchor.position, OVERWORLD.traversableGround)).toBe(true)
    }
  })

  it('proves that the start position and settlement boundary belong to traversable ground', () => {
    expect(isPositionInTraversableGround(OVERWORLD.startPosition, OVERWORLD.traversableGround)).toBe(true)
    const settlement = OVERWORLD.destinations.find((d) => d.id === 'poc-settlement')
    expect(isPositionInTraversableGround(settlement!.entryBoundary.position, OVERWORLD.traversableGround)).toBe(true)
  })

  it('proves that all navigation anchor IDs and destination IDs are unique', () => {
    const anchorIds = OVERWORLD.navigationAnchors.map((a) => a.id)
    const uniqueAnchorIds = new Set(anchorIds)
    expect(uniqueAnchorIds.size).toBe(anchorIds.length)

    const destinationIds = OVERWORLD.destinations.map((d) => d.id)
    const uniqueDestIds = new Set(destinationIds)
    expect(uniqueDestIds.size).toBe(destinationIds.length)
  })

  it('proves that the catalog and all nested records are deeply frozen', () => {
    expect(Object.isFrozen(OVERWORLD)).toBe(true)
    expect(Object.isFrozen(OVERWORLD.startPosition)).toBe(true)
    expect(Object.isFrozen(OVERWORLD.travel)).toBe(true)
    expect(Object.isFrozen(OVERWORLD.traversableGround)).toBe(true)
    expect(Object.isFrozen(OVERWORLD.navigationAnchors)).toBe(true)
    for (const anchor of OVERWORLD.navigationAnchors) {
      expect(Object.isFrozen(anchor)).toBe(true)
      expect(Object.isFrozen(anchor.position)).toBe(true)
    }
    expect(Object.isFrozen(OVERWORLD.destinations)).toBe(true)
    for (const destination of OVERWORLD.destinations) {
      expect(Object.isFrozen(destination)).toBe(true)
      expect(Object.isFrozen(destination.position)).toBe(true)
      expect(Object.isFrozen(destination.entryBoundary)).toBe(true)
      expect(Object.isFrozen(destination.entryBoundary.position)).toBe(true)
    }
    expect(Object.isFrozen(OVERWORLD.cameraBounds)).toBe(true)
    expect(Object.isFrozen(OVERWORLD.presentationNodes)).toBe(true)
  })
})

describe('Overworld content rejection rules (REQ-017, REQ-035, REQ-117)', () => {
  it('rejects an unfrozen Overworld record', () => {
    const mutable = cloneOverworld()
    const rejections = validateOverworldContent(mutable as unknown as OverworldContent)
    expect(rejections.some((r) => r.includes('not frozen'))).toBe(true)
  })

  it('rejects a production scale other than 1.0', () => {
    const mutated = cloneOverworld()
    mutated.productionScale = 2.0
    const frozen = deepFreeze(mutated) as unknown as OverworldContent
    const rejections = validateOverworldContent(frozen)
    expect(rejections.some((r) => r.includes('production scale must be exactly 1.0'))).toBe(true)
  })

  it('rejects when start position and settlement entry boundary are not 1.5 world units apart', () => {
    const mutated = cloneOverworld()
    mutated.startPosition.z = 2.0 // distance becomes 2.0 instead of 1.5
    const frozen = deepFreeze(mutated) as unknown as OverworldContent
    const rejections = validateOverworldContent(frozen)
    expect(rejections.some((r) => r.includes('must be exactly 1.5 world units apart'))).toBe(true)
  })

  it('rejects when travel speed is not 3.0 world units per day', () => {
    const mutated = cloneOverworld()
    mutated.travel.speedWorldUnitsPerDay = 4.0
    const frozen = deepFreeze(mutated) as unknown as OverworldContent
    const rejections = validateOverworldContent(frozen)
    expect(rejections.some((r) => r.includes('speed must be exactly 3.0'))).toBe(true)
  })

  it('rejects when real seconds per hour is not 5.0', () => {
    const mutated = cloneOverworld()
    mutated.travel.realSecondsPerOverworldHour = 10.0
    const frozen = deepFreeze(mutated) as unknown as OverworldContent
    const rejections = validateOverworldContent(frozen)
    expect(rejections.some((r) => r.includes('Real seconds per Overworld hour'))).toBe(true)
  })

  it('rejects when navigation anchor is outside traversable ground', () => {
    const mutated = cloneOverworld()
    mutated.navigationAnchors.push({
      id: 'poc-anchor-out-of-bounds',
      position: { x: 100.0, y: 0, z: 100.0 },
    })
    const frozen = deepFreeze(mutated) as unknown as OverworldContent
    const rejections = validateOverworldContent(frozen)
    expect(rejections.some((r) => r.includes('outside traversable ground'))).toBe(true)
  })

  it('rejects duplicate navigation anchor IDs', () => {
    const mutated = cloneOverworld()
    mutated.navigationAnchors.push({
      id: 'poc-anchor-start',
      position: { x: 0, y: 0, z: 1.0 },
    })
    const frozen = deepFreeze(mutated) as unknown as OverworldContent
    const rejections = validateOverworldContent(frozen)
    expect(rejections.some((r) => r.includes('Duplicate navigation anchor ID'))).toBe(true)
  })

  it('rejects invalid camera bounds where minDistance > maxDistance', () => {
    const mutated = cloneOverworld()
    mutated.cameraBounds.minDistance = 10.0
    mutated.cameraBounds.maxDistance = 5.0
    const frozen = deepFreeze(mutated) as unknown as OverworldContent
    const rejections = validateOverworldContent(frozen)
    expect(rejections.some((r) => r.includes('cameraBounds distance'))).toBe(true)
  })

  it('rejects an arbitrary Overworld ID that is not poc-overworld', () => {
    const mutated = cloneOverworld()
    mutated.id = 'not-poc-overworld'
    const frozen = deepFreeze(mutated) as unknown as OverworldContent
    const rejections = validateOverworldContent(frozen)
    expect(rejections.some((r) => r.includes('must be the stable root Scene ID poc-overworld'))).toBe(true)
  })

  it('rejects wrong presentation node IDs', () => {
    const mutated = cloneOverworld()
    mutated.presentationNodes.bandPawnNodeId = 'wrong-band-pawn'
    const frozen = deepFreeze(mutated) as unknown as OverworldContent
    const rejections = validateOverworldContent(frozen)
    expect(rejections.some((r) => r.includes('bandPawnNodeId must be poc-band-pawn'))).toBe(true)
  })

  it('rejects wrong animation clip names', () => {
    const mutated = cloneOverworld()
    mutated.presentationNodes.idleAnimationClip = 'wrong-idle'
    const frozen = deepFreeze(mutated) as unknown as OverworldContent
    const rejections = validateOverworldContent(frozen)
    expect(rejections.some((r) => r.includes('idleAnimationClip must be poc-band-idle'))).toBe(true)
  })

  it('rejects duplicate presentation node IDs', () => {
    const mutated = cloneOverworld()
    mutated.presentationNodes.terrainNodeId = 'poc-band-pawn' // duplicates bandPawnNodeId
    const frozen = deepFreeze(mutated) as unknown as OverworldContent
    const rejections = validateOverworldContent(frozen)
    expect(rejections.some((r) => r.includes('presentation node IDs must be unique') || r.includes('terrainNodeId must be'))).toBe(true)
  })

  it('rejects identical idle and travel animation clip names', () => {
    const mutated = cloneOverworld()
    mutated.presentationNodes.travelAnimationClip = 'poc-band-idle'
    const frozen = deepFreeze(mutated) as unknown as OverworldContent
    const rejections = validateOverworldContent(frozen)
    expect(rejections.some((r) => r.includes('idle and travel animation clip names must be distinct') || r.includes('travelAnimationClip must be'))).toBe(true)
  })
})

describe('Destination schema extensibility (REQ-035, PVS-FLW-022)', () => {
  it('validates a second location record through the same generic schema without destination-specific fields', () => {
    const secondLocation: OverworldDestinationContent = Object.freeze({
      id: 'poc-bandit-camp',
      name: 'Bandit Camp',
      targetSceneId: 'poc-bandit-camp-scene',
      position: Object.freeze({ x: 2.0, y: 0, z: 1.0 }),
      entryBoundary: Object.freeze({
        position: Object.freeze({ x: 2.0, y: 0, z: 1.0 }),
        radius: 0.3,
      }),
    })

    const rejections = validateDestinationRecord(secondLocation)
    expect(rejections).toEqual([])
  })

  it('accepts an Overworld content record containing a second destination', () => {
    const mutated = cloneOverworld()
    mutated.destinations.push({
      id: 'poc-bandit-camp',
      name: 'Bandit Camp',
      targetSceneId: 'poc-bandit-camp-scene',
      position: { x: 2.0, y: 0, z: 1.0 },
      entryBoundary: {
        position: { x: 2.0, y: 0, z: 1.0 },
        radius: 0.3,
      },
    })
    const frozen = deepFreeze(mutated) as unknown as OverworldContent
    const rejections = validateOverworldContent(frozen)
    expect(rejections).toEqual([])
  })
})

describe('Scene manifest contract (ARCH-016, REQ-136)', () => {
  it('accepts the authored Scene catalog with real glTF fixture', () => {
    const rejections = validateSceneManifest(SCENES, (source) => `public/${source}`)
    expect(rejections).toEqual([])
  })
})

describe('Overworld glTF asset validation (ARCH-009, ARCH-016, REQ-089, REQ-170, PVS-FLW-002)', () => {
  const validDoc = {
    asset: { version: '2.0' },
    nodes: [
      { name: 'poc-overworld-terrain' },
      { name: 'poc-settlement-landmark' },
      { name: 'poc-band-pawn' },
    ],
    meshes: [
      { name: 'poc-overworld-terrain-mesh' },
      { name: 'poc-settlement-landmark-mesh' },
      { name: 'poc-band-pawn-mesh' },
    ],
    animations: [
      { name: 'poc-band-idle' },
      { name: 'poc-band-travel' },
    ],
  }

  it('accepts a valid Overworld glTF document', () => {
    const rejections = validateOverworldGltfAsset(validDoc)
    expect(rejections).toEqual([])
  })

  it('rejects an invalid asset version', () => {
    const rejections = validateOverworldGltfAsset({ ...validDoc, asset: { version: '1.0' } })
    expect(rejections.some((r) => r.includes('asset version must be exactly'))).toBe(true)
  })

  it('rejects when the Band-pawn node is missing', () => {
    const doc = {
      ...validDoc,
      nodes: [{ name: 'poc-overworld-terrain' }, { name: 'poc-settlement-landmark' }],
    }
    const rejections = validateOverworldGltfAsset(doc)
    expect(rejections.some((r) => r.includes('missing the Band-pawn node'))).toBe(true)
  })

  it('rejects multiple Band-pawn nodes', () => {
    const doc = {
      ...validDoc,
      nodes: [
        { name: 'poc-overworld-terrain' },
        { name: 'poc-settlement-landmark' },
        { name: 'poc-band-pawn' },
        { name: 'poc-band-pawn' },
      ],
    }
    const rejections = validateOverworldGltfAsset(doc)
    expect(rejections.some((r) => r.includes('must contain exactly one'))).toBe(true)
  })

  it('rejects when the terrain node is missing', () => {
    const doc = {
      ...validDoc,
      nodes: [{ name: 'poc-settlement-landmark' }, { name: 'poc-band-pawn' }],
    }
    const rejections = validateOverworldGltfAsset(doc)
    expect(rejections.some((r) => r.includes('missing the terrain node'))).toBe(true)
  })

  it('rejects when the settlement landmark node is missing', () => {
    const doc = {
      ...validDoc,
      nodes: [{ name: 'poc-overworld-terrain' }, { name: 'poc-band-pawn' }],
    }
    const rejections = validateOverworldGltfAsset(doc)
    expect(rejections.some((r) => r.includes('missing the settlement landmark node'))).toBe(true)
  })

  it('rejects separate player-character or companion nodes', () => {
    const doc = {
      ...validDoc,
      nodes: [
        ...validDoc.nodes,
        { name: 'poc-player-character' },
        { name: 'poc-companion' },
      ],
    }
    const rejections = validateOverworldGltfAsset(doc)
    expect(rejections.some((r) => r.includes('poc-player-character'))).toBe(true)
    expect(rejections.some((r) => r.includes('poc-companion'))).toBe(true)
  })

  it('rejects technical box meshes', () => {
    const doc = {
      ...validDoc,
      meshes: [
        { name: 'player-character-box' },
        { name: 'companion-box' },
      ],
    }
    const rejections = validateOverworldGltfAsset(doc)
    expect(rejections.some((r) => r.includes('technical box mesh'))).toBe(true)
  })

  it('rejects missing idle or travel animation clips', () => {
    const doc = {
      ...validDoc,
      animations: [{ name: 'poc-band-idle' }],
    }
    const rejections = validateOverworldGltfAsset(doc)
    expect(rejections.some((r) => r.includes('missing the travel animation clip'))).toBe(true)
  })

  it('handles malformed array elements without throwing', () => {
    const doc = {
      asset: { version: '2.0' },
      nodes: [null, undefined, 42, 'invalid', { name: null }],
      meshes: [null, undefined, 42, { name: null }, { name: 'some-box' }],
      animations: [null, undefined, 42, { name: null }],
    }
    expect(() => validateOverworldGltfAsset(doc)).not.toThrow()
    const rejections = validateOverworldGltfAsset(doc)
    expect(rejections.some((r) => r.includes('missing the Band-pawn node'))).toBe(true)
    expect(rejections.some((r) => r.includes('technical box mesh'))).toBe(true)
  })
})
