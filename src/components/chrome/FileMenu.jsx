import React from 'react';
import { MenuItem, MenuSep } from './Buttons.jsx';
import { ProjectSelector } from './ProjectSelector.jsx';

export function FileMenu({ onClose, projectName, currentProject, onOpenLocalProject, presets = [], onSaveAsPreset, onLoadPreset, onDeletePreset, onNewTerminal, onNewHtmlPreview, onSpawnRook, onNewMailcow, onNewVex }) {
  const [savingPreset, setSavingPreset] = React.useState(false);
  const [presetName, setPresetName] = React.useState('');
  const saveInputRef = React.useRef(null);

  React.useEffect(() => {
    if (!savingPreset) return undefined;
    const timer = setTimeout(() => saveInputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [savingPreset]);

  const exportWorkspace = () => {
    const data = localStorage.getItem('homebase.workspace.v1');
    if (!data) { alert('No workspace data to export.'); return; }
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `censai-workspace-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const aboutCensai = () => {
    alert('Censai\n\nAn infinite canvas for you and your agents.\nBuilt by Alex.\n\n· Drag agents onto windows to assign them\n· Rubber-band a region to plan\n· Edit system prompts to shape behavior');
    onClose();
  };

  const commitSavePreset = () => {
    const name = presetName.trim();
    if (!name) { setSavingPreset(false); return; }
    onSaveAsPreset?.(name);
    setPresetName('');
    setSavingPreset(false);
  };

  const sortedPresets = [...presets].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  return <>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
    <div data-canvas-ui style={{ position: 'absolute', top: 44, left: 8, zIndex: 70, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 12, padding: 6, minWidth: 240, boxShadow: 'var(--shadow-pop)' }}>
      <div style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{projectName || 'Untitled'}</div>

      <ProjectSelector
        currentProject={currentProject}
        onOpenLocalProject={onOpenLocalProject}
        onClose={onClose}
      />
      {currentProject?.path && (
        <div style={{ padding: '0 10px 6px', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-faint)', lineHeight: 1.35, wordBreak: 'break-all' }}>
          Current root: {currentProject.path}
        </div>
      )}
      <MenuItem label="⚡ Summon Rook (OpenClaw)" onClick={() => { onSpawnRook(); onClose(); }} />
      <MenuItem label="New terminal" onClick={() => { onNewTerminal?.(); onClose(); }} />
      <MenuItem label="New shared preview" onClick={() => { onNewHtmlPreview?.(); onClose(); }} />
      <MenuItem label="New Mailcow Panel" onClick={() => { onNewMailcow?.(); onClose(); }} />
      <MenuItem label="⚡ Vex Orchestrator" onClick={() => { onNewVex?.(); onClose(); }} />
      <MenuSep />

      {/* ─── Presets section ─── */}
      <div style={{ padding: '6px 10px 2px', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Presets</div>

      {savingPreset ? (
        <div style={{ padding: '4px 8px 6px', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            ref={saveInputRef}
            value={presetName}
            onChange={e => setPresetName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitSavePreset();
              if (e.key === 'Escape') { setSavingPreset(false); setPresetName(''); }
            }}
            placeholder="Preset name…"
            style={{
              flex: 1, all: 'unset',
              border: '1px solid var(--hairline)', background: 'var(--surface-2)',
              borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'var(--ink)',
            }}
          />
          <button onClick={commitSavePreset} disabled={!presetName.trim()} style={{
            all: 'unset', cursor: presetName.trim() ? 'pointer' : 'not-allowed',
            padding: '5px 10px', borderRadius: 6,
            background: 'var(--accent)', color: 'white',
            fontSize: 11, fontWeight: 600, opacity: presetName.trim() ? 1 : 0.4,
          }}>Save</button>
        </div>
      ) : (
        <MenuItem
          label={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save current as preset…
          </span>}
          onClick={() => setSavingPreset(true)}
        />
      )}

      {sortedPresets.length === 0 ? (
        <div style={{ padding: '4px 14px 8px', fontSize: 11, color: 'var(--ink-faint)', fontStyle: 'italic' }}>No saved presets yet.</div>
      ) : (
        <div style={{ maxHeight: 220, overflowY: 'auto', overscrollBehavior: 'contain', padding: '2px 0' }}>
          {sortedPresets.map(p => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '2px 4px 2px 10px', borderRadius: 6, margin: '0 2px',
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div
                onClick={() => { onLoadPreset?.(p.id); onClose(); }}
                title={`Load "${p.name}" — ${(p.wins || []).length} windows`}
                style={{ flex: 1, padding: '5px 0', fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {p.name}
                <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)' }}>
                  {(p.wins || []).length}w
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDeletePreset?.(p.id); }}
                title="Delete preset"
                style={{ all: 'unset', cursor: 'pointer', width: 22, height: 22, borderRadius: 5, display: 'grid', placeItems: 'center', color: 'var(--ink-faint)', transition: 'color 0.15s, background 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ps-red)'; e.currentTarget.style.background = 'oklch(0 0 0 / 0.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-faint)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <MenuSep />
      <MenuItem label="Export workspace" onClick={exportWorkspace} />
      <MenuItem label="Settings" onClick={onClose} />
      <MenuSep />
      <MenuItem label="About Censai" onClick={aboutCensai} />
    </div>
  </>;
}
