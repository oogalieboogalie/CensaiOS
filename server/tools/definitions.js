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
import { realEstateTools } from './definitions/realEstate.js';
import { researchTools } from './definitions/research.js';
import { agentNetworkTools } from './definitions/agentNetwork.js';
import { weewooTools } from './definitions/weewoo.js';
import { speakUpTools } from './definitions/speakUp.js';
import { wakeUpTools } from './definitions/wakeUps.js';
import { moduleTools } from './definitions/modules.js';
import { videoTools } from './definitions/video.js';
import { pdfTools } from './definitions/pdf.js';
import { cadTools } from './definitions/cad.js';
import { scoutTools } from './definitions/scout.js';
import { skillSetTools } from './definitions/skillSets.js';
import { blueprintTools } from './definitions/blueprints.js';
import { appLogTools } from './definitions/appLog.js';

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
  ...realEstateTools,
  ...researchTools,
  ...agentNetworkTools,
  ...weewooTools,
  ...speakUpTools,
  ...wakeUpTools,
  ...moduleTools,
  ...videoTools,
  ...pdfTools,
  ...cadTools,
  ...scoutTools,
  ...skillSetTools,
  ...blueprintTools,
  ...appLogTools,
];
