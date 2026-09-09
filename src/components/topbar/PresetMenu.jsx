import React from 'react';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';

function MenuItem({ label, onClick }) {
  return (
    <div onClick={onClick} style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >{label}</div>
  );
}

function MenuSep() {
  return <div style={{ height: 1, margin: '4px 8px', background: 'var(--hairline)' }} />;
}

export function PresetMenu({ presets = [], onSaveAsPreset, onLoadPreset, onDeletePreset }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [savingPreset, setSavingPreset] = React.useState(false);
  const [presetName, setPresetName] = React.useState('');
  const saveInputRef = React.useRef(null);
  useEscapeDismiss(menuOpen, () => { setMenuOpen(false); setSavingPreset(false); setPresetName(''); });

  React.useEffect(() => {
    if (savingPreset) {
      const timer = setTimeout(() => saveInputRef.current?.focus(), 30);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [savingPreset]);

  const commitSavePreset = () => {
    const name = presetName.trim();
    if (!name) {
      setSavingPreset(false);
      return;
    }
    onSaveAsPreset?.(name);
    setPresetName('');
    setSavingPreset(false);
    setMenuOpen(false);
  };

  const sortedPresets = [...presets].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  return (
    <>
      <button
        title="Presets"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen(s => !s)}
        style={{ all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-soft)', background: menuOpen ? 'var(--surface-2)' : 'transparent' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
        Presets
      </button>

      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, top: 50 }} />
          <div data-canvas-ui style={{ position: 'absolute', top: 44, left: 8, zIndex: 70, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 12, padding: 6, minWidth: 240, boxShadow: 'var(--shadow-pop)' }}>
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

            {sortedPresets.length > 0 && <MenuSep />}

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
                      onClick={() => { onLoadPreset?.(p.id); setMenuOpen(false); }}
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
          </div>
        </>
      )}
    </>
  );
}
