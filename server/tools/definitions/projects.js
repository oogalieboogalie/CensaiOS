import { gitTools } from './git.js';
import { localTools } from './local.js';
import { subagentTools } from './subagents.js';
import { julesTools } from './jules.js';
import { coreProjectTools } from './projects-core.js';

export const projectTools = [
  ...gitTools,
  ...localTools,
  ...subagentTools,
  ...julesTools,
  ...coreProjectTools,
];
