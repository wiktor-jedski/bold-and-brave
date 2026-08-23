/**
 * Integration tests for the Navigation Port and Authored Navigation Adapter (ARCH-014, ARCH-015).
 *
 * Verifies:
 *   1. Execution against the real Overworld catalog (ARCH-016).
 *   2. Determinism across identical runs.
 *   3. Bounded progress for traversable targets without overshoot.
 *   4. Exact stop condition when arriving at a target.
 *   5. Typed invalid results for out-of-bounds, non-finite, and unreachable targets.
 *   6. Branchless support for a second authored destination.
 *   7. Replaceable Navigation Port conformance.
 *   8. Deep immutability of returned structures.
 *   9. Full journey simulation from start position to settlement entry boundary.
 */
import { describe, expect, it } from 'vitest'
import {
  OVERWORLD,
  OVERWORLD_DESTINATIONS,
  OVERWORLD_NAVIGATION_ANCHORS,
  OVERWORLD_TRAVERSABLE_GROUND,
  OVERWORLD_TRAVEL,
} from '../content'
import type {
  OverworldDestinationContent,
  WorldPosition,
} from '../content'
import {
  AuthoredNavigationAdapter,
  calculateSpeedPerTick,
  createAuthoredNavigationAdapter,
  distanceBetween,
  isInvalidNavigationResult,
  isPositionInTraversableGround,
  isSteeringIntent,
} from './index'
import type {
  NavigationPort,
  NavigationRequest,
  NavigationResult,
  SteeringIntent,
} from './index'

