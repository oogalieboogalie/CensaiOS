/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from './Windows.jsx';
import { getAgents, getAgentById } from '../lib/agentStore.js';
import { ExoSkeletonModules } from './ExoSkeletonModules.jsx';
import { ExoSkeletonAttributes } from './ExoSkeletonAttributes.jsx';
import { useAgentConfiguration } from './exoskeleton/useAgentConfiguration.js';
import { FamilyModulesLocked } from './exoskeleton/FamilyModulesLocked.jsx';
import { FAMILY_AGENTS, FAMILY_AGENT_BY_ID } from '../data/family-agents.js';
import { SkillSetsTab } from './exoskeleton/SkillSetsTab.jsx';

const TABS = [['modules', 'Exo-Modules'], ['attributes', 'Identity & Mindsets'], ['skills', 'Skill Sets']];

// Only the eight built-in agents can be configured here (the server refuses
// any other id), so the picker lists exactly those.
export function exoSkeletonAgentId(win) {
  const candidates = [win?.agentId, ...(win?.attachedAgents || [])];
  return candidates.map(id => String(id || '').trim().toLowerCase())
    .find(id => FAMILY_AGENT_BY_ID[id]) || FAMILY_AGENTS[0].id;
}

export function ExoSkeletonWindow({ win, onUpdate }) {
  const selectedAgentId = exoSkeletonAgentId(win);
  const agent = getAgentById(selectedAgentId) || FAMILY_AGENT_BY_ID[selectedAgentId] || getAgents()[0];

  const [activeTab, setActiveTab] = React.useState('modules');
  const config = useAgentConfiguration(agent);

  return (
    <>
      <WindowTitle
        accent="var(--ps-green)"
        icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>}
        label={win.title || "Exo-Skeleton Builder"}
        subtitle="Agent Configuration"
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
      />

      {/* Premium Glassmorphic Tab Selector */}
      <div style={{
        display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--hairline)',
        background: 'var(--surface)', padding: '0 16px', gap: 16, zIndex: 4
      }}>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            data-testid={`exo-tab-${id}`}
            onClick={() => { setActiveTab(id); if (id === 'attributes') config.refreshConfiguration(); }}
            style={{
              all: 'unset', cursor: 'pointer', padding: '12px 8px', fontSize: 'var(--text-xs)', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: 1,
              color: activeTab === id ? 'var(--accent)' : 'var(--ink-soft)',
              borderBottom: activeTab === id ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'all 0.2s'
            }}
          >
            {label}
          </button>
        ))}
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
          Agent
          <select
            data-testid="exo-agent-picker"
            value={selectedAgentId}
            onChange={(event) => onUpdate({ agentId: event.target.value })}
            style={{ font: 'inherit', color: 'var(--ink)', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '4px 8px' }}
          >
            {FAMILY_AGENTS.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
      </div>

      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden', background: 'var(--surface-2)' }}>
        {activeTab === 'skills' ? (
          config.scopeBlocked ? React.createElement(FamilyModulesLocked, { agent, loading: false }) : <SkillSetsTab agent={agent} />
        ) : activeTab === 'modules' ? (
          config.scopeBlocked || !config.modulesReady ? (
            React.createElement(FamilyModulesLocked, { agent, loading: !config.scopeBlocked })
          ) : (
            <ExoSkeletonModules
              agent={agent}
              equipped={config.equipped}
              setEquipped={config.setEquipped}
              moduleTools={config.moduleTools}
              installedModuleIds={config.installedModuleIds}
              installModule={config.installModule}
              saveError={config.saveError}
              saveCapabilities={config.saveCapabilities}
              onRefresh={config.refreshConfiguration}
              onUpdate={onUpdate}
            />
          )
        ) : (
          <ExoSkeletonAttributes
            agent={agent}
            allAttributes={config.allAttributes}
            equippedAttributes={config.equippedAttributes}
            allMindsets={config.allMindsets}
            equippedMindsets={config.equippedMindsets}
            previewPrompt={config.previewPrompt}
            previewTemplate={config.previewTemplate}
            saveError={config.saveError}
            scopeBlocked={config.scopeBlocked}
            handleToggleAttribute={config.toggleAttribute}
            handleToggleMindset={config.toggleMindset}
            refreshConfiguration={config.refreshConfiguration}
          />
        )}
      </div>
    </>
  );
}
