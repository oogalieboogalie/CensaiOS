import React from 'react';
import { api } from '../../lib/api.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { getAgentCapabilityModule } from '../../data/agent-capability-modules.js';

function mapCapabilities(capabilities) {
  const equipped = { head: null, mainHand: null, offHand: null, trinket: null };
  for (const capability of capabilities) {
    const slot = capability.equipped_slot;
    if (!slot || equipped[slot] === undefined) continue;
    const module = getAgentCapabilityModule(capability.module_id);
    equipped[slot] = module?.slot === slot ? module.id : null;
  }
  return equipped;
}

export function useAgentConfiguration(agent) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const scopeBlocked = !String(workspaceId || '').trim();
  const configurationKey = scopeBlocked || !agent?.id ? '' : `${workspaceId}:${agent.id}`;
  const [equipped, setEquipped] = React.useState(mapCapabilities([]));
  const [moduleTools, setModuleTools] = React.useState([]);
  const [installedModuleIds, setInstalledModuleIds] = React.useState([]);
  const [loadedConfigurationKey, setLoadedConfigurationKey] = React.useState('');
  const [allAttributes, setAllAttributes] = React.useState([]);
  const [equippedAttributes, setEquippedAttributes] = React.useState([]);
  const [allMindsets, setAllMindsets] = React.useState([]);
  const [equippedMindsets, setEquippedMindsets] = React.useState([]);
  const [previewPrompt, setPreviewPrompt] = React.useState('');
  const [saveError, setSaveError] = React.useState('');
  const [refreshRevision, setRefreshRevision] = React.useState(0);
  const template = agent?.system_prompt || agent?.systemPrompt
    || (agent ? `You are ${agent.name}. ${agent.role || ''}` : '');

  const refreshPreview = React.useCallback(async (attributeIds) => {
    if (scopeBlocked) return;
    const preview = await api.compilePromptPreview(agent?.id, template, attributeIds, workspaceId);
    setPreviewPrompt(preview?.compiled || '');
  }, [agent?.id, scopeBlocked, template, workspaceId]);

  React.useEffect(() => {
    let active = true;
    async function load() {
      if (!agent?.id) return;
      if (scopeBlocked) {
        setEquipped(mapCapabilities([]));
        setModuleTools([]);
        setInstalledModuleIds([]);
        setLoadedConfigurationKey('');
        setEquippedAttributes([]);
        setEquippedMindsets([]);
        setPreviewPrompt('');
        setSaveError('Open a workspace to configure this agent.');
        return;
      }
      setEquipped(mapCapabilities([]));
      setModuleTools([]);
      setInstalledModuleIds([]);
      setLoadedConfigurationKey('');
      setSaveError('');
      try {
        const [capabilities, tools, attributes, selectedAttributes, mindsets, selectedMindsets] = await Promise.all([
          api.getAgentCapabilities(agent.id, workspaceId),
          api.getAgentDebugTools(agent.id, workspaceId),
          api.getAttributes(),
          api.getAgentAttributes(agent.id, workspaceId),
          api.getMindsets(),
          api.getAgentMindsets(agent.id, workspaceId),
        ]);
        if (!active) return;
        setEquipped(mapCapabilities(capabilities?.capabilities || []));
        setModuleTools(tools?.moduleTools || []);
        setInstalledModuleIds(capabilities?.installedModuleIds || []);
        setAllAttributes(attributes?.attributes || []);
        setEquippedAttributes(selectedAttributes?.attributes || []);
        setAllMindsets(mindsets?.mindsets || []);
        setEquippedMindsets(selectedMindsets?.mindsets || []);
        await refreshPreview(selectedAttributes?.attributes || []);
        if (active) setLoadedConfigurationKey(configurationKey);
      } catch (error) {
        if (active) setSaveError(error.message || 'Agent configuration could not be loaded.');
      }
    }
    load();
    return () => { active = false; };
  }, [agent?.id, configurationKey, refreshPreview, refreshRevision, scopeBlocked, workspaceId]);

  const saveCapabilities = async (equippedMap) => {
    if (!agent?.id) return;
    if (scopeBlocked) {
      setSaveError('Open a workspace to configure this agent.');
      return false;
    }
    if (loadedConfigurationKey !== configurationKey) {
      setSaveError('Wait for this workspace configuration to finish loading.');
      return false;
    }
    try {
      const modules = Object.values(equippedMap).filter(moduleId => getAgentCapabilityModule(moduleId));
      await api.saveAgentCapabilities(agent.id, modules, workspaceId);
      const tools = await api.getAgentDebugTools(agent.id, workspaceId);
      setModuleTools(tools?.moduleTools || []);
      setSaveError('');
      return true;
    } catch (error) {
      setSaveError(error.message || 'The capability selection was not saved.');
      return false;
    }
  };

  const toggleAttribute = async (id) => {
    const next = equippedAttributes.includes(id)
      ? equippedAttributes.filter((value) => value !== id)
      : [...equippedAttributes, id];
    if (scopeBlocked) return setSaveError('Open a workspace to configure this agent.');
    try {
      const result = await api.saveAgentAttributes(agent.id, next, workspaceId);
      if (!result?.ok) return setSaveError('The attribute selection was not saved.');
      setEquippedAttributes(next);
      await refreshPreview(next);
      setSaveError('');
    } catch (error) {
      setSaveError(error.message || 'The attribute selection was not saved.');
    }
  };

  const toggleMindset = async (id) => {
    const next = equippedMindsets.includes(id)
      ? equippedMindsets.filter((value) => value !== id)
      : [...equippedMindsets, id];
    if (scopeBlocked) return setSaveError('Open a workspace to configure this agent.');
    try {
      const result = await api.saveAgentMindsets(agent.id, next, workspaceId);
      if (!result?.ok) return setSaveError(result?.error || 'The mindset selection was not saved.');
      setSaveError('');
      setEquippedMindsets(next);
    } catch (error) {
      setSaveError(error.message || 'The mindset selection was not saved.');
    }
  };

  return {
    equipped, setEquipped, allAttributes, equippedAttributes, allMindsets,
    equippedMindsets, previewPrompt, saveError, scopeBlocked, moduleTools,
    installedModuleIds,
    modulesReady: Boolean(configurationKey && loadedConfigurationKey === configurationKey),
    saveCapabilities, toggleAttribute, toggleMindset,
    refreshConfiguration: () => setRefreshRevision(value => value + 1),
  };
}
