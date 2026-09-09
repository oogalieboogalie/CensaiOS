import React from 'react';
import { Icon } from './Icons.jsx';
import { AgentAvatar } from './Agents.jsx';
import { getAgents } from '../lib/agentStore.js';
import { WindowTitle } from './Windows.jsx';
import { MODEL_OPTIONS, defaultModelForProvider } from './windows/agentDesigner/modelConfig.js';
import { ToolkitSelect } from './windows/agentDesigner/ToolkitSelect.jsx';
import { useAgentDesigner } from './windows/agentDesigner/useAgentDesigner.js';
import {
  Field, Segmented, ColorPicker, ScopePanel, AgentRow,
  GroupSelectionList, ToolChipBar, ToolCatalog,
} from './windows/agentDesigner/subcomponents.jsx';
import {
  shellStyle, topBarStyle, brandStyle, bodyStyle, detailsStyle,
  panelHeaderStyle, darkInputStyle, primaryBtnStyle, sectionTitleStyle, listStyle,
  formContainerStyle,
} from './windows/agentDesigner/styles.js';

export function AgentDesignerWindow({ win, onUpdate, onCreateAgent, groups = [] }) {
  const agents = getAgents();
  const {
    isEditMode,
    agentType, setAgentType,
    name, setName,
    description, setDescription,
    instructions, setInstructions,
    role, setRole,
    hue, setHue,
    provider, setProvider,
    model, setModel,
    templateAgentId,
    parentAgentId, setParentAgentId,
    groupIds,
    selectedTools, setSelectedTools,
    toolSearch, setToolSearch,
    githubRepos, setGithubRepos,
    localPaths, setLocalPaths,
    status,
    saving,
    inputRef,
    parentAgent, selectedToolRows, preview,
    applyTemplate, toggleGroup, toggleTool, createAgent, filteredCategories,
  } = useAgentDesigner(win, onCreateAgent, onUpdate, agents, groups);
  const applyToolkit = (tools) => setSelectedTools(tools);

  return (
    <>
      <WindowTitle icon={<Icon.NewAgent size={14} />} label={isEditMode ? "Edit Agent" : "Agent Designer"} subtitle={agentType === 'core' ? 'core teammate' : 'sub-agent'} />
      <div style={shellStyle}>
        <div style={topBarStyle}>
          <div style={brandStyle}>
            <AgentAvatar agent={preview} size={30} ring />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{agentType === 'core' ? 'Core agent' : `Sub-agent of ${parentAgent?.name || parentAgentId}`}</div>
            </div>
          </div>
          {!isEditMode && <Segmented value={agentType} options={[['core', 'Core'], ['sub', 'Sub-agent']]} onChange={setAgentType} />}
          <button onClick={createAgent} disabled={!name.trim() || saving} style={{ ...primaryBtnStyle, opacity: !name.trim() || saving ? 0.55 : 1 }}>
            {saving ? 'Saving...' : (isEditMode ? 'Save changes' : 'Create agent')}
          </button>
        </div>

        <div style={bodyStyle}>
          <div style={detailsStyle}>
            <div style={formContainerStyle}>
              <div style={panelHeaderStyle}>
                <span>Details</span>
                <span style={{ color: '#94a3b8', fontSize: 11 }}>{selectedTools.length} tools</span>
              </div>

              <Field label="Name" count={`${name.length} / 128`}>
                <input ref={inputRef} value={name} maxLength={128} onChange={e => setName(e.target.value)} style={darkInputStyle} />
              </Field>

              <Field label="Description" count={`${description.length} / 5000`}>
                <textarea value={description} maxLength={5000} onChange={e => setDescription(e.target.value)} placeholder="Explain this agent's purpose and capabilities" style={{ ...darkInputStyle, minHeight: 58, resize: 'vertical' }} />
              </Field>

              <Field label="Instructions" count={`${instructions.length} / 50000`}>
                <textarea value={instructions} maxLength={50000} onChange={e => setInstructions(e.target.value)} placeholder="Instruct this agent on goals and behavior" style={{ ...darkInputStyle, minHeight: 148, resize: 'vertical' }} />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Provider">
                  <select value={provider} onChange={e => { setProvider(e.target.value); setModel(defaultModelForProvider(e.target.value)); }} style={darkInputStyle}>
                    <option value="cohere">Cohere</option>
                    <option value="google">Google API</option>
                    <option value="moonshot">Moonshot API</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="ollama">Ollama Local</option>
                    <option value="opencode">OpenCode Zen (Free)</option>
                  </select>
                </Field>
                <Field label="Model">
                  <select value={model} onChange={e => setModel(e.target.value)} style={darkInputStyle}>
                    {(MODEL_OPTIONS[provider] || []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <input value={model} onChange={e => setModel(e.target.value)} placeholder="Custom model tag" style={{ ...darkInputStyle, marginTop: 6 }} />
                </Field>
              </div>

              {agentType === 'sub' && (
                <Field label="Reports to">
                  <select value={parentAgentId} onChange={e => setParentAgentId(e.target.value)} style={darkInputStyle}>
                    {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </select>
                </Field>
              )}

              <div style={sectionTitleStyle}>Tools</div>
              <ToolkitSelect onApply={(tools) => applyToolkit(tools)} />
              <ToolChipBar selectedToolRows={selectedToolRows} toggleTool={toggleTool} toolSearch={toolSearch} setToolSearch={setToolSearch} />
              <ToolCatalog filteredCategories={filteredCategories} selectedTools={selectedTools} toggleTool={toggleTool} />

              <ScopePanel githubRepos={githubRepos} setGithubRepos={setGithubRepos} localPaths={localPaths} setLocalPaths={setLocalPaths} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Model after">
                  <div style={listStyle}>
                    {agents.map(agent => <AgentRow key={agent.id} agent={agent} selected={templateAgentId === agent.id} onClick={() => applyTemplate(agent.id)} />)}
                  </div>
                </Field>
                <Field label="Add to groups">
                  <GroupSelectionList groups={groups} groupIds={groupIds} toggleGroup={toggleGroup} />
                </Field>
              </div>

              <ColorPicker hue={hue} setHue={setHue} />
              {status && <div style={{ fontSize: 11, color: status.includes('Failed') || status.includes('unavailable') ? 'var(--red)' : 'var(--green)', minHeight: 16 }}>{status}</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
