export const AGENT_CAPABILITY_MODULES = Object.freeze([
  Object.freeze({
    id: 'web-research',
    slot: 'head',
    name: 'Web Research',
    description: 'Adds sourced web search. It does not control a browser or click pages.',
    capabilityId: 'browser.read',
    mode: 'autonomous',
    risk: 'read',
    toolNames: Object.freeze(['web_search']),
  }),
  Object.freeze({
    id: 'project-reader',
    slot: 'mainHand',
    name: 'Project Reader',
    description: 'Reads only the project already authorized for this agent in this workspace.',
    capabilityId: 'files.read',
    mode: 'autonomous',
    risk: 'read',
    toolNames: Object.freeze(['project_read', 'project_list', 'project_file_outline', 'read_brief']),
  }),
  Object.freeze({
    id: 'github-reader',
    slot: 'mainHand',
    name: 'GitHub Reader',
    description: 'Reads files, issues, pull-request status, and comments from an authorized repository.',
    capabilityId: 'github.read',
    mode: 'autonomous',
    risk: 'read',
    toolNames: Object.freeze([
      'github_read_file', 'github_list_issues', 'pr_status', 'pr_comments',
      'jules_status', 'jules_list', 'local_git_status',
    ]),
  }),
  Object.freeze({
    id: 'project-writer',
    slot: 'mainHand',
    name: 'Project Writer',
    description: 'Proposes project file writes and exact-string edits. Every call waits for owner/admin approval.',
    capabilityId: 'files.write.approved',
    mode: 'execute_with_approval',
    risk: 'write',
    toolNames: Object.freeze(['project_write', 'project_edit']),
  }),
  Object.freeze({
    id: 'workspace-reader',
    slot: 'offHand',
    name: 'Workspace Reader',
    description: 'Reads connected calendar and spreadsheet data. It cannot add or change entries.',
    capabilityId: 'calendar.read',
    mode: 'autonomous',
    risk: 'read',
    toolNames: Object.freeze(['read_calendar', 'sheets_read_range']),
  }),
  Object.freeze({
    id: 'memory-reader',
    slot: 'trinket',
    name: 'Memory Reader',
    description: 'Adds private journal search, knowledge, and association reads beyond built-in recall and inbox.',
    capabilityId: 'memory.read',
    mode: 'autonomous',
    risk: 'read',
    toolNames: Object.freeze([
      'read_journal', 'read_journal_search', 'query_knowledge', 'read_associations',
    ]),
  }),
  Object.freeze({
    id: 'canvas-observer',
    slot: 'trinket',
    name: 'Canvas Observer',
    description: 'Lists visible document and code editor windows in the current shared canvas. It cannot change them.',
    capabilityId: 'canvas.read',
    mode: 'autonomous',
    risk: 'read',
    toolNames: Object.freeze(['canvas_list_writable_windows']),
  }),
  Object.freeze({
    id: 'canvas-collaborator',
    slot: 'offHand',
    name: 'Canvas Collaborator',
    description: 'Appends bounded text to one shared canvas window after owner/admin approval. It cannot replace or delete content.',
    capabilityId: 'canvas.collaborate',
    mode: 'execute_with_approval',
    risk: 'write',
    toolNames: Object.freeze(['canvas_append_window']),
  }),
  Object.freeze({
    id: 'canvas-projector',
    slot: 'offHand',
    name: 'Canvas Projector',
    description: 'Projects visual code (HTML, Three.js, React, CSS, Tailwind) onto the shared canvas in a preview window, so results are seen without opening files. Every call waits for owner/admin approval.',
    capabilityId: 'canvas.project',
    mode: 'execute_with_approval',
    risk: 'write',
    toolNames: Object.freeze(['project_preview']),
  }),
]);

export const AGENT_CAPABILITY_MODULE_BY_ID = Object.freeze(Object.fromEntries(
  AGENT_CAPABILITY_MODULES.map(module => [module.id, module]),
));

export const AGENT_CAPABILITY_MODULE_BY_CAPABILITY = Object.freeze(Object.fromEntries(
  AGENT_CAPABILITY_MODULES.map(module => [module.capabilityId, module]),
));

export function getAgentCapabilityModule(moduleId) {
  return AGENT_CAPABILITY_MODULE_BY_ID[String(moduleId || '').trim()] || null;
}

export function toolHasApprovalModule(toolName) {
  const name = String(toolName || '').trim();
  return AGENT_CAPABILITY_MODULES.some(module => (
    module.mode === 'execute_with_approval' && module.toolNames.includes(name)
  ));
}
