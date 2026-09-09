import React from 'react';
import { PillBtn } from './AgentStats.jsx';
import { modelOptionsFor, defaultModelForProvider } from './AgentData.js';
import { AgentIconPicker } from './AgentIconPicker.jsx';

export function AgentEditor({
  agent, draft, setDraft, draftProvider, setDraftProvider,
  draftModel, setDraftModel, draftTools, setDraftTools,
  draftIconRef, setDraftIconRef,
  toolCatalog, toolSearch, setToolSearch, saveStatus,
  onSave, onCancel, textRef
}) {
  const toggleTool = (toolName) => {
    setDraftTools(prev => prev.includes(toolName) ? prev.filter(name => name !== toolName) : [...prev, toolName]);
  };

  const selectedToolRows = draftTools
    .map(toolName => (toolCatalog.tools || []).find(tool => tool.name === toolName) || { name: toolName, label: toolName, category: 'Selected' })
    .filter(Boolean);

  const filteredToolRows = (toolCatalog.tools || []).filter(tool => {
    if (draftTools.includes(tool.name)) return false;
    const needle = `${tool.label} ${tool.name} ${tool.description} ${tool.category} ${tool.type} ${tool.kit} ${(tool.tags || []).join(' ')}`.toLowerCase();
    return needle.includes(toolSearch.toLowerCase());
  }).slice(0, 18);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={draftProvider} onChange={e => { const provider = e.target.value; setDraftProvider(provider); setDraftModel(defaultModelForProvider(provider)); }} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid oklch(0.62 0.14 ${agent.hue})`, background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 12, outline: 'none' }}>
          <option value="cohere">Cohere (North / Command)</option>
          <option value="ollama">Ollama (Local)</option>
          <option value="openrouter">OpenRouter (Cloud)</option>
          <option value="google">Google API (Gemini)</option>
          <option value="moonshot">Moonshot API (Kimi)</option>
          <option value="opencode">OpenCode Zen (Free models)</option>
        </select>
        <select value={draftModel} onChange={e => setDraftModel(e.target.value)} style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: `1px solid oklch(0.62 0.14 ${agent.hue})`, background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 12, outline: 'none' }}>
          {modelOptionsFor(draftProvider, draftModel).map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      {/* Brief C2 — Icon section. New draftIconRef / setDraftIconRef props so
          the parent can persist the chosen icon (string id or inline SVG) into
          the agent record. */}
      <div style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
        <AgentIconPicker value={draftIconRef} onChange={setDraftIconRef} />
      </div>
      <input value={draftModel} onChange={e => setDraftModel(e.target.value)} placeholder="Custom model tag" style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: `1px solid oklch(0.62 0.14 ${agent.hue} / 0.55)`, background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 12, outline: 'none' }} />
      <textarea ref={textRef} value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(); } if (e.key === 'Escape') onCancel(); }}
        style={{ width: '100%', minHeight: 100, resize: 'vertical', border: `1.5px solid oklch(0.62 0.14 ${agent.hue})`, borderRadius: 10, padding: 10, font: '12px/1.5 var(--font-sans)', color: 'var(--ink)', background: 'var(--surface-2)', outline: 'none' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Tools</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{draftTools.length} selected</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 8, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
          {selectedToolRows.map(tool => (
            <button key={tool.name} onClick={() => toggleTool(tool.name)} title={tool.description || tool.name} style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 999, background: `oklch(0.92 0.04 ${agent.hue})`, color: `oklch(0.32 0.10 ${agent.hue})`, fontSize: 11, fontWeight: 700 }}>
              {tool.label || tool.name}<span style={{ color: 'var(--ink-soft)' }}>x</span>
            </button>
          ))}
          <input value={toolSearch} onChange={e => setToolSearch(e.target.value)} placeholder="Add tool" style={{ minWidth: 120, flex: 1, border: 0, outline: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 12 }} />
        </div>
        {toolSearch && filteredToolRows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: 140, overflow: 'auto' }}>
            {filteredToolRows.map(tool => (
              <button key={tool.name} onClick={() => toggleTool(tool.name)} title={tool.description} style={{ all: 'unset', cursor: 'pointer', padding: '7px 8px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--ink-soft)', fontSize: 11 }}>
                <strong style={{ color: 'var(--ink)' }}>{tool.label}</strong>
                <span style={{ marginLeft: 6, color: 'var(--ink-faint)' }}>{tool.kit || tool.category}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: saveStatus.includes('failed') || saveStatus.includes('unavailable') ? '#dc2626' : 'var(--ink-faint)', letterSpacing: '0.05em' }}>{saveStatus || 'Ctrl+Enter to save · Esc to cancel'}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <PillBtn ghost onClick={onCancel}>Cancel</PillBtn>
          <PillBtn onClick={onSave}>Save</PillBtn>
        </div>
      </div>
    </div>
  );
}
