import type { AgentContent } from './interface'

/**
 * The initial named-Agent relationship content of a new campaign
 * (ARCH-016, PVS-REL-001, REQ-167).
 *
 * The relationship model creates exactly these two persistent named Agents.
 * Miro and generic settlement residents do not enter this model. The
 * catalog is deeply frozen so the authored content stays immutable; each new
 * Simulation copies this content into its own private state instead of
 * sharing a record or list reference (ARCH-003).
 */
export const INITIAL_AGENTS: readonly AgentContent[] = Object.freeze([
  Object.freeze({
    id: 'poc-contract-giver',
    name: 'Village Elder',
    role: 'Contract-giver Agent',
    fate: 'Active',
    disposition: 'Neutral',
    grievances: Object.freeze([]),
  }),
  Object.freeze({
    id: 'poc-enemy-agent',
    name: 'Varek',
    role: 'Enemy Agent',
    fate: 'Active',
    disposition: 'Hostile',
    grievances: Object.freeze([]),
  }),
])
