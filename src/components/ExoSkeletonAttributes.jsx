import React from 'react';
import { DefinitionGrid } from './exoskeleton/DefinitionGrid.jsx';
import { FamilyRecipePanel } from './exoskeleton/FamilyRecipePanel.jsx';

export function ExoSkeletonAttributes({
  agent, allAttributes, equippedAttributes, allMindsets, equippedMindsets,
  previewPrompt, saveError, scopeBlocked = false, handleToggleAttribute, handleToggleMindset,
  refreshConfiguration,
}) {
  const selectedMindsets = allMindsets.filter((mindset) => equippedMindsets.includes(mindset.id));
  if (scopeBlocked) {
    return (
      <div role="status" style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 28, background: 'var(--surface-2)' }}>
        <div style={{ maxWidth: 360, padding: 20, border: '1px solid var(--hairline)', borderRadius: 10, background: 'var(--surface)', color: 'var(--ink)', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 750, marginBottom: 7 }}>Open a workspace to configure this agent</div>
          <div style={{ fontSize: 10, lineHeight: 1.5, color: 'var(--ink-soft)' }}>Attributes and mindsets belong to a specific workspace. Select or create one before changing the team configuration.</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {saveError && <div role="alert" style={{ padding: '9px 11px', borderRadius: 8, border: '1px solid var(--danger)', color: 'var(--danger)', background: 'var(--surface)', fontSize: 10 }}>{saveError}</div>}
        <FamilyRecipePanel allAttributes={allAttributes} allMindsets={allMindsets} onApplied={refreshConfiguration} />
        <DefinitionGrid
          title="Persona attributes"
          description="Compact traits fill the agent's prompt-template slots. Changes are validated as one atomic selection."
          items={allAttributes}
          equipped={equippedAttributes}
          onToggle={handleToggleAttribute}
        />
        <DefinitionGrid
          eyebrow="Source-reviewed candidates"
          title="Operating mindsets"
          description="Mindsets change decision posture. None are equipped automatically; choose only the behavior you want this agent to carry."
          items={allMindsets}
          equipped={equippedMindsets}
          onToggle={handleToggleMindset}
        />
      </div>

      <div style={{ width: 320, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--hairline)', background: 'var(--surface)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px dashed var(--hairline)' }}>
          <span style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>Live Compiler</span>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: '2px 0 0 0' }}>Prompt Preview</h3>
        </div>

        <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>System Template:</span>
            <div style={{
              background: 'var(--surface-2)', border: '1px solid var(--hairline)',
              padding: 10, borderRadius: 6, fontSize: 10, fontFamily: 'monospace',
              whiteSpace: 'pre-wrap', maxHeight: 110, overflowY: 'auto', color: 'var(--ink-faint)',
              lineHeight: 1.4
            }}>
              {agent.system_prompt || `You are ${agent.name}. ${agent.role || ''}`}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>Compiled System Prompt:</span>
            <div style={{
              flex: 1, background: 'var(--surface-2)', border: '1px solid var(--accent-soft)',
              boxShadow: 'inset 0 0 10px rgba(0,0,0,0.05)',
              padding: 12, borderRadius: 6, fontSize: 10, fontFamily: 'monospace',
              whiteSpace: 'pre-wrap', overflowY: 'auto', color: 'var(--ink)',
              lineHeight: 1.4
            }}>
              {previewPrompt || <span style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>No template prompt defined for this agent.</span>}
            </div>
            <div style={{ padding: 10, borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
              <div style={{ color: 'var(--ink-faint)', fontSize: 9, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 5 }}>Appended at runtime</div>
              <div style={{ color: selectedMindsets.length ? 'var(--ink)' : 'var(--ink-soft)', fontSize: 10, lineHeight: 1.4 }}>
                {selectedMindsets.length ? selectedMindsets.map((mindset) => mindset.name).join(' · ') : 'No operating mindset equipped.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
