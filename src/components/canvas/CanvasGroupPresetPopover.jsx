import React from 'react';
import { getBuiltInPresets } from '../../lib/layoutAlgo.js';
import { CanvasGroupPresetPreview } from './CanvasGroupPresetPreview.jsx';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';

export function CanvasGroupPresetPopover({ presetMenuOpen, setPresetMenuOpen, setSavingPreset, setPresetName, allWins, group, zoom, onApplyBuiltInPreset, savingPreset, saveInputRef, presetName, onSavePreset, presets, onLoadPreset, onDeletePreset }) {
  const dismiss = () => { setPresetMenuOpen(false); setSavingPreset(false); setPresetName(''); };
  useEscapeDismiss(presetMenuOpen, dismiss);
  return <>
      {/* ─── Group preset popover (drops down from the tab) ─── */}
      {presetMenuOpen && (
        <>
          {/* dismiss backdrop */}
          <div onClick={dismiss}
            style={{ position: 'fixed', inset: 0, zIndex: 20, pointerEvents: 'auto' }} />
          <div
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: 6, left: 24, zIndex: 30,
              minWidth: 240, maxWidth: 280,
              background: 'var(--surface)', border: '1px solid var(--hairline)',
              borderRadius: 10, padding: 6,
              boxShadow: 'var(--shadow-pop)',
              pointerEvents: 'auto',
              // Counter-scale so the menu stays at consistent UI size regardless of canvas zoom.
              transform: `scale(${1 / zoom})`,
              transformOrigin: 'top left',
            }}
          >
            <div style={{ padding: '4px 8px 6px', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Layout presets · "{group.label}"
            </div>

            {(() => {
              const inside = (allWins || []).filter(w => {
                const cx = w.x + w.w / 2;
                const cy = w.y + w.h / 2;
                return cx >= group.x && cx <= group.x + group.w && cy >= group.y && cy <= group.y + group.h;
              });
              const builtIns = getBuiltInPresets(inside);

              if (builtIns.length > 0) {
                return (
                  <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--hairline)' }}>
                    <div style={{ padding: '0 8px 4px', fontSize: 10, color: 'var(--ink-faint)' }}>SUGGESTED FOR {inside.length} WINDOWS</div>
                    {builtIns.map(p => (
                      <button key={p.id} style={{
                        all: 'unset', boxSizing: 'border-box', width: 'calc(100% - 4px)',
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 6, margin: '0 2px',
                        fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer',
                      }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        onClick={() => { onApplyBuiltInPreset?.(p.id); setPresetMenuOpen(false); }}
                      >
                        <CanvasGroupPresetPreview kind={p.preview} />
                        <span style={{ display: 'grid', gap: 1 }}>
                          <span>{p.label}</span>
                          {p.description && <span style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>{p.description}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              }
              return null;
            })()}

            {savingPreset ? (
              <div style={{ padding: '2px 4px 6px', display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  ref={saveInputRef}
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const name = presetName.trim();
                      if (!name) return;
                      onSavePreset?.(name);
                      setPresetName('');
                      setSavingPreset(false);
                    }
                    if (e.key === 'Escape') { setSavingPreset(false); setPresetName(''); }
                  }}
                  placeholder="Layout name…"
                  style={{
                    flex: 1, all: 'unset',
                    border: '1px solid var(--hairline)', background: 'var(--surface-2)',
                    borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'var(--ink)',
                  }}
                />
                <button
                  onClick={() => {
                    const name = presetName.trim();
                    if (!name) return;
                    onSavePreset?.(name);
                    setPresetName('');
                    setSavingPreset(false);
                  }}
                  disabled={!presetName.trim()}
                  style={{
                    all: 'unset', cursor: presetName.trim() ? 'pointer' : 'not-allowed',
                    padding: '5px 10px', borderRadius: 6,
                    background: 'var(--accent)', color: 'white',
                    fontSize: 11, fontWeight: 600, opacity: presetName.trim() ? 1 : 0.4,
                  }}
                >Save</button>
              </div>
            ) : (
              <div onClick={() => setSavingPreset(true)}
                style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Save current layout…
              </div>
            )}

            {presets.length === 0 ? (
              <div style={{ padding: '4px 12px 8px', fontSize: 11, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
                No saved layouts yet.
              </div>
            ) : (
              <div style={{ borderTop: '1px solid var(--hairline)', marginTop: 4, paddingTop: 4, maxHeight: 200, overflowY: 'auto' }}>
                {presets.map(p => {
                  const isUndo = p.name === 'Before auto-arrange';
                  return (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '2px 4px 2px 10px', borderRadius: 6, margin: '0 2px',
                    }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div
                        onClick={() => { onLoadPreset?.(p.id); setPresetMenuOpen(false); }}
                        title={`Load "${p.name}" — ${(p.windows || []).length} windows`}
                        style={{ flex: 1, padding: '5px 0', fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        {isUndo && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ink-faint)', flexShrink: 0 }}>
                            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                          </svg>
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                        <span style={{ marginLeft: 'auto', marginRight: 4, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)' }}>
                          {(p.windows || []).length}w
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
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
  </>;
}
