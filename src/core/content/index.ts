/**
 * The core-owned Typed Content Catalog module (ARCH-016).
 *
 * This entry is the public surface of the module: the deeply frozen authored
 * Agent content and the types of that content. The catalog contains no
 * mutable campaign state and no runtime-generated content.
 */
export { INITIAL_AGENTS } from './catalog'
export type { AgentRole, AgentFate, Disposition, Grievance, AgentContent } from './interface'
