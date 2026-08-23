import {
  INITIAL_AGENTS,
  INITIAL_BAND,
  INITIAL_COIN,
  INITIAL_PROVISIONS,
  OVERWORLD,
} from '../content'
import type { AgentContent, BandMemberContent, WorldPosition } from '../content'
import {
  ARRIVAL_DISTANCE_THRESHOLD,
  calculateSpeedPerTick,
  createAuthoredNavigationAdapter,
  distanceBetween,
  isInvalidNavigationResult,
  isPositionInTraversableGround,
  isSteeringIntent,
} from '../navigation'
import type {
  AgentRecord,
  BandMemberRecord,
  InvalidActionFeedbackEvent,
  MovementState,
  Simulation,
  SimulationCommand,
  SimulationFeedbackEvent,
  SimulationOptions,
  SimulationProjection,
} from './interface'

/** The Simulation starts at tick 0. */
const INITIAL_TICK = 0

/**
 * Copy one authored Agent content record into a fresh Agent record.
 *
 * Every new Simulation copies the catalog content into its own private
 * state so no record or Grievance list reference is shared with the catalog
 * or with any other Simulation (ARCH-003, ARCH-016). Only the private state
 * is mutable; callers receive only deep-immutable projection data
 * (ARCH-002, REQ-167).
 */
function copyAgentContent(agent: AgentContent): AgentRecord {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    fate: agent.fate,
    disposition: agent.disposition,
    grievances: [...agent.grievances],
  }
}

/**
 * Copy one authored Band-member content record into a fresh Band-member
 * record.
 *
 * Every new Simulation copies the authored identity into its own private
 * state so no record reference is shared with the catalog or with any other
 * Simulation (ARCH-003, ARCH-016). The authored join cost is not projected:
 * only the identity is campaign state that callers read (ARCH-002, REQ-077).
 */
function copyBandMemberContent(member: BandMemberContent): BandMemberRecord {
  return {
    id: member.id,
    name: member.name,
  }
}

/**
 * Create the authoritative Simulation (ARCH-001).
 *
 * The Simulation tick, the Agent relationship state, the Band membership,
 * initial resources, current Scene, Band-pawn position, destination, movement
 * state, pause state, elapsed campaign time, Provisions, and the consumption
 * remainder are privately owned by the closure created here (ARCH-003).
 *
 * A new campaign starts with exactly the two named Agents from the Typed
 * Content Catalog — Village Elder (`poc-contract-giver`) and Varek
 * (`poc-enemy-agent`) — copied into private state (REQ-167, PVS-REL-001);
 * no relationship record exists for Miro, a generic settlement resident, or
 * any other character. The Band starts with the player character and Miro
 * (`poc-companion`) as the one fixed Companion (REQ-077, PVS-PRP-001); Coin
 * starts at 100 and Provisions at 10.0. Miro's fixed 0-Coin cost means no
 * Coin deduction is applied when Miro joins the new campaign.
 *
 * A new campaign starts on the Overworld (`poc-overworld`) outside the
 * settlement boundary at the authored start position (0, 0, 1.5), with
 * elapsed campaign time 0 and consumption remainder 0 (REQ-017, PVS-FLW-001).
 *
 * `advanceTick` is the only external way to advance the private Simulation
 * tick (ARCH-002, REQ-113): each call moves the private tick forward by
 * exactly one fixed 60 Hz tick (ARCH-005). Callers receive only a deeply
 * frozen readonly projection, never mutable state (ARCH-003).
 */
