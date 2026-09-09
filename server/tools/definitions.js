import { memoryTools } from './definitions/memory.js';
import { deepMemoryTools } from './definitions/deepMemory.js';
import { projectTools } from './definitions/projects.js';
import { systemTools } from './definitions/system.js';
import { dispatchTools } from './definitions/dispatch.js';
import { mailcowTools } from './definitions/mailcow.js';
import { vexTools } from './definitions/vex.js';
import { depTools } from './definitions/deps.js';
import { discoveryTools } from './definitions/discovery.js';
import { reliabilityTools } from './definitions/reliability.js';
import { canvasCollaborationTools } from './definitions/canvas.js';
import { researchTools } from './definitions/research.js';

export * from './rbac/index.js';
export * from './catalog.js';

// ═══════════════════════════════════════════════════════════════════
//  TOOL DEFINITIONS (OpenAI-compatible function calling format)
//  These get sent with every chat request so the model knows
//  exactly what it can call and how.
// ═══════════════════════════════════════════════════════════════════

export const TOOL_DEFINITIONS = [
  ...discoveryTools,
  ...memoryTools,
  ...deepMemoryTools,
  ...projectTools,
  ...systemTools,
  ...dispatchTools,
  ...mailcowTools,
  ...vexTools,
  ...depTools,
  ...reliabilityTools,
  ...canvasCollaborationTools,
  ...researchTools,
];
