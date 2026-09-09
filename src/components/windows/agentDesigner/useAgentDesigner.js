import React from 'react';
import { api } from '../../../lib/api.js';
import { getAgentById, updateAgent } from '../../../lib/agentStore.js';
import { DEFAULT_TOOLS, defaultModelForProvider, uniqueAgentId } from './modelConfig.js';
import { useWorkspaceStore } from '../../../lib/store.js';

export function useAgentDesigner(win, onCreateAgent, onUpdate, agents, groups) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const editingAgentId = win.agentId || win.editingAgentId || (typeof win.agent === 'string' ? win.agent : win.agent?.id);
  const editingAgent = editingAgentId ? getAgentById(editingAgentId) : null;
  const isEditMode = Boolean(editingAgent);

  const [agentType, setAgentType] = React.useState(win.agentType || (editingAgent?.agentType) || 'core');
  const [name, setName] = React.useState(editingAgent?.name || 'My Agent');
  const [description, setDescription] = React.useState(editingAgent?.personality || editingAgent?.description || editingAgent?.role || '');
  const [instructions, setInstructions] = React.useState(editingAgent?.system_prompt || editingAgent?.systemPrompt || '');
  const [role, setRole] = React.useState(editingAgent?.role || editingAgent?.specialty || '');
  const [hue, setHue] = React.useState(editingAgent?.hue ?? 222);
  const [provider, setProvider] = React.useState(editingAgent?.model_provider || 'google');
  const [model, setModel] = React.useState(editingAgent?.model_name || defaultModelForProvider(editingAgent?.model_provider || 'google'));
  const [templateAgentId, setTemplateAgentId] = React.useState('');
  const [parentAgentId, setParentAgentId] = React.useState('architect');
  const [groupIds, setGroupIds] = React.useState(() => groups.some(g => g.id === 'core') ? ['core'] : []);
  const [selectedTools, setSelectedTools] = React.useState(() => (
    Array.isArray(editingAgent?.tool_scopes?.tools) ? editingAgent.tool_scopes.tools : DEFAULT_TOOLS
  ));
  const [toolSearch, setToolSearch] = React.useState('');
  const [githubRepos, setGithubRepos] = React.useState(() => (
    editingAgent?.tool_scopes?.scopes?.github?.repos?.join(', ') || ''
  ));
  const [localPaths, setLocalPaths] = React.useState(() => (
    editingAgent?.tool_scopes?.scopes?.local?.paths?.join(', ') || ''
  ));
  const [toolCatalog, setToolCatalog] = React.useState({ tools: [], categories: [] });
  const [status, setStatus] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => { setTimeout(() => inputRef.current?.focus(), 30); }, []);

  React.useEffect(() => {
    if (!editingAgent) return;
    setName(editingAgent.name || 'My Agent');
    setDescription(editingAgent.personality || editingAgent.description || editingAgent.role || '');
    setInstructions(editingAgent.system_prompt || editingAgent.systemPrompt || '');
    setRole(editingAgent.role || editingAgent.specialty || '');
    setHue(editingAgent.hue ?? 222);
    if (editingAgent.model_provider) setProvider(editingAgent.model_provider);
    if (editingAgent.model_name) setModel(editingAgent.model_name);
    if (Array.isArray(editingAgent.tool_scopes?.tools)) setSelectedTools(editingAgent.tool_scopes.tools);
    if (editingAgent.tool_scopes?.scopes?.github?.repos) setGithubRepos(editingAgent.tool_scopes.scopes.github.repos.join(', '));
    if (editingAgent.tool_scopes?.scopes?.local?.paths) setLocalPaths(editingAgent.tool_scopes.scopes.local.paths.join(', '));
  }, [editingAgentId]);

  React.useEffect(() => {
    let alive = true;
    api.getToolCatalog()
      .then(catalog => { if (alive) setToolCatalog(catalog); })
      .catch(err => { if (alive) setStatus(`Tool catalog unavailable: ${err.message}`); });
    return () => { alive = false; };
  }, []);

  const templateAgent = templateAgentId ? getAgentById(templateAgentId) : null;
  const parentAgent = agentType === 'sub' ? getAgentById(parentAgentId) : null;
  const glyph = (name.trim()[0] || '?').toUpperCase();
  const selectedToolRows = selectedTools
    .map(toolName => (toolCatalog.tools || []).find(tool => tool.name === toolName) || { name: toolName, label: toolName, category: 'Selected' })
    .filter(Boolean);
  const preview = {
    id: editingAgentId || 'preview-agent',
    name: name || (agentType === 'core' ? 'Core agent' : 'Sub-agent'),
    role: description || role || templateAgent?.role || (agentType === 'core' ? 'No information added' : 'Agent that handles a specific task'),
    glyph,
    hue,
    kind: 'ai',
  };

  const applyTemplate = (agentId) => {
    const agent = getAgentById(agentId);
    if (!agent) return;
    setTemplateAgentId(agentId);
    setRole(current => current.trim() ? current : agent.role);
    setDescription(current => current.trim() ? current : agent.role);
    setInstructions(current => current.trim() ? current : agent.system_prompt || agent.systemPrompt || '');
    setHue(agent.hue ?? hue);
    if (agent.model_provider) setProvider(agent.model_provider);
    if (agent.model_name) setModel(agent.model_name);
    if (Array.isArray(agent.tool_scopes?.tools)) setSelectedTools(agent.tool_scopes.tools);
  };

  const toggleGroup = (groupId) => {
    setGroupIds(prev => prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]);
  };

  const toggleTool = (toolName) => {
    setSelectedTools(prev => prev.includes(toolName) ? prev.filter(n => n !== toolName) : [...prev, toolName]);
  };

  const createAgent = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setStatus('Saving agent...');
    const toolScopes = {
      mode: 'custom',
      tools: selectedTools,
      scopes: {
        github: { repos: githubRepos.split(/[\n,]+/).map(repo => repo.trim()).filter(Boolean) },
        local: { paths: localPaths.split(/[\n,]+/).map(path => path.trim()).filter(Boolean) },
        project: { mode: 'current' },
      },
    };

    try {
      let saved;
      if (isEditMode) {
        const payload = {
          id: editingAgentId,
          name: name.trim(),
          role: role.trim() || description.trim() || editingAgent.role,
          personality: description.trim() || null,
          specialty: role.trim() || null,
          system_prompt: instructions.trim() || null,
          hue,
          model_provider: provider,
          model_name: model || defaultModelForProvider(provider),
          tool_scopes: toolScopes,
        };
        saved = await api.updateAgentConfig(editingAgentId, payload);
        updateAgent(saved);
        onUpdate?.({ updatedAgentId: saved.id, lastUpdatedName: saved.name });
        setStatus(`${saved.name} updated successfully.`);
      } else if (agentType === 'sub') {
        saved = await api.createSubAgent({
          parentId: parentAgentId,
          name: name.trim(),
          role: role.trim() || description.trim() || 'Specialist sub-agent',
          specialty: description.trim() || null,
          systemPrompt: instructions.trim() || null,
          hue,
          permission: selectedTools.some(tool => /write|edit|merge|submit|restart|create|comment/.test(tool)) ? 'worker' : 'researcher',
          model_provider: provider,
          model_name: model || defaultModelForProvider(provider),
          toolScopes,
          workspaceId,
        });
      } else {
        const id = uniqueAgentId(name, agentType, agents);
        saved = await api.createAgent({
          id,
          name: name.trim(),
          role: role.trim() || description.trim() || 'Core teammate',
          glyph,
          hue,
          kind: 'ai',
          personality: description.trim() || null,
          specialty: role.trim() || null,
          system_prompt: instructions.trim() || null,
          model_provider: provider,
          model_name: model || defaultModelForProvider(provider),
          toolScopes,
        });
      }

      const agent = {
        ...saved,
        glyph: saved.glyph || glyph,
        hue: saved.hue ?? hue,
        kind: saved.kind || 'ai',
        agentType,
        templateAgentId: templateAgentId || undefined,
        parentAgentId: agentType === 'sub' ? parentAgentId : undefined,
        tool_scopes: saved.tool_scopes || toolScopes,
      };

      if (!isEditMode) {
        onCreateAgent?.(agent, { groupIds });
        onUpdate?.({ createdAgentId: agent.id, lastCreatedName: agent.name });
        setStatus(`${agent.name} saved with ${selectedTools.length} selected tools.`);
        setName('');
        setDescription('');
        setInstructions('');
        setRole('');
      }
    } catch (err) {
      setStatus(err.message || 'Failed to save agent');
    } finally {
      setSaving(false);
    }
  };

  const toolGroups = toolCatalog.kits?.length ? toolCatalog.kits : (toolCatalog.categories || []);
  const filteredCategories = toolGroups.map(category => ({
    ...category,
    tools: (category.tools || []).filter(tool => {
      const needle = `${tool.label} ${tool.name} ${tool.description} ${tool.category} ${tool.type} ${tool.kit} ${(tool.tags || []).join(' ')}`.toLowerCase();
      return needle.includes(toolSearch.toLowerCase());
    }),
  })).filter(category => category.tools.length > 0);

  return {
    isEditMode,
    editingAgent,
    agentType, setAgentType,
    name, setName,
    description, setDescription,
    instructions, setInstructions,
    role, setRole,
    hue, setHue,
    provider, setProvider,
    model, setModel,
    templateAgentId, setTemplateAgentId,
    parentAgentId, setParentAgentId,
    groupIds, setGroupIds,
    selectedTools, setSelectedTools,
    toolSearch, setToolSearch,
    githubRepos, setGithubRepos,
    localPaths, setLocalPaths,
    toolCatalog, setToolCatalog,
    status, setStatus,
    saving, setSaving,
    inputRef,
    templateAgent, parentAgent, glyph, selectedToolRows, preview,
    applyTemplate, toggleGroup, toggleTool, createAgent, filteredCategories,
  };
}
