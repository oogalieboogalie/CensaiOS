import { AGENT_CAPABILITY_MODULES } from '../../../src/data/agent-capability-modules.js';

// This mapping is derived from the reviewed module catalog. Write tools can
// appear only through a module whose runtime mode enforces durable approval.
export const CAPABILITY_TO_TOOLS = Object.freeze(Object.fromEntries(
  AGENT_CAPABILITY_MODULES.map(module => [module.capabilityId, [...module.toolNames]]),
));
