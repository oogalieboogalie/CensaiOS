import * as agents from './api/agents.js';
import * as workspace from './api/workspace.js';
import * as files from './api/files.js';
import * as projects from './api/projects.js';
import * as memory from './api/memory.js';
import * as system from './api/system.js';
import * as providers from './api/providers.js';
import * as schedules from './api/schedules.js';
import * as integrations from './api/integrations.js';
import * as operationalIntelligence from './api/operationalIntelligence.js';
import * as capabilities from './api/capabilities.js';
import * as attributes from './api/attributes.js';
import * as mindsets from './api/mindsets.js';
import * as familyEquipment from './api/familyEquipment.js';
import * as keys from './api/keys.js';
import * as agentActivity from './api/agentActivity.js';
import * as projectMemberships from './api/projectMemberships.js';
import * as approvals from './api/approvals.js';
import * as workspaceMembers from './api/workspaceMembers.js';
import * as agentIcons from './api/agentIcons.js';

export const api = {
  ...agents,
  ...workspace,
  ...files,
  ...projects,
  ...memory,
  ...system,
  ...providers,
  ...schedules,
  ...integrations,
  ...operationalIntelligence,
  ...capabilities,
  ...attributes,
  ...mindsets,
  ...familyEquipment,
  ...keys,
  ...agentActivity,
  ...projectMemberships,
  ...approvals,
  ...workspaceMembers,
  ...agentIcons,
};
