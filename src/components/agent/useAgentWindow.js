import React from 'react';
import { api } from '../../lib/api.js';
import { getAgentById, updateAgent } from '../../lib/agentStore.js';
import { AGENT_SYSTEMS } from '../Agents.jsx';
import { supportedProvider, defaultModelForProvider, defaultToolsForAgent } from './AgentData.js';

export function useAgentWindow(win, onUpdate) {
  const agent = getAgentById(win.agentId);
  const [editing, setEditing] = React.useState(false);
  
  const currentPrompt = React.useMemo(() => (
    win.customSystem ?? agent?.system_prompt ?? agent?.systemPrompt ?? AGENT_SYSTEMS[agent?.id] ?? (agent ? `You are ${agent.name}. ${agent.role}. Work autonomously, ask before destructive ops, and ship.` : '')
  ), [win.customSystem, agent]);

  const [draft, setDraft] = React.useState(currentPrompt);
  const initialProvider = supportedProvider(agent?.model_provider);
  const [draftProvider, setDraftProvider] = React.useState(initialProvider);
  const [draftModel, setDraftModel] = React.useState(agent?.model_name || defaultModelForProvider(initialProvider));
  const [draftTools, setDraftTools] = React.useState(defaultToolsForAgent(agent));
  const [toolCatalog, setToolCatalog] = React.useState({ tools: [], categories: [] });
  const [toolSearch, setToolSearch] = React.useState('');
  const [saveStatus, setSaveStatus] = React.useState('');
  const textRef = React.useRef(null);

  React.useEffect(() => {
    if (!agent) return;
    setDraft(currentPrompt);
    const prov = supportedProvider(agent.model_provider);
    setDraftProvider(prov);
    setDraftModel(agent.model_name || defaultModelForProvider(prov));
    setDraftTools(defaultToolsForAgent(agent));
    setToolSearch('');
    setSaveStatus('');
    setEditing(false);
  }, [win.id, agent?.id, currentPrompt, agent?.model_provider, agent?.model_name]);

  React.useEffect(() => {
    let alive = true;
    api.getToolCatalog()
      .then(catalog => { if (alive) setToolCatalog(catalog); })
      .catch(err => { if (alive) setSaveStatus(`Tool catalog unavailable: ${err.message}`); });
    return () => { alive = false; };
  }, []);

  React.useEffect(() => { if (editing) setTimeout(() => textRef.current?.focus(), 30); }, [editing]);

  const saveSystem = async () => {
    if (!agent) return;
    const trimmed = draft.trim();
    const toolScopes = {
      mode: 'custom',
      tools: draftTools,
      scopes: agent.tool_scopes?.scopes || {},
    };
    const updatedAgent = {
      ...agent,
      systemPrompt: trimmed,
      system_prompt: trimmed,
      model_provider: draftProvider,
      model_name: draftModel || defaultModelForProvider(draftProvider),
      tool_scopes: toolScopes,
      toolScopes,
    };
    try {
      await api.saveAgent(updatedAgent);
      onUpdate({ customSystem: trimmed });
      AGENT_SYSTEMS[agent.id] = trimmed;
      updateAgent(updatedAgent);
      setSaveStatus(`${agent.name} saved with ${draftTools.length} tools.`);
      setEditing(false);
    } catch (e) {
      console.error('Failed to save agent to backend', e);
      setSaveStatus(`Save failed: ${e.message}`);
    }
  };

  const cancelEdit = () => {
    if (!agent) return;
    setDraft(currentPrompt);
    const prov = supportedProvider(agent.model_provider);
    setDraftProvider(prov);
    setDraftModel(agent.model_name || defaultModelForProvider(prov));
    setDraftTools(defaultToolsForAgent(agent));
    setSaveStatus('');
    setEditing(false);
  };

  return {
    agent,
    editing, setEditing,
    draft, setDraft,
    draftProvider, setDraftProvider,
    draftModel, setDraftModel,
    draftTools, setDraftTools,
    toolCatalog, toolSearch, setToolSearch,
    saveStatus, textRef,
    currentPrompt,
    saveSystem, cancelEdit
  };
}