export function createSimulation(options?: SimulationOptions): Simulation {
  const overworld = options?.overworld ?? OVERWORLD
  const navigationPort = options?.navigationPort ?? createAuthoredNavigationAdapter()

  let tick = INITIAL_TICK
  // Private authoritative state (ARCH-003): each new Simulation owns a copy
  // of the authored Agent content, never a reference into the catalog.
  const agents: AgentRecord[] = INITIAL_AGENTS.map(copyAgentContent)
  // Private Band membership: each new Simulation owns a copy of the
  // authored identities, never a reference into the catalog.
  const band: BandMemberRecord[] = INITIAL_BAND.map(copyBandMemberContent)
  // Private initial resources (REQ-077): Coin starts at the initial 100
  // minus the total fixed join cost of the initial Band members. Both the
  // player character and Miro cost 0 Coin, so no Coin deduction is applied
  // when Miro joins the new campaign (PVS-PRP-001).
  const coin = INITIAL_COIN - INITIAL_BAND.reduce((total, member) => total + member.costCoin, 0)
  let provisions = INITIAL_PROVISIONS

  // Authoritative Overworld travel state (ARCH-003, REQ-017, REQ-018).
  const scene = overworld.id
  let bandPawnPosition: WorldPosition = {
    x: overworld.startPosition.x,
    y: overworld.startPosition.y,
    z: overworld.startPosition.z,
  }
  let destination: WorldPosition | null = null
  let movementState: MovementState = 'idle'
  let paused = false
  let elapsedCampaignTime = 0
  let consumptionRemainder = 0

  let queuedCommands: SimulationCommand[] = []
  const feedbackEvents: SimulationFeedbackEvent[] = []

  function emitInvalidAction(action: string, reason: string, message: string): void {
    const event: InvalidActionFeedbackEvent = Object.freeze({
      kind: 'invalid-action',
      tick,
      action,
      reason,
      message,
    })
    feedbackEvents.push(event)
  }

  return {
    readProjection(): SimulationProjection {
      return Object.freeze({
        tick,
        agents: Object.freeze(
          agents.map((agent) =>
            Object.freeze({
              ...agent,
              grievances: Object.freeze([...agent.grievances]),
            }),
          ),
        ),
        band: Object.freeze(
          band.map((member) => Object.freeze({ ...member })),
        ),
        coin,
        provisions,
        scene,
        bandPawnPosition: Object.freeze({
          x: Math.round(bandPawnPosition.x * 1e12) / 1e12,
          y: Math.round(bandPawnPosition.y * 1e12) / 1e12,
          z: Math.round(bandPawnPosition.z * 1e12) / 1e12,
        }),
        destination:
          destination !== null
            ? Object.freeze({
                x: Math.round(destination.x * 1e12) / 1e12,
                y: Math.round(destination.y * 1e12) / 1e12,
                z: Math.round(destination.z * 1e12) / 1e12,
              })
            : null,
        movementState,
        paused,
        elapsedCampaignTime: Math.round(elapsedCampaignTime * 1e12) / 1e12,
        consumptionRemainder: Math.round(consumptionRemainder * 1e12) / 1e12,
      })
    },

    submitCommand(command: SimulationCommand): void {
      if (
        command === null ||
        typeof command !== 'object' ||
        typeof (command as SimulationCommand).kind !== 'string' ||
        typeof (command as SimulationCommand).targetTick !== 'number' ||
        !Number.isInteger((command as SimulationCommand).targetTick)
      ) {
        emitInvalidAction('unknown', 'invalid-command', 'Command must be an object with kind and an integer targetTick.')
        return
      }

      if (command.targetTick <= tick) {
        emitInvalidAction(
          command.kind,
          'past-target-tick',
          `Command target tick ${command.targetTick} must be greater than current tick ${tick}.`,
        )
        return
      }

      switch (command.kind) {
        case 'set-destination': {
          const dest = command.destination
          if (
            dest === null ||
            typeof dest !== 'object' ||
            !Number.isFinite(dest.x) ||
            !Number.isFinite(dest.y) ||
            !Number.isFinite(dest.z)
          ) {
            emitInvalidAction('set-destination', 'invalid-target', 'Target position contains non-finite coordinates.')
            return
          }
          queuedCommands.push(
            Object.freeze({
              kind: 'set-destination',
              targetTick: command.targetTick,
              destination: Object.freeze({ x: dest.x, y: dest.y, z: dest.z }),
            }),
          )
          break
        }
        case 'set-paused': {
          if (typeof command.paused !== 'boolean') {
            emitInvalidAction('set-paused', 'invalid-command', 'set-paused command requires a boolean paused field.')
            return
          }
          queuedCommands.push(
            Object.freeze({
              kind: 'set-paused',
              targetTick: command.targetTick,
              paused: command.paused,
            }),
          )
          break
        }
        case 'toggle-pause': {
          queuedCommands.push(
            Object.freeze({
              kind: 'toggle-pause',
              targetTick: command.targetTick,
            }),
          )
          break
        }
        case 'pause': {
          queuedCommands.push(
            Object.freeze({
              kind: 'pause',
              targetTick: command.targetTick,
            }),
          )
          break
        }
        case 'resume': {
          queuedCommands.push(
            Object.freeze({
              kind: 'resume',
              targetTick: command.targetTick,
            }),
          )
          break
        }
        default: {
          emitInvalidAction('unknown', 'unknown-command', 'Unrecognized simulation command kind.')
          return
        }
      }
    },
    drainFeedbackEvents(): readonly SimulationFeedbackEvent[] {
      const drained = Object.freeze([...feedbackEvents])
      feedbackEvents.length = 0
      return drained
    },

    advanceTick(): void {
      tick += 1

      // 1. Process due commands for this target tick in FIFO order (ARCH-002, ARCH-005).
      const dueCommands: SimulationCommand[] = []
      const remainingCommands: SimulationCommand[] = []

      for (const cmd of queuedCommands) {
        if (cmd.targetTick <= tick) {
          dueCommands.push(cmd)
        } else {
          remainingCommands.push(cmd)
        }
      }
      queuedCommands = remainingCommands

      for (const cmd of dueCommands) {
        switch (cmd.kind) {
          case 'set-destination': {
            const dest = cmd.destination
            if (
              dest === null ||
              typeof dest !== 'object' ||
              !Number.isFinite(dest.x) ||
              !Number.isFinite(dest.y) ||
              !Number.isFinite(dest.z)
            ) {
              emitInvalidAction('set-destination', 'invalid-target', 'Target position contains non-finite coordinates.')
              break
            }

            if (!isPositionInTraversableGround(dest, overworld.traversableGround)) {
              emitInvalidAction('set-destination', 'out-of-bounds', 'Target position is outside traversable ground.')
              break
            }

            destination = { x: dest.x, y: dest.y, z: dest.z }
            movementState = paused ? 'idle' : 'travel'
            break
          }
          case 'toggle-pause': {
            paused = !paused
            movementState = destination !== null && !paused ? 'travel' : 'idle'
            break
          }
          case 'set-paused': {
            if (typeof cmd.paused !== 'boolean') {
              emitInvalidAction('set-paused', 'invalid-command', 'set-paused command requires a boolean paused field.')
              break
            }
            paused = cmd.paused
            movementState = destination !== null && !paused ? 'travel' : 'idle'
            break
          }
          case 'pause': {
            paused = true
            movementState = 'idle'
            break
          }
          case 'resume': {
            paused = false
            movementState = destination !== null ? 'travel' : 'idle'
            break
          }
          default: {
            emitInvalidAction('unknown', 'unknown-command', 'Unrecognized simulation command kind.')
            break
          }
        }
      }

      // 2. Perform authoritative Overworld movement if travel is active (ARCH-003, REQ-018).
      if (!paused && destination !== null) {
        const speedPerTick = calculateSpeedPerTick(overworld.travel)
        const steeringResult = navigationPort.computeSteering({
          state: { position: bandPawnPosition },
          target: destination,
          traversability: {
            traversableGround: overworld.traversableGround,
            navigationAnchors: overworld.navigationAnchors,
            travel: overworld.travel,
          },
          tick,
          speedWorldUnitsPerTick: speedPerTick,
        })

        if (isInvalidNavigationResult(steeringResult)) {
          emitInvalidAction('navigate', steeringResult.reason, steeringResult.message)
          destination = null
          movementState = 'idle'
        } else if (isSteeringIntent(steeringResult)) {
          if (steeringResult.arrived) {
            bandPawnPosition = { x: destination.x, y: destination.y, z: destination.z }
            destination = null
            movementState = 'idle'
          } else {
            const step = steeringResult.step
            const stepDist = Math.hypot(step.x, step.y, step.z)
            const newX = bandPawnPosition.x + step.x
            const newY = bandPawnPosition.y + step.y
            const newZ = bandPawnPosition.z + step.z
            const remainingDist = distanceBetween({ x: newX, y: newY, z: newZ }, destination)

            if (remainingDist <= ARRIVAL_DISTANCE_THRESHOLD) {
              bandPawnPosition = { x: destination.x, y: destination.y, z: destination.z }
              destination = null
              movementState = 'idle'
            } else {
              bandPawnPosition = { x: newX, y: newY, z: newZ }
              movementState = 'travel'
            }

            // 3. Advance campaign time and Provisions consumption only for moving distance (REQ-018, REQ-082, REQ-083).
            if (stepDist > 0) {
              const speedPerDay = overworld.travel.speedWorldUnitsPerDay
              const daysMoved = stepDist / speedPerDay
              elapsedCampaignTime += daysMoved

              const memberCount = band.length
              const memberDays = memberCount * daysMoved
              consumptionRemainder += memberDays

              while (consumptionRemainder >= 0.5 - 1e-12) {
                consumptionRemainder = Math.max(0, consumptionRemainder - 0.5)
                provisions = Math.max(0, Math.round((provisions - 0.1) * 10) / 10)
              }

              if (Math.abs(consumptionRemainder) < 1e-12) {
                consumptionRemainder = 0
              }
            }
          }
        }
      }

      if (destination === null || paused) {
        movementState = 'idle'
      }
    },
  }
}
