import React from 'react';
import { DefinitionGrid } from './exoskeleton/DefinitionGrid.jsx';
import { FamilyRecipePanel } from './exoskeleton/FamilyRecipePanel.jsx';

// The part of the real prompt that the picks below add. When the template has
// fill-in slots the whole prompt changes, so the whole prompt is shown.
export function addedByPicks(previewPrompt, previewTemplate) {
  const compiled = String(previewPrompt || '');
  const template = String(previewTemplate || '');
  if (template && compiled.startsWith(template)) return compiled.slice(template.length).trim();
  return compiled.trim();
}

export function ExoSkeletonAttributes({
  agent, allAttributes, equippedAttributes, allMindsets, equippedMindsets,
  previewPrompt, previewTemplate = '', saveError, scopeBlocked = false, handleToggleAttribute, handleToggleMindset,
  refreshConfiguration,
}) {
  if (scopeBlocked) {
    return (
      <div role="status" style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 28, background: 'var(--surface-2)' }}>
        <div style={{ maxWidth: 360, padding: 20, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', background: 'var(--surface)', color: 'var(--ink)', textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 750, marginBottom: 7 }}>Open a workspace to configure this agent</div>
          <div style={{ fontSize: 'var(--text-xs)', lineHeight: 1.5, color: 'var(--ink-soft)' }}>Attributes and mindsets belong to a specific workspace. Select or create one before changing the team configuration.</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {saveError && <div role="alert" style={{ padding: '9px 11px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--danger)', color: 'var(--danger)', background: 'var(--surface)', fontSize: 'var(--text-xs)' }}>{saveError}</div>}
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
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: 1 }}>Live Compiler</span>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--ink)', margin: '2px 0 0 0' }}>What this agent is told</h3>
        </div>

        <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-soft)' }}>Base instructions:</span>
            <div style={{
              background: 'var(--surface-2)', border: '1px solid var(--hairline)',
              padding: 10, borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', fontFamily: 'monospace',
              whiteSpace: 'pre-wrap', maxHeight: 110, overflowY: 'auto', color: 'var(--ink-faint)',
              lineHeight: 1.4
            }}>
              {previewTemplate || agent.system_prompt || `You are ${agent.name}. ${agent.role || ''}`}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 6 }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink-soft)' }}>Added to {agent.name}&apos;s instructions:</span>
            <div style={{
              flex: 1, background: 'var(--surface-2)', border: '1px solid var(--accent-soft)',
              boxShadow: 'var(--elevation-2)',
              padding: 12, borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', fontFamily: 'monospace',
              whiteSpace: 'pre-wrap', overflowY: 'auto', color: 'var(--ink)',
              lineHeight: 1.4
            }}>
              <span data-testid="exo-added-by-picks">
                {addedByPicks(previewPrompt, previewTemplate) || <span style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>Nothing yet. Pick an attribute or mindset and it shows up here, exactly as the agent will read it.</span>}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
