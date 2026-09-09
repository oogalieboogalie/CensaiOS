/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from './Windows.jsx';
import { getAgents, getAgentById } from '../lib/agentStore.js';
import { ExoSkeletonModules } from './ExoSkeletonModules.jsx';
import { ExoSkeletonAttributes } from './ExoSkeletonAttributes.jsx';
import { useAgentConfiguration } from './exoskeleton/useAgentConfiguration.js';
import { FamilyModulesLocked } from './exoskeleton/FamilyModulesLocked.jsx';

export function ExoSkeletonWindow({ win, onUpdate }) {
  const selectedAgentId = win.attachedAgents?.[0] || '1'; // Default to first agent if none attached
  const agent = getAgentById(selectedAgentId) || getAgents()[0];

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
        display: 'flex', borderBottom: '1px solid var(--hairline)',
        background: 'var(--surface)', padding: '0 16px', gap: 16, zIndex: 4
      }}>
        <button
          onClick={() => setActiveTab('modules')}
          style={{
            all: 'unset', cursor: 'pointer', padding: '12px 8px', fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 1,
            color: activeTab === 'modules' ? 'var(--accent)' : 'var(--ink-soft)',
            borderBottom: activeTab === 'modules' ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'all 0.2s'
          }}
        >
          Exo-Modules
        </button>
        <button
          onClick={() => setActiveTab('attributes')}
          style={{
            all: 'unset', cursor: 'pointer', padding: '12px 8px', fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 1,
            color: activeTab === 'attributes' ? 'var(--accent)' : 'var(--ink-soft)',
            borderBottom: activeTab === 'attributes' ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'all 0.2s'
          }}
        >
          Identity & Mindsets
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden', background: 'var(--surface-2)' }}>
        {activeTab === 'modules' ? (
          config.scopeBlocked || !config.modulesReady ? (
            React.createElement(FamilyModulesLocked, { agent, loading: !config.scopeBlocked })
          ) : (
            <ExoSkeletonModules
              agent={agent}
              equipped={config.equipped}
              setEquipped={config.setEquipped}
              moduleTools={config.moduleTools}
              installedModuleIds={config.installedModuleIds}
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
