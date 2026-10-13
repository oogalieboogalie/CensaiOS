// Model options live in src/lib/agentModelOptions.js (idea 2026-09-04).
// Re-exported here so existing designer imports keep working.
export { MODEL_OPTIONS, defaultModelForProvider } from '../../../lib/agentModelOptions.js';

export const DEFAULT_TOOLS = ['web_search', 'project_list', 'project_file_outline', 'project_read', 'read_brief', 'report'];

export function slugify(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function uniqueAgentId(name, type, agents) {
  const taken = new Set(agents.map(agent => agent.id));
  const base = slugify(name) || `${type}-agent`;
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

