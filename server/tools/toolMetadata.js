const CATEGORY_METADATA = {
  'Local Files': { type: 'fileOps', kit: 'Coding Operations', tags: ['files', 'local', 'code'] },
  Project: { type: 'projectOps', kit: 'Coding Operations', tags: ['project', 'files', 'code'] },
  GitHub: { type: 'sourceControl', kit: 'Coding Operations', tags: ['git', 'github', 'code'] },
  'Local Git': { type: 'sourceControl', kit: 'Coding Operations', tags: ['git', 'local', 'code'] },
  Runtime: { type: 'runtimeOps', kit: 'Coding Operations', tags: ['tests', 'shell', 'runtime'] },
  Database: { type: 'dataOps', kit: 'Coding Operations', tags: ['database', 'postgres', 'schema'] },
  Ops: { type: 'serverOps', kit: 'Server Maintenance', tags: ['server', 'docker', 'container'] },
  Mail: { type: 'mailOps', kit: 'Server Maintenance', tags: ['mail', 'mailcow', 'server'] },
  Memory: { type: 'contextOps', kit: 'Agent Context', tags: ['memory', 'context', 'knowledge'] },
  Coordination: { type: 'agentOps', kit: 'Agent Coordination', tags: ['agents', 'messages', 'tasks'] },
  'External Agents': { type: 'agentOps', kit: 'Agent Coordination', tags: ['agents', 'delegation'] },
  Research: { type: 'researchOps', kit: 'Research', tags: ['search', 'web', 'research'] },
  'Google Workspace': { type: 'workspaceOps', kit: 'Workspace', tags: ['sheets', 'workspace'] },
  General: { type: 'general', kit: 'Core Tools', tags: ['general'] },
};

const TOOL_METADATA_OVERRIDES = {
  search_tools: {
    type: 'toolDiscovery',
    kit: 'Default Tools',
    tags: ['tools', 'search', 'discover', 'capabilities'],
  },
  get_tool: {
    type: 'toolDiscovery',
    kit: 'Default Tools',
    tags: ['tools', 'schema', 'details', 'capabilities'],
  },
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function metadataForTool(name, category, description = '') {
  const categoryMeta = CATEGORY_METADATA[category] || CATEGORY_METADATA.General;
  const override = TOOL_METADATA_OVERRIDES[name] || {};
  const nameTags = String(name || '').split('_');
  const descriptionTags = String(description || '')
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{3,}/g)
    ?.slice(0, 8) || [];

  return {
    type: override.type || categoryMeta.type,
    kit: override.kit || categoryMeta.kit,
    tags: unique([...(override.tags || []), ...categoryMeta.tags, ...nameTags, ...descriptionTags]),
  };
}
