import { describe, expect, it } from 'vitest'
import { createSimulation } from './index'
import type {
  AgentRecord,
  SetDestinationCommand,
  Simulation,
  SimulationCommand,
  SimulationProjection,
  TogglePauseCommand,
} from './index'
import { INITIAL_BAND, MIRO, OVERWORLD, PLAYER_CHARACTER } from '../content'
import type { Disposition, Grievance, OverworldContent } from '../content'
import {
  createAuthoredNavigationAdapter,
  type NavigationPort,
  type NavigationRequest,
  type NavigationResult,
} from '../navigation'
describe('Simulation module', () => {
  it('exposes the public Simulation interface from the factory', () => {
    const simulation = createSimulation()

    expect(Object.keys(simulation).sort()).toEqual([
      'advanceTick',
      'drainFeedbackEvents',
      'readProjection',
      'submitCommand',
    ].sort())
    expect(simulation.readProjection).toBeTypeOf('function')
    expect(simulation.advanceTick).toBeTypeOf('function')
    expect(simulation.submitCommand).toBeTypeOf('function')
    expect(simulation.drainFeedbackEvents).toBeTypeOf('function')

    const typed: Simulation = simulation
    expect(typed.readProjection().tick).toBe(0)
    expect(typed.readProjection().agents).toHaveLength(2)
  })

  it('reports the initial Simulation tick of 0 on two reads', () => {
    const simulation = createSimulation()

    expect(simulation.readProjection().tick).toBe(0)
    expect(simulation.readProjection().tick).toBe(0)
  })

  it('projects exactly the two initial named-Agent records as plain data', () => {
    const simulation = createSimulation()

    const { agents } = simulation.readProjection()

    // The Agent relationship model starts with exactly two records
    // (REQ-167, PVS-REL-001): Village Elder and Varek.
    expect(agents).toHaveLength(2)
    expect(agents[0]).toEqual({
      id: 'poc-contract-giver',
      name: 'Village Elder',
      role: 'Contract-giver Agent',
      fate: 'Active',
      disposition: 'Neutral',
      grievances: [],
    })
    expect(agents[1]).toEqual({
      id: 'poc-enemy-agent',
      name: 'Varek',
      role: 'Enemy Agent',
      fate: 'Active',
      disposition: 'Hostile',
      grievances: [],
    })
  })

  it('projects value-equal Agent state from two new Simulations', () => {
    const first = createSimulation()
    const second = createSimulation()

    expect(first.readProjection().agents).toEqual(second.readProjection().agents)
  })

  it('creates no relationship record for Miro or a generic settlement resident', () => {
    const { agents } = createSimulation().readProjection()

    expect(agents.map((agent) => agent.id)).toEqual(['poc-contract-giver', 'poc-enemy-agent'])
    expect(agents.map((agent) => agent.name)).toEqual(['Village Elder', 'Varek'])

    // Miro (the fixed Companion) and generic settlement residents stay
    // outside the Agent relationship model (REQ-167, PVS-REL-001).
    expect(agents.some((agent) => agent.id === 'poc-companion' || agent.name === 'Miro')).toBe(false)
  })

  it('projects deeply frozen Agent records', () => {
    const { agents } = createSimulation().readProjection()

    expect(Object.isFrozen(agents)).toBe(true)
    for (const agent of agents) {
      expect(Object.isFrozen(agent)).toBe(true)
      expect(Object.isFrozen(agent.grievances)).toBe(true)
    }
  })

  it('does not share Agent record or Grievance list references between Simulations', () => {
    const firstAgents = createSimulation().readProjection().agents
    const secondAgents = createSimulation().readProjection().agents

    for (let index = 0; index < firstAgents.length; index += 1) {
      expect(firstAgents[index]).not.toBe(secondAgents[index])
      expect(firstAgents[index].grievances).not.toBe(secondAgents[index].grievances)
    }
  })

  it('rejects Agent projection mutation without changing later reads', () => {
    const simulation = createSimulation()

    const projection = simulation.readProjection()

    // Runtime enforcement: even a caller that casts away readonly cannot
    // mutate the projected Disposition, Grievance list, or record list.
    expect(() => {
      ;(projection.agents[0] as { disposition: Disposition }).disposition = 'Hostile'
    }).toThrow(TypeError)

    expect(() => {
      ;(projection.agents[0].grievances as Grievance[]).push({ cause: 'Agent executed' })
    }).toThrow(TypeError)

    expect(() => {
      ;(projection.agents as AgentRecord[]).pop()
    }).toThrow(TypeError)

    const later = simulation.readProjection()
    expect(later.agents).toHaveLength(2)
    expect(later.agents[0].disposition).toBe('Neutral')
    expect(later.agents[0].grievances).toEqual([])
    expect(later.agents[1].disposition).toBe('Hostile')
  })

  it('changes tick 0 to tick 1 with one public advanceTick call', () => {
    const simulation = createSimulation()

    expect(simulation.readProjection().tick).toBe(0)
    simulation.advanceTick()
    expect(simulation.readProjection().tick).toBe(1)
  })

  it('ends at exactly tick 60 after 60 advanceTick calls', () => {
    const simulation = createSimulation()

    for (let tick = 0; tick < 60; tick += 1) {
      simulation.advanceTick()
    }

    expect(simulation.readProjection().tick).toBe(60)
  })

  it('lets a scenario-style caller advance an exact requested count through the same operation', () => {
    const simulation = createSimulation()

    // ARCH-025 scenario callers advance exact ticks through the one public
    // advanceTick operation; there is no scenario-only state mutator.
    const advanceExactTicks = (count: number): void => {
      for (let tick = 0; tick < count; tick += 1) {
        simulation.advanceTick()
      }
    }

    advanceExactTicks(137)

    expect(simulation.readProjection().tick).toBe(137)
    // No extra advance happens after the requested count.
    expect(simulation.readProjection().tick).toBe(137)
  })

  it('returns a frozen readonly projection', () => {
    const simulation = createSimulation()

    const projection = simulation.readProjection()
    expect(Object.isFrozen(projection)).toBe(true)
    // Runtime enforcement: even a caller that casts away readonly cannot mutate.
    expect(() => {
      (projection as { tick: number }).tick = 1
    }).toThrow(TypeError)
  })

  it('leaves a later read unchanged after a mutation attempt', () => {
    const simulation = createSimulation()

    const projection = simulation.readProjection()
    expect(() => {
      (projection as { tick: number }).tick = 1
    }).toThrow(TypeError)

    expect(simulation.readProjection().tick).toBe(0)
  })

  it('keeps every projection frozen and unchanged by later advanceTick calls', () => {
    const simulation = createSimulation()

    const atTickZero = simulation.readProjection()
    simulation.advanceTick()
    const atTickOne = simulation.readProjection()

    expect(Object.isFrozen(atTickZero)).toBe(true)
    expect(Object.isFrozen(atTickOne)).toBe(true)
    expect(atTickZero.tick).toBe(0)
    expect(atTickOne.tick).toBe(1)

    // An attempted projection mutation cannot change the Simulation tick.
    expect(() => {
      (atTickOne as { tick: number }).tick = 0
    }).toThrow(TypeError)
    expect(simulation.readProjection().tick).toBe(1)
  })

  it('projects the complete tick-0 campaign state with one exact expected value', () => {
    const first = createSimulation()
    const second = createSimulation()

    // The complete tick-0 plain-state projection of a new campaign
    // (REQ-017, REQ-077, REQ-167, PVS-FLW-001, PVS-PRP-001): the Agent state from
    // task 8, 100 Coin, 10.0 Provisions, Band membership of the player character
    // and Miro (`poc-companion`), Overworld Scene, Band-pawn position at (0, 0, 1.5),
    // null destination, idle movement state, unpaused, elapsed campaign time 0,
    // and consumption remainder 0.
    const expected = {
      tick: 0,
      agents: [
        {
          id: 'poc-contract-giver',
          name: 'Village Elder',
          role: 'Contract-giver Agent',
          fate: 'Active',
          disposition: 'Neutral',
          grievances: [],
        },
        {
          id: 'poc-enemy-agent',
          name: 'Varek',
          role: 'Enemy Agent',
          fate: 'Active',
          disposition: 'Hostile',
          grievances: [],
        },
      ],
      band: [
        { id: 'poc-player-character', name: 'Player Character' },
        { id: 'poc-companion', name: 'Miro' },
      ],
      coin: 100,
      provisions: 10.0,
      scene: 'poc-overworld',
      bandPawnPosition: { x: 0, y: 0, z: 1.5 },
      destination: null,
      movementState: 'idle',
      paused: false,
      elapsedCampaignTime: 0,
      consumptionRemainder: 0,
    }

    expect(first.readProjection()).toEqual(expected)
    expect(second.readProjection()).toEqual(expected)
  })

  it('keeps Miro in the Band as the fixed Companion while Coin remains 100', () => {
    const projection = createSimulation().readProjection()

    // Miro has ID `poc-companion` and is present in the Band while Coin
    // remains 100 (REQ-077, PVS-PRP-001).
    expect(projection.band).toEqual([
      { id: 'poc-player-character', name: 'Player Character' },
      { id: 'poc-companion', name: 'Miro' },
    ])
    expect(projection.band.some((member) => member.id === 'poc-companion' && member.name === 'Miro')).toBe(true)
    expect(projection.coin).toBe(100)
    expect(projection.provisions).toBe(10.0)

    // The no-deduction behavior comes from authored content: both initial
    // Band members have a fixed 0-Coin join cost, so the new campaign starts
    // at the full 100 Coin even with Miro in the Band (ARCH-016).
    expect(PLAYER_CHARACTER.costCoin).toBe(0)
    expect(MIRO.costCoin).toBe(0)
    expect(INITIAL_BAND.reduce((total, member) => total + member.costCoin, 0)).toBe(0)
  })

  it('projects value-equal complete state from two new Simulations with separate deep-immutable nested data', () => {
    const first = createSimulation().readProjection()
    const second = createSimulation().readProjection()

    // The two complete projections are value-equal.
    expect(first).toEqual(second)
    expect(first.agents).toEqual(second.agents)
    expect(first.band).toEqual(second.band)
    expect(first.coin).toBe(second.coin)
    expect(first.provisions).toBe(second.provisions)
    expect(first.scene).toBe(second.scene)
    expect(first.bandPawnPosition).toEqual(second.bandPawnPosition)
    expect(first.destination).toBe(second.destination)
    expect(first.movementState).toBe(second.movementState)
    expect(first.paused).toBe(second.paused)
    expect(first.elapsedCampaignTime).toBe(second.elapsedCampaignTime)
    expect(first.consumptionRemainder).toBe(second.consumptionRemainder)

    // But each Simulation owns separate deep-immutable nested data
    // (ARCH-003): no record or list reference is shared.
    expect(first).not.toBe(second)
    expect(first.agents).not.toBe(second.agents)
    expect(first.band).not.toBe(second.band)
    expect(first.bandPawnPosition).not.toBe(second.bandPawnPosition)
    for (let index = 0; index < first.agents.length; index += 1) {
      expect(first.agents[index]).not.toBe(second.agents[index])
      expect(first.agents[index].grievances).not.toBe(second.agents[index].grievances)
    }
    for (let index = 0; index < first.band.length; index += 1) {
      expect(first.band[index]).not.toBe(second.band[index])
    }

    // The nested data is deep-immutable in both projections.
    expect(Object.isFrozen(first.band)).toBe(true)
    expect(Object.isFrozen(second.band)).toBe(true)
    expect(Object.isFrozen(first.bandPawnPosition)).toBe(true)
    expect(Object.isFrozen(second.bandPawnPosition)).toBe(true)
    for (const member of first.band) {
      expect(Object.isFrozen(member)).toBe(true)
    }
    for (const member of second.band) {
      expect(Object.isFrozen(member)).toBe(true)
    }
  })

  it('keeps stationary ticks unchanged in position, time, Provisions, and remainder', () => {
    const simulation = createSimulation()

    const initial = simulation.readProjection()
    expect(initial.tick).toBe(0)
    expect(initial.bandPawnPosition).toEqual({ x: 0, y: 0, z: 1.5 })
    expect(initial.destination).toBeNull()
    expect(initial.movementState).toBe('idle')
    expect(initial.elapsedCampaignTime).toBe(0)
    expect(initial.provisions).toBe(10.0)
    expect(initial.consumptionRemainder).toBe(0)

    // Advance 60 stationary ticks (no destination command submitted).
    for (let tick = 0; tick < 60; tick += 1) {
      simulation.advanceTick()
    }

    const afterStationary = simulation.readProjection()
    expect(afterStationary.tick).toBe(60)
    expect(afterStationary.bandPawnPosition).toEqual({ x: 0, y: 0, z: 1.5 })
    expect(afterStationary.destination).toBeNull()
    expect(afterStationary.movementState).toBe('idle')
    expect(afterStationary.elapsedCampaignTime).toBe(0)
    expect(afterStationary.provisions).toBe(10.0)
    expect(afterStationary.consumptionRemainder).toBe(0)
  })

  it('navigates the Band pawn to the settlement boundary at 1× in exactly 1.5 world units and 0.5 Overworld day with step-wise Provisions consumption', () => {
    const simulation = createSimulation()

    // Submit destination command for tick 1 towards settlement boundary at (0, 0, 0).
    const command: SetDestinationCommand = {
      kind: 'set-destination',
      targetTick: 1,
      destination: { x: 0, y: 0, z: 0 },
    }
    simulation.submitCommand(command)

    // Tick 1: command is processed, travel begins.
    simulation.advanceTick()
    const tick1 = simulation.readProjection()
    expect(tick1.tick).toBe(1)
    expect(tick1.destination).toEqual({ x: 0, y: 0, z: 0 })
    expect(tick1.movementState).toBe('travel')

    // At normal travel speed (3.0 world units per day, 7200 ticks per day):
    // Speed per tick = 3.0 / 7200 = 1 / 2400 world units per tick.
    // To travel 1.5 world units: 1.5 * 2400 = 3600 ticks.

    // Mid-point check at tick 1800 (0.25 Overworld day = 0.75 world units moved):
    for (let t = 2; t <= 1800; t += 1) {
      simulation.advanceTick()
    }

    const tick1800 = simulation.readProjection()
    expect(tick1800.tick).toBe(1800)
    expect(tick1800.bandPawnPosition.x).toBeCloseTo(0, 5)
    expect(tick1800.bandPawnPosition.y).toBeCloseTo(0, 5)
    expect(tick1800.bandPawnPosition.z).toBeCloseTo(0.75, 5)
    expect(tick1800.destination).toEqual({ x: 0, y: 0, z: 0 })
    expect(tick1800.movementState).toBe('travel')
    expect(tick1800.elapsedCampaignTime).toBe(0.25)
    // 2 members * 0.25 day = 0.5 member-day -> consumes 0.1 Provisions, remainder resets to 0.
    expect(tick1800.provisions).toBe(9.9)
    expect(tick1800.consumptionRemainder).toBe(0)

    // Destination arrival at tick 3600 (0.5 Overworld day = 1.5 world units moved):
    for (let t = 1801; t <= 3600; t += 1) {
      simulation.advanceTick()
    }

    const tick3600 = simulation.readProjection()
    expect(tick3600.tick).toBe(3600)
    // Exact position at settlement entry without overshoot (REQ-017, REQ-018):
    expect(tick3600.bandPawnPosition).toEqual({ x: 0, y: 0, z: 0 })
    expect(tick3600.destination).toBeNull()
    expect(tick3600.movementState).toBe('idle')
    expect(tick3600.elapsedCampaignTime).toBe(0.5)
    // 2 members * 0.5 day = 1.0 member-day total -> consumes another 0.1 Provisions -> 9.8 total.
    expect(tick3600.provisions).toBe(9.8)
    expect(tick3600.consumptionRemainder).toBe(0)

    // Stationary ticks after arrival: state remains unchanged.
    for (let t = 3601; t <= 3700; t += 1) {
      simulation.advanceTick()
    }

    const tick3700 = simulation.readProjection()
    expect(tick3700.tick).toBe(3700)
    expect(tick3700.bandPawnPosition).toEqual({ x: 0, y: 0, z: 0 })
    expect(tick3700.destination).toBeNull()
    expect(tick3700.movementState).toBe('idle')
    expect(tick3700.elapsedCampaignTime).toBe(0.5)
    expect(tick3700.provisions).toBe(9.8)
    expect(tick3700.consumptionRemainder).toBe(0)
  })

  it('produces identical projections and feedback events when replaying the same transcript across two fresh Simulations', () => {
    const first = createSimulation()
    const second = createSimulation()

    const destinationCommand: SetDestinationCommand = {
      kind: 'set-destination',
      targetTick: 1,
      destination: { x: 0, y: 0, z: 0 },
    }
    const pauseCommand: TogglePauseCommand = {
      kind: 'toggle-pause',
      targetTick: 500,
    }
    const resumeCommand: TogglePauseCommand = {
      kind: 'toggle-pause',
      targetTick: 700,
    }

    first.submitCommand(destinationCommand)
    first.submitCommand(pauseCommand)
    first.submitCommand(resumeCommand)

    second.submitCommand(destinationCommand)
    second.submitCommand(pauseCommand)
    second.submitCommand(resumeCommand)

    // Run both simulations tick by tick for 4000 ticks and assert equality at sampled ticks.
    for (let tick = 1; tick <= 4000; tick += 1) {
      first.advanceTick()
      second.advanceTick()

      if (tick % 200 === 0 || tick === 1 || tick === 500 || tick === 700 || tick === 3800) {
        const p1 = first.readProjection()
        const p2 = second.readProjection()
        expect(p1).toEqual(p2)
        expect(first.drainFeedbackEvents()).toEqual(second.drainFeedbackEvents())
      }
    }

    const final1 = first.readProjection()
    const final2 = second.readProjection()
    expect(final1).toEqual(final2)
    expect(final1.bandPawnPosition).toEqual({ x: 0, y: 0, z: 0 })
    expect(final1.elapsedCampaignTime).toBe(0.5)
    expect(final1.provisions).toBe(9.8)
  })

  it('preserves byte-equal state during a pause interval and completes travel after resume', () => {
    const simulation = createSimulation()

    simulation.submitCommand({
      kind: 'set-destination',
      targetTick: 1,
      destination: { x: 0, y: 0, z: 0 },
    })

    // Advance 500 moving ticks.
    for (let t = 1; t <= 500; t += 1) {
      simulation.advanceTick()
    }

    const beforePause = simulation.readProjection()
    expect(beforePause.movementState).toBe('travel')
    expect(beforePause.paused).toBe(false)
    const positionAtPause = beforePause.bandPawnPosition
    const timeAtPause = beforePause.elapsedCampaignTime
    const provisionsAtPause = beforePause.provisions
    const remainderAtPause = beforePause.consumptionRemainder

    // Pause at tick 501.
    simulation.submitCommand({ kind: 'pause', targetTick: 501 })
    simulation.advanceTick()

    const atPauseTick = simulation.readProjection()
    expect(atPauseTick.paused).toBe(true)
    expect(atPauseTick.movementState).toBe('idle')
    expect(atPauseTick.destination).toEqual({ x: 0, y: 0, z: 0 })
    expect(atPauseTick.bandPawnPosition).toEqual(positionAtPause)
    expect(atPauseTick.elapsedCampaignTime).toBe(timeAtPause)
    expect(atPauseTick.provisions).toBe(provisionsAtPause)
    expect(atPauseTick.consumptionRemainder).toBe(remainderAtPause)

    // Advance 200 paused ticks: position, time, Provisions, and remainder remain byte-equal.
    for (let t = 502; t <= 700; t += 1) {
      simulation.advanceTick()
      const sample = simulation.readProjection()
      expect(sample.paused).toBe(true)
      expect(sample.movementState).toBe('idle')
      expect(sample.bandPawnPosition).toEqual(positionAtPause)
      expect(sample.elapsedCampaignTime).toBe(timeAtPause)
      expect(sample.provisions).toBe(provisionsAtPause)
      expect(sample.consumptionRemainder).toBe(remainderAtPause)
    }

    // Resume at tick 701.
    simulation.submitCommand({ kind: 'resume', targetTick: 701 })
    simulation.advanceTick()

    const afterResume = simulation.readProjection()
    expect(afterResume.paused).toBe(false)
    expect(afterResume.movementState).toBe('travel')

    // Remaining moving ticks: 3600 - 500 = 3100 moving ticks.
    // 701 + 3099 = 3800 ticks total.
    for (let t = 702; t <= 3800; t += 1) {
      simulation.advanceTick()
    }

    const arrival = simulation.readProjection()
    expect(arrival.tick).toBe(3800)
    expect(arrival.bandPawnPosition).toEqual({ x: 0, y: 0, z: 0 })
    expect(arrival.destination).toBeNull()
    expect(arrival.movementState).toBe('idle')
    expect(arrival.elapsedCampaignTime).toBe(0.5)
    expect(arrival.provisions).toBe(9.8)
    expect(arrival.consumptionRemainder).toBe(0)
  })

  it('rejects a destination outside traversable ground, emits typed feedback, and changes no authoritative field', () => {
    const simulation = createSimulation()

    const beforeCommand = simulation.readProjection()

    // Submit target outside authored traversable ground bounds (minX: -4, maxX: 4, minZ: -2, maxZ: 4).
    simulation.submitCommand({
      kind: 'set-destination',
      targetTick: 1,
      destination: { x: 10.0, y: 0, z: 20.0 },
    })

    simulation.advanceTick()

    const afterTick = simulation.readProjection()
    // Authoritative state remains completely unchanged except the tick advance.
    expect(afterTick.tick).toBe(1)
    expect(afterTick.bandPawnPosition).toEqual(beforeCommand.bandPawnPosition)
    expect(afterTick.destination).toBeNull()
    expect(afterTick.movementState).toBe('idle')
    expect(afterTick.paused).toBe(false)
    expect(afterTick.elapsedCampaignTime).toBe(0)
    expect(afterTick.provisions).toBe(10.0)
    expect(afterTick.consumptionRemainder).toBe(0)

    // Emits typed invalid action feedback event (REQ-039).
    const events = simulation.drainFeedbackEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      kind: 'invalid-action',
      tick: 1,
      action: 'set-destination',
      reason: 'out-of-bounds',
      message: 'Target position is outside traversable ground.',
    })

    // Draining feedback clears the event queue.
    expect(simulation.drainFeedbackEvents()).toHaveLength(0)
  })

  it('rejects a destination with non-finite coordinates and changes no authoritative field', () => {
    const simulation = createSimulation()

    simulation.submitCommand({
      kind: 'set-destination',
      targetTick: 1,
      destination: { x: Number.NaN, y: 0, z: 0 },
    })

    const projection = simulation.readProjection()
    expect(projection.destination).toBeNull()
    expect(projection.movementState).toBe('idle')

    const events = simulation.drainFeedbackEvents()
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('invalid-action')
    expect(events[0].reason).toBe('invalid-target')
  })

  it('rejects malformed set-paused command without boolean paused and preserves boolean invariant', () => {
    const simulation = createSimulation()

    // Submit malformed set-paused without paused field.
    simulation.submitCommand({
      kind: 'set-paused',
      targetTick: 1,
    } as unknown as SimulationCommand)

    const events = simulation.drainFeedbackEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      kind: 'invalid-action',
      tick: 0,
      action: 'set-paused',
      reason: 'invalid-command',
      message: 'set-paused command requires a boolean paused field.',
    })

    // Advance tick: projection.paused must remain strictly boolean false.
    simulation.advanceTick()
    const projection = simulation.readProjection()
    expect(projection.paused).toBe(false)
    expect(typeof projection.paused).toBe('boolean')
  })

  it('rejects malformed set-paused command with string paused and preserves boolean invariant', () => {
    const simulation = createSimulation()

    // Submit malformed set-paused with string paused field.
    simulation.submitCommand({
      kind: 'set-paused',
      targetTick: 1,
      paused: 'yes',
    } as unknown as SimulationCommand)

    const events = simulation.drainFeedbackEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      kind: 'invalid-action',
      tick: 0,
      action: 'set-paused',
      reason: 'invalid-command',
      message: 'set-paused command requires a boolean paused field.',
    })

    simulation.advanceTick()
    const projection = simulation.readProjection()
    expect(projection.paused).toBe(false)
    expect(typeof projection.paused).toBe('boolean')
  })

  it('rejects malformed command lacking object structure or integer targetTick', () => {
    const simulation = createSimulation()

    simulation.submitCommand(null as unknown as SimulationCommand)
    simulation.submitCommand('not-a-command' as unknown as SimulationCommand)
    simulation.submitCommand({ kind: 'toggle-pause', targetTick: 1.5 } as unknown as SimulationCommand)

    const events = simulation.drainFeedbackEvents()
    expect(events).toHaveLength(3)
    for (const event of events) {
      expect(event.kind).toBe('invalid-action')
      expect(event.reason).toBe('invalid-command')
    }
  })

  it('rejects unknown command kind and preserves authoritative state', () => {
    const simulation = createSimulation()

    simulation.submitCommand({
      kind: 'unknown-action',
      targetTick: 1,
    } as unknown as SimulationCommand)

    const events = simulation.drainFeedbackEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      kind: 'invalid-action',
      tick: 0,
      action: 'unknown',
      reason: 'unknown-command',
      message: 'Unrecognized simulation command kind.',
    })
  })

  it('isolates queued commands from caller object mutation after submission', () => {
    const simulation = createSimulation()

    const mutableDest = { x: 0, y: 0, z: 0 }
    const mutableCommand = {
      kind: 'set-destination' as const,
      targetTick: 2,
      destination: mutableDest,
    }

    simulation.submitCommand(mutableCommand)

    // Mutate caller objects after submission.
    mutableDest.x = 100
    mutableCommand.targetTick = 999

    // Advance to tick 1: command is not due yet.
    simulation.advanceTick()
    expect(simulation.readProjection().destination).toBeNull()

    // Advance to tick 2: command executes with original (0, 0, 0) target and original targetTick 2.
    simulation.advanceTick()
    expect(simulation.readProjection().tick).toBe(2)
    expect(simulation.readProjection().destination).toEqual({ x: 0, y: 0, z: 0 })
    expect(simulation.readProjection().movementState).toBe('travel')
  })
  it('rejects targetTick 0 at initial tick 0 and emits typed feedback immediately', () => {
    const simulation = createSimulation()
    expect(simulation.readProjection().tick).toBe(0)

    // Submit command targeting tick 0 (current initial tick).
    simulation.submitCommand({
      kind: 'set-destination',
      targetTick: 0,
      destination: { x: 0, y: 0, z: 0 },
    })

    const events = simulation.drainFeedbackEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      kind: 'invalid-action',
      tick: 0,
      action: 'set-destination',
      reason: 'past-target-tick',
      message: 'Command target tick 0 must be greater than current tick 0.',
    })

    // Authoritative destination remains null.
    expect(simulation.readProjection().destination).toBeNull()
  })

  it('rejects a command targeting the current tick and emits typed feedback immediately', () => {
    const simulation = createSimulation()

    simulation.advanceTick()
    expect(simulation.readProjection().tick).toBe(1)

    // Submit command targeting tick 1 (current tick).
    simulation.submitCommand({
      kind: 'set-destination',
      targetTick: 1,
      destination: { x: 0, y: 0, z: 0 },
    })

    const events = simulation.drainFeedbackEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      kind: 'invalid-action',
      tick: 1,
      action: 'set-destination',
      reason: 'past-target-tick',
      message: 'Command target tick 1 must be greater than current tick 1.',
    })
  })

  it('rejects a past-target-tick command and emits typed feedback immediately', () => {
    const simulation = createSimulation()

    simulation.advanceTick()
    simulation.advanceTick()
    expect(simulation.readProjection().tick).toBe(2)

    // Submit command targeting tick 1 (in the past).
    simulation.submitCommand({
      kind: 'set-destination',
      targetTick: 1,
      destination: { x: 0, y: 0, z: 0 },
    })

    const events = simulation.drainFeedbackEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      kind: 'invalid-action',
      tick: 2,
      action: 'set-destination',
      reason: 'past-target-tick',
      message: 'Command target tick 1 must be greater than current tick 2.',
    })
  })

  it('executes a target-tick command exactly on the target tick without delay', () => {
    const simulation = createSimulation()
    expect(simulation.readProjection().tick).toBe(0)

    // Submit command targeting tick 3.
    simulation.submitCommand({
      kind: 'set-destination',
      targetTick: 3,
      destination: { x: 0, y: 0, z: 0 },
    })

    // Advance to tick 1: command is not due yet.
    simulation.advanceTick()
    expect(simulation.readProjection().tick).toBe(1)
    expect(simulation.readProjection().destination).toBeNull()
    expect(simulation.readProjection().movementState).toBe('idle')

    // Advance to tick 2: command is not due yet.
    simulation.advanceTick()
    expect(simulation.readProjection().tick).toBe(2)
    expect(simulation.readProjection().destination).toBeNull()
    expect(simulation.readProjection().movementState).toBe('idle')

    // Advance to tick 3: command executes exactly on target tick 3.
    simulation.advanceTick()
    expect(simulation.readProjection().tick).toBe(3)
    expect(simulation.readProjection().destination).toEqual({ x: 0, y: 0, z: 0 })
    expect(simulation.readProjection().movementState).toBe('travel')
  })

  it('allows replacing the Navigation Port without altering command or travel rules', () => {
    // Custom NavigationPort that records requests and returns direct steering.
    const customRequests: NavigationRequest[] = []
    const customPort: NavigationPort = {
      computeSteering(request: NavigationRequest): NavigationResult {
        customRequests.push(request)
        // Use default adapter for actual steering.
        return createAuthoredNavigationAdapter().computeSteering(request)
      },
    }

    const simulation = createSimulation({ navigationPort: customPort })

    simulation.submitCommand({
      kind: 'set-destination',
      targetTick: 1,
      destination: { x: 0, y: 0, z: 0 },
    })

    simulation.advanceTick()

    expect(customRequests).toHaveLength(1)
    expect(customRequests[0].target).toEqual({ x: 0, y: 0, z: 0 })
    expect(customRequests[0].state.position).toEqual({ x: 0, y: 0, z: 1.5 })

    // Finish 3600 ticks with custom port.
    for (let t = 2; t <= 3600; t += 1) {
      simulation.advanceTick()
    }

    const projection = simulation.readProjection()
    expect(projection.bandPawnPosition).toEqual({ x: 0, y: 0, z: 0 })
    expect(projection.elapsedCampaignTime).toBe(0.5)
    expect(projection.provisions).toBe(9.8)
    expect(customRequests).toHaveLength(3600)
  })

  it('allows adding a second authored destination without altering command or travel rules', () => {
    // Extended Overworld content with a second destination.
    const customOverworld: OverworldContent = Object.freeze({
      ...OVERWORLD,
      destinations: Object.freeze([
        ...OVERWORLD.destinations,
        Object.freeze({
          id: 'poc-outpost',
          name: 'Frontier Outpost',
          targetSceneId: 'poc-outpost',
          position: Object.freeze({ x: 1.5, y: 0, z: 1.5 }),
          entryBoundary: Object.freeze({
            position: Object.freeze({ x: 1.5, y: 0, z: 1.5 }),
            radius: 0.25,
          }),
        }),
      ]),
    })

    const simulation = createSimulation({ overworld: customOverworld })

    // Navigate to second destination (1.5, 0, 1.5). Distance from (0, 0, 1.5) is 1.5 world units.
    simulation.submitCommand({
      kind: 'set-destination',
      targetTick: 1,
      destination: { x: 1.5, y: 0, z: 1.5 },
    })

    for (let t = 1; t <= 3600; t += 1) {
      simulation.advanceTick()
    }

    const projection = simulation.readProjection()
    expect(projection.bandPawnPosition).toEqual({ x: 1.5, y: 0, z: 1.5 })
    expect(projection.destination).toBeNull()
    expect(projection.movementState).toBe('idle')
    expect(projection.elapsedCampaignTime).toBe(0.5)
    expect(projection.provisions).toBe(9.8)
  })

  it('rejects mutable fields and browser types in the public interface at compile time', () => {
    const simulation: Simulation = createSimulation()

    // The assertions below are compile-time only: TypeScript must report an
    // error on each annotated line. A passing core typecheck therefore proves
    // that the public interface still rejects mutation and stays free of
    // browser-owned types. The wrapper never runs.
    const assertPurity = (): void => {
      const projection = simulation.readProjection()

      // @ts-expect-error the projection rejects mutation of its tick field
      projection.tick = 1
      // @ts-expect-error the projection rejects mutation of its band field
      projection.band = []
      // @ts-expect-error the projection rejects mutation of its coin field
      projection.coin = 0
      // @ts-expect-error the projection rejects mutation of its provisions field
      projection.provisions = 0
      // @ts-expect-error the projection rejects mutation of its scene field
      projection.scene = 'other'
      // @ts-expect-error the projection rejects mutation of its bandPawnPosition field
      projection.bandPawnPosition = { x: 0, y: 0, z: 0 }
      // @ts-expect-error the projection rejects mutation of its destination field
      projection.destination = null
      // @ts-expect-error the projection rejects mutation of its movementState field
      projection.movementState = 'idle'
      // @ts-expect-error the projection rejects mutation of its paused field
      projection.paused = false
      // @ts-expect-error the projection rejects mutation of its elapsedCampaignTime field
      projection.elapsedCampaignTime = 0
      // @ts-expect-error the projection rejects mutation of its consumptionRemainder field
      projection.consumptionRemainder = 0

      type BrowserNode = { readonly ownerDocument: unknown }
      // The directive comment below suppresses the excess-property error that
      // the object literal reports on the `ownerDocument` line itself.
      const projectionWithBrowserField: SimulationProjection = {
        tick: 0,
        agents: [],
        band: [],
        coin: 0,
        provisions: 0,
        scene: 'poc-overworld',
        bandPawnPosition: { x: 0, y: 0, z: 0 },
        destination: null,
        movementState: 'idle',
        paused: false,
        elapsedCampaignTime: 0,
        consumptionRemainder: 0,
        // @ts-expect-error a browser-owned type must not appear in the public projection
        ownerDocument: null as unknown as BrowserNode,
      }
      void projectionWithBrowserField
    }
    void assertPurity
  })
})