describe('Navigation Port and Authored Navigation Adapter (ARCH-014, ARCH-015)', () => {
  const adapter = createAuthoredNavigationAdapter()

  it('runs against the real Overworld catalog and returns valid steering intent', () => {
    const destination = OVERWORLD_DESTINATIONS[0]
    expect(destination).toBeDefined()
    expect(destination.id).toBe('poc-settlement')

    const request: NavigationRequest = {
      state: { position: OVERWORLD.startPosition },
      target: destination.position,
      traversability: OVERWORLD,
      tick: 0,
    }

    const result = adapter.computeSteering(request)

    expect(isSteeringIntent(result)).toBe(true)
    if (isSteeringIntent(result)) {
      expect(result.arrived).toBe(false)
      expect(result.target).toEqual(destination.position)
      expect(result.remainingDistance).toBeCloseTo(1.5, 9)
      expect(result.desiredDirection).toEqual({ x: 0, y: 0, z: -1 })

      // Speed per tick at 1× is 3.0 / 7200 = 1 / 2400
      const expectedStepZ = -(3.0 / 7200)
      expect(result.step.x).toBeCloseTo(0, 9)
      expect(result.step.y).toBeCloseTo(0, 9)
      expect(result.step.z).toBeCloseTo(expectedStepZ, 9)
    }
  })

  it('produces equal steering intents across two identical runs (determinism)', () => {
    const destination = OVERWORLD_DESTINATIONS[0].position

    const run = (adapterInstance: NavigationPort): SteeringIntent[] => {
      let currentPos: WorldPosition = { ...OVERWORLD.startPosition }
      const intents: SteeringIntent[] = []

      for (let tick = 0; tick < 120; tick += 1) {
        const result = adapterInstance.computeSteering({
          state: { position: currentPos },
          target: destination,
          traversability: OVERWORLD,
          tick,
        })

        if (!isSteeringIntent(result)) {
          throw new Error('Expected steering intent')
        }

        intents.push(result)
        currentPos = {
          x: currentPos.x + result.step.x,
          y: currentPos.y + result.step.y,
          z: currentPos.z + result.step.z,
        }
      }

      return intents
    }

    const firstRun = run(createAuthoredNavigationAdapter())
    const secondRun = run(createAuthoredNavigationAdapter())

    expect(firstRun).toHaveLength(120)
    expect(secondRun).toHaveLength(120)
    expect(firstRun).toEqual(secondRun)
  })

  it('produces bounded progress without overshoot for traversable targets', () => {
    const start = OVERWORLD.startPosition
    const target = OVERWORLD_DESTINATIONS[0].position

    const result = adapter.computeSteering({
      state: { position: start },
      target,
      traversability: OVERWORLD,
      tick: 0,
    })

    expect(isSteeringIntent(result)).toBe(true)
    if (isSteeringIntent(result)) {
      const stepMagnitude = Math.hypot(result.step.x, result.step.y, result.step.z)
      const expectedMaxSpeed = calculateSpeedPerTick(OVERWORLD.travel)

      expect(stepMagnitude).toBeCloseTo(expectedMaxSpeed, 9)
      expect(stepMagnitude).toBeLessThanOrEqual(result.remainingDistance)
    }

    // Near target: step must cap at remaining distance without overshoot
    const nearTarget: WorldPosition = { x: 0, y: 0, z: 0.0001 }
    const nearResult = adapter.computeSteering({
      state: { position: nearTarget },
      target: { x: 0, y: 0, z: 0 },
      traversability: OVERWORLD,
      tick: 1,
    })

    expect(isSteeringIntent(nearResult)).toBe(true)
    if (isSteeringIntent(nearResult)) {
      const nearStepMagnitude = Math.hypot(nearResult.step.x, nearResult.step.y, nearResult.step.z)
      expect(nearStepMagnitude).toBeCloseTo(0.0001, 9)
      expect(nearResult.step.z).toBeCloseTo(-0.0001, 9)
    }
  })

  it('produces an exact stop when at the target position', () => {
    const target: WorldPosition = { x: 0, y: 0, z: 0 }

    const result = adapter.computeSteering({
      state: { position: target },
      target,
      traversability: OVERWORLD,
      tick: 0,
    })

    expect(isSteeringIntent(result)).toBe(true)
    if (isSteeringIntent(result)) {
      expect(result.arrived).toBe(true)
      expect(result.step).toEqual({ x: 0, y: 0, z: 0 })
      expect(result.desiredDirection).toEqual({ x: 0, y: 0, z: 0 })
      expect(result.remainingDistance).toBe(0)
      expect(result.target).toEqual(target)
    }
  })

  it('handles targets near and below the formal arrival threshold deterministically', () => {
    // 1. Target strictly below ARRIVAL_DISTANCE_THRESHOLD (1e-13 <= 1e-9) reports arrived: true
    const current: WorldPosition = { x: 0, y: 0, z: 1.0 }
    const subThresholdTarget: WorldPosition = { x: 0, y: 0, z: 1.0 - 1e-13 }

    const subResult = adapter.computeSteering({
      state: { position: current },
      target: subThresholdTarget,
      traversability: OVERWORLD,
      tick: 0,
    })

    expect(isSteeringIntent(subResult)).toBe(true)
    if (isSteeringIntent(subResult)) {
      expect(subResult.arrived).toBe(true)
      expect(subResult.step).toEqual({ x: 0, y: 0, z: 0 })
      expect(subResult.remainingDistance).toBe(0)
    }

    // 2. Target above threshold (e.g. 1e-7 > 1e-9) steps exact distance and arrives on next tick
    const aboveThresholdTarget: WorldPosition = { x: 0, y: 0, z: 1.0 - 1e-7 }
    const stepResult = adapter.computeSteering({
      state: { position: current },
      target: aboveThresholdTarget,
      traversability: OVERWORLD,
      tick: 0,
    })

    expect(isSteeringIntent(stepResult)).toBe(true)
    if (isSteeringIntent(stepResult)) {
      expect(stepResult.arrived).toBe(false)
      expect(stepResult.remainingDistance).toBeCloseTo(1e-7, 9)
      expect(stepResult.step.z).toBeCloseTo(-1e-7, 9)

      const nextPos: WorldPosition = {
        x: current.x + stepResult.step.x,
        y: current.y + stepResult.step.y,
        z: current.z + stepResult.step.z,
      }
      const arrivalResult = adapter.computeSteering({
        state: { position: nextPos },
        target: aboveThresholdTarget,
        traversability: OVERWORLD,
        tick: 1,
      })
      expect(isSteeringIntent(arrivalResult)).toBe(true)
      if (isSteeringIntent(arrivalResult)) {
        expect(arrivalResult.arrived).toBe(true)
        expect(arrivalResult.step).toEqual({ x: 0, y: 0, z: 0 })
        expect(arrivalResult.remainingDistance).toBe(0)
      }
    }
  })

  it('rejects malformed negative and non-finite travel speed without backward movement', () => {
    const negativeSpeedResult = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: OVERWORLD_DESTINATIONS[0].position,
      traversability: OVERWORLD,
      tick: 0,
      speedWorldUnitsPerTick: -0.5,
    })
    expect(isInvalidNavigationResult(negativeSpeedResult)).toBe(true)
    if (isInvalidNavigationResult(negativeSpeedResult)) {
      expect(negativeSpeedResult.reason).toBe('invalid-state')
      expect(negativeSpeedResult.message).toContain('speed')
    }

    const nanSpeedResult = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: OVERWORLD_DESTINATIONS[0].position,
      traversability: OVERWORLD,
      tick: 0,
      speedWorldUnitsPerTick: Number.NaN,
    })
    expect(isInvalidNavigationResult(nanSpeedResult)).toBe(true)
    if (isInvalidNavigationResult(nanSpeedResult)) {
      expect(nanSpeedResult.reason).toBe('invalid-state')
    }

    const negativeAuthoredResult = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: OVERWORLD_DESTINATIONS[0].position,
      traversability: {
        ...OVERWORLD,
        travel: {
          ...OVERWORLD.travel,
          speedWorldUnitsPerDay: -3.0,
        },
      },
      tick: 0,
    })
    expect(isInvalidNavigationResult(negativeAuthoredResult)).toBe(true)
    if (isInvalidNavigationResult(negativeAuthoredResult)) {
      expect(negativeAuthoredResult.reason).toBe('invalid-state')
    }
  })

  it('rejects non-positive and non-finite travel timing fields (realSecondsPerOverworldHour and hoursPerOverworldDay)', () => {
    // Zero realSecondsPerOverworldHour
    const zeroSecResult = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: OVERWORLD_DESTINATIONS[0].position,
      traversability: {
        ...OVERWORLD,
        travel: {
          ...OVERWORLD.travel,
          realSecondsPerOverworldHour: 0,
        },
      },
      tick: 0,
    })
    expect(isInvalidNavigationResult(zeroSecResult)).toBe(true)
    if (isInvalidNavigationResult(zeroSecResult)) {
      expect(zeroSecResult.reason).toBe('invalid-state')
      expect(zeroSecResult.message).toContain('real seconds per Overworld hour')
    }

    // Negative realSecondsPerOverworldHour
    const negSecResult = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: OVERWORLD_DESTINATIONS[0].position,
      traversability: {
        ...OVERWORLD,
        travel: {
          ...OVERWORLD.travel,
          realSecondsPerOverworldHour: -5.0,
        },
      },
      tick: 0,
    })
    expect(isInvalidNavigationResult(negSecResult)).toBe(true)
    if (isInvalidNavigationResult(negSecResult)) {
      expect(negSecResult.reason).toBe('invalid-state')
    }

    // Non-finite (NaN / Infinity) realSecondsPerOverworldHour
    const nanSecResult = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: OVERWORLD_DESTINATIONS[0].position,
      traversability: {
        ...OVERWORLD,
        travel: {
          ...OVERWORLD.travel,
          realSecondsPerOverworldHour: Number.NaN,
        },
      },
      tick: 0,
    })
    expect(isInvalidNavigationResult(nanSecResult)).toBe(true)
    if (isInvalidNavigationResult(nanSecResult)) {
      expect(nanSecResult.reason).toBe('invalid-state')
    }

    // Zero hoursPerOverworldDay
    const zeroHoursResult = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: OVERWORLD_DESTINATIONS[0].position,
      traversability: {
        ...OVERWORLD,
        travel: {
          ...OVERWORLD.travel,
          hoursPerOverworldDay: 0,
        },
      },
      tick: 0,
    })
    expect(isInvalidNavigationResult(zeroHoursResult)).toBe(true)
    if (isInvalidNavigationResult(zeroHoursResult)) {
      expect(zeroHoursResult.reason).toBe('invalid-state')
      expect(zeroHoursResult.message).toContain('hours per Overworld day')
    }

    // Negative hoursPerOverworldDay
    const negHoursResult = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: OVERWORLD_DESTINATIONS[0].position,
      traversability: {
        ...OVERWORLD,
        travel: {
          ...OVERWORLD.travel,
          hoursPerOverworldDay: -24,
        },
      },
      tick: 0,
    })
    expect(isInvalidNavigationResult(negHoursResult)).toBe(true)
    if (isInvalidNavigationResult(negHoursResult)) {
      expect(negHoursResult.reason).toBe('invalid-state')
    }

    // Non-finite hoursPerOverworldDay
    const infHoursResult = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: OVERWORLD_DESTINATIONS[0].position,
      traversability: {
        ...OVERWORLD,
        travel: {
          ...OVERWORLD.travel,
          hoursPerOverworldDay: Number.POSITIVE_INFINITY,
        },
      },
      tick: 0,
    })
    expect(isInvalidNavigationResult(infHoursResult)).toBe(true)
    if (isInvalidNavigationResult(infHoursResult)) {
      expect(infHoursResult.reason).toBe('invalid-state')
    }
  })

  it('demonstrates deterministic anchor-driven steering with non-collinear anchor influence', () => {
    const nonCollinearAnchor = {
      id: 'poc-anchor-dogleg',
      position: Object.freeze({ x: 1.0, y: 0, z: 0.75 }),
    }

    const traversabilityWithDogleg = {
      ...OVERWORLD,
      navigationAnchors: [nonCollinearAnchor],
    }

    const result = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: OVERWORLD_DESTINATIONS[0].position,
      traversability: traversabilityWithDogleg,
      tick: 0,
    })

    expect(isSteeringIntent(result)).toBe(true)
    if (isSteeringIntent(result)) {
      expect(result.arrived).toBe(false)
      const expectedDistToAnchor = 1.25
      const expectedUx = 1.0 / expectedDistToAnchor
      const expectedUz = -0.75 / expectedDistToAnchor

      expect(result.desiredDirection.x).toBeCloseTo(expectedUx, 9)
      expect(result.desiredDirection.y).toBeCloseTo(0, 9)
      expect(result.desiredDirection.z).toBeCloseTo(expectedUz, 9)

      const speed = calculateSpeedPerTick(OVERWORLD.travel)
      expect(result.step.x).toBeCloseTo(expectedUx * speed, 9)
      expect(result.step.z).toBeCloseTo(expectedUz * speed, 9)
      expect(result.step.x).toBeGreaterThan(0)
    }
  })

  it('returns a typed invalid result for non-traversable targets outside ground bounds', () => {
    // Target outside positive X
    const outXResult = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: { x: 100.0, y: 0, z: 0 },
      traversability: OVERWORLD,
      tick: 0,
    })
    expect(isInvalidNavigationResult(outXResult)).toBe(true)
    if (isInvalidNavigationResult(outXResult)) {
      expect(outXResult.reason).toBe('out-of-bounds')
      expect(outXResult.message).toContain('outside traversable ground')
    }

    // Target outside negative Z
    const outZResult = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: { x: 0, y: 0, z: -10.0 },
      traversability: OVERWORLD,
      tick: 0,
    })
    expect(isInvalidNavigationResult(outZResult)).toBe(true)
    if (isInvalidNavigationResult(outZResult)) {
      expect(outZResult.reason).toBe('out-of-bounds')
    }

    // Current state position outside traversable ground
    const outStateResult = adapter.computeSteering({
      state: { position: { x: -50.0, y: 0, z: 0 } },
      target: OVERWORLD_DESTINATIONS[0].position,
      traversability: OVERWORLD,
      tick: 0,
    })
    expect(isInvalidNavigationResult(outStateResult)).toBe(true)
    if (isInvalidNavigationResult(outStateResult)) {
      expect(outStateResult.reason).toBe('out-of-bounds')
    }
  })

  it('returns a typed invalid result for non-finite target and state coordinates', () => {
    // NaN target
    const nanTargetResult = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: { x: Number.NaN, y: 0, z: 0 },
      traversability: OVERWORLD,
      tick: 0,
    })
    expect(isInvalidNavigationResult(nanTargetResult)).toBe(true)
    if (isInvalidNavigationResult(nanTargetResult)) {
      expect(nanTargetResult.reason).toBe('invalid-target')
    }

    // Infinity state position
    const infStateResult = adapter.computeSteering({
      state: { position: { x: 0, y: Number.POSITIVE_INFINITY, z: 0 } },
      target: OVERWORLD_DESTINATIONS[0].position,
      traversability: OVERWORLD,
      tick: 0,
    })
    expect(isInvalidNavigationResult(infStateResult)).toBe(true)
    if (isInvalidNavigationResult(infStateResult)) {
      expect(infStateResult.reason).toBe('invalid-state')
    }
  })

  it('returns a typed invalid result for unreachable targets', () => {
    const unreachableTarget: WorldPosition = { x: 2.0, y: 0, z: 2.0 }

    const customTraversability = {
      ...OVERWORLD,
      isReachable: (_from: WorldPosition, to: WorldPosition): boolean => {
        // Mock a barrier separating specific points
        return to.x !== unreachableTarget.x || to.z !== unreachableTarget.z
      },
    }

    const result = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: unreachableTarget,
      traversability: customTraversability,
      tick: 0,
    })

    expect(isInvalidNavigationResult(result)).toBe(true)
    if (isInvalidNavigationResult(result)) {
      expect(result.reason).toBe('unreachable')
      expect(result.message).toContain('unreachable')
    }
  })

  it('handles a second authored destination without a code branch (REQ-035, PVS-FLW-022)', () => {
    // A second destination within the same traversable ground
    const secondDestination: OverworldDestinationContent = Object.freeze({
      id: 'poc-frontier-outpost',
      name: 'Frontier Outpost',
      targetSceneId: 'poc-frontier-outpost',
      position: Object.freeze({ x: 2.0, y: 0, z: -1.0 }),
      entryBoundary: Object.freeze({
        position: Object.freeze({ x: 2.0, y: 0, z: -1.0 }),
        radius: 0.3,
      }),
    })

    const request: NavigationRequest = {
      state: { position: OVERWORLD.startPosition },
      target: secondDestination.position,
      traversability: {
        ...OVERWORLD,
        navigationAnchors: [],
      },
      tick: 0,
    }
    const result = adapter.computeSteering(request)

    expect(isSteeringIntent(result)).toBe(true)
    if (isSteeringIntent(result)) {
      expect(result.arrived).toBe(false)
      expect(result.target).toEqual(secondDestination.position)

      const expectedDistance = distanceBetween(OVERWORLD.startPosition, secondDestination.position)
      expect(result.remainingDistance).toBeCloseTo(expectedDistance, 9)

      // Direction vector from (0, 0, 1.5) to (2.0, 0, -1.0): dx = 2.0, dz = -2.5
      const expectedUx = 2.0 / expectedDistance
      const expectedUz = -2.5 / expectedDistance

      expect(result.desiredDirection.x).toBeCloseTo(expectedUx, 9)
      expect(result.desiredDirection.y).toBeCloseTo(0, 9)
      expect(result.desiredDirection.z).toBeCloseTo(expectedUz, 9)

      // Step magnitude equals speedPerTick
      const speed = calculateSpeedPerTick(OVERWORLD.travel)
      expect(result.step.x).toBeCloseTo(expectedUx * speed, 9)
      expect(result.step.z).toBeCloseTo(expectedUz * speed, 9)
    }
  })

  it('allows a second conforming Navigation Port implementation to be selected (REQ-117)', () => {
    // Alternative / mock NavigationPort implementation
    const alternativePort: NavigationPort = {
      computeSteering(request: NavigationRequest): NavigationResult {
        return Object.freeze({
          kind: 'steering-intent',
          arrived: true,
          step: Object.freeze({ x: 0, y: 0, z: 0 }),
          desiredDirection: Object.freeze({ x: 0, y: 0, z: 0 }),
          remainingDistance: 0,
          target: Object.freeze({ ...request.target }),
        })
      },
    }

    // A generic gameplay caller accepting any NavigationPort
    function executeSteering(
      port: NavigationPort,
      request: NavigationRequest,
    ): NavigationResult {
      return port.computeSteering(request)
    }

    const request: NavigationRequest = {
      state: { position: OVERWORLD.startPosition },
      target: OVERWORLD_DESTINATIONS[0].position,
      traversability: OVERWORLD,
      tick: 0,
    }

    const customResult = executeSteering(alternativePort, request)
    expect(isSteeringIntent(customResult)).toBe(true)
    if (isSteeringIntent(customResult)) {
      expect(customResult.arrived).toBe(true)
    }

    const productionResult = executeSteering(adapter, request)
    expect(isSteeringIntent(productionResult)).toBe(true)
    if (isSteeringIntent(productionResult)) {
      expect(productionResult.arrived).toBe(false)
    }
  })

  it('returns deeply frozen immutable results and rejects mutation', () => {
    const result = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: OVERWORLD_DESTINATIONS[0].position,
      traversability: OVERWORLD,
      tick: 0,
    })

    expect(Object.isFrozen(result)).toBe(true)
    if (isSteeringIntent(result)) {
      expect(Object.isFrozen(result.step)).toBe(true)
      expect(Object.isFrozen(result.desiredDirection)).toBe(true)
      expect(Object.isFrozen(result.target)).toBe(true)

      expect(() => {
        ;(result as { arrived: boolean }).arrived = true
      }).toThrow(TypeError)

      expect(() => {
        ;(result.step as { x: number }).x = 999
      }).toThrow(TypeError)
    }

    const invalidResult = adapter.computeSteering({
      state: { position: OVERWORLD.startPosition },
      target: { x: 100, y: 0, z: 0 },
      traversability: OVERWORLD,
      tick: 0,
    })

    expect(Object.isFrozen(invalidResult)).toBe(true)
    expect(() => {
      ;(invalidResult as { message: string }).message = 'hacked'
    }).toThrow(TypeError)
  })

  it('completes the full 3600-tick Overworld journey from start to settlement entry (REQ-017, REQ-018)', () => {
    let position: WorldPosition = { ...OVERWORLD.startPosition }
    const destination = OVERWORLD_DESTINATIONS[0].position

    // Start at z = 1.5, destination at z = 0.0
    // Total distance = 1.5 world units
    // Speed = 3.0 world units / 7200 ticks = 1 / 2400 per tick
    // Total ticks required = 1.5 * 2400 = 3600 ticks (0.5 Overworld day / 60 real seconds)

    for (let tick = 0; tick < 3600; tick += 1) {
      const result = adapter.computeSteering({
        state: { position },
        target: destination,
        traversability: OVERWORLD,
        tick,
      })

      if (!isSteeringIntent(result)) {
        throw new Error(`Unexpected invalid result at tick ${tick}`)
      }

      expect(result.arrived).toBe(false)
      expect(result.step.z).toBeCloseTo(-(1 / 2400), 9)

      // Halfway check at tick 1800 (0.25 Overworld day)
      if (tick === 1800) {
        expect(position.z).toBeCloseTo(0.75, 9)
        expect(result.remainingDistance).toBeCloseTo(0.75, 9)
      }

      position = {
        x: position.x + result.step.x,
        y: position.y + result.step.y,
        z: position.z + result.step.z,
      }
    }

    // After 3600 ticks, position should be exactly at settlement entry (0, 0, 0)
    expect(position.x).toBeCloseTo(0, 9)
    expect(position.y).toBeCloseTo(0, 9)
    expect(position.z).toBeCloseTo(0, 9)

    // Tick 3600 query reports arrival
    const arrivalResult = adapter.computeSteering({
      state: { position },
      target: destination,
      traversability: OVERWORLD,
      tick: 3600,
    })

    expect(isSteeringIntent(arrivalResult)).toBe(true)
    if (isSteeringIntent(arrivalResult)) {
      expect(arrivalResult.arrived).toBe(true)
      expect(arrivalResult.step).toEqual({ x: 0, y: 0, z: 0 })
      expect(arrivalResult.desiredDirection).toEqual({ x: 0, y: 0, z: 0 })
      expect(arrivalResult.remainingDistance).toBe(0)
    }

    // Subsequent ticks keep reporting stop
    const postArrivalResult = adapter.computeSteering({
      state: { position },
      target: destination,
      traversability: OVERWORLD,
      tick: 3601,
    })
    expect(isSteeringIntent(postArrivalResult)).toBe(true)
    if (isSteeringIntent(postArrivalResult)) {
      expect(postArrivalResult.arrived).toBe(true)
      expect(postArrivalResult.step).toEqual({ x: 0, y: 0, z: 0 })
    }
  })

  it('exports helper functions that correctly evaluate traversability and speed', () => {
    const directInstance = new AuthoredNavigationAdapter()
    expect(directInstance).toBeInstanceOf(AuthoredNavigationAdapter)

    // isPositionInTraversableGround
    expect(isPositionInTraversableGround({ x: 0, y: 0, z: 0 }, OVERWORLD_TRAVERSABLE_GROUND)).toBe(true)
    expect(isPositionInTraversableGround({ x: 100, y: 0, z: 0 }, OVERWORLD_TRAVERSABLE_GROUND)).toBe(false)

    // calculateSpeedPerTick
    expect(calculateSpeedPerTick(OVERWORLD_TRAVEL)).toBeCloseTo(3.0 / 7200, 9)
    expect(calculateSpeedPerTick(undefined)).toBeCloseTo(3.0 / 7200, 9)
    expect(calculateSpeedPerTick({ speedWorldUnitsPerDay: 6.0, realSecondsPerOverworldHour: 5.0, hoursPerOverworldDay: 24, provisionsPerMemberPerDay: 0.2 })).toBeCloseTo(6.0 / 7200, 9)
    expect(calculateSpeedPerTick({ speedWorldUnitsPerDay: 3.0, realSecondsPerOverworldHour: 0, hoursPerOverworldDay: 24, provisionsPerMemberPerDay: 0.2 })).toBe(0)
    expect(calculateSpeedPerTick({ speedWorldUnitsPerDay: 3.0, realSecondsPerOverworldHour: -5.0, hoursPerOverworldDay: 24, provisionsPerMemberPerDay: 0.2 })).toBe(0)
    expect(calculateSpeedPerTick({ speedWorldUnitsPerDay: 3.0, realSecondsPerOverworldHour: 5.0, hoursPerOverworldDay: 0, provisionsPerMemberPerDay: 0.2 })).toBe(0)
    expect(calculateSpeedPerTick({ speedWorldUnitsPerDay: 3.0, realSecondsPerOverworldHour: 5.0, hoursPerOverworldDay: -24, provisionsPerMemberPerDay: 0.2 })).toBe(0)
    expect(calculateSpeedPerTick({ speedWorldUnitsPerDay: -3.0, realSecondsPerOverworldHour: 5.0, hoursPerOverworldDay: 24, provisionsPerMemberPerDay: 0.2 })).toBe(0)
    expect(calculateSpeedPerTick({ speedWorldUnitsPerDay: Number.NaN, realSecondsPerOverworldHour: 5.0, hoursPerOverworldDay: 24, provisionsPerMemberPerDay: 0.2 })).toBe(0)
    // Navigation anchors all fall within traversable ground
    for (const anchor of OVERWORLD_NAVIGATION_ANCHORS) {
      expect(isPositionInTraversableGround(anchor.position, OVERWORLD_TRAVERSABLE_GROUND)).toBe(true)
    }
  })
})
