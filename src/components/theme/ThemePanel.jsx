import React from 'react';
import { Icon } from '../Icons.jsx';
import { SettingsTabContent } from './SettingsTabContent.jsx';
import { useThemePanel } from './useThemePanel.js';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';

export function ThemePanel({ open, onClose, anchor, focusMode, setFocusMode, penMode, setPenMode, onResetWorkspace, onLogout }) {
  const panel = useThemePanel();
  const { tab, setTab, pos, tabs, startDrag } = panel;
  useEscapeDismiss(open, onClose);

  if (!open) return null;

  const panelWidth = tab === 'vault' ? 'min(520px, calc(100vw - 28px))' : 'min(540px, calc(100vw - 28px))';

  return (
    <div
      role="dialog"
      style={{
        position: 'fixed',
        top: pos ? pos.y : (anchor?.top ?? 52),
        left: pos ? pos.x : undefined,
        right: pos ? undefined : (anchor?.right ?? 18),
        width: panelWidth,
        maxHeight: 'calc(100vh - 76px)',
        display: 'flex', flexDirection: 'column', borderRadius: 10,
        background: 'var(--surface)', border: '1px solid var(--hairline)',
        boxShadow: '0 28px 70px -35px oklch(0 0 0 / 0.55), 0 0 0 1px oklch(1 0 0 / 0.04)',
        zIndex: 90, fontFamily: 'var(--font-sans)', color: 'var(--ink)', overflow: 'hidden',
      }}
    >
      <div onPointerDown={startDrag} style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--hairline)', cursor: 'grab', userSelect: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center' }}>
              <Icon.Gear size={15} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Settings</div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Appearance, canvas, sharing, and AI keys</div>
            </div>
          </div>
          <button onClick={onClose} title="Close settings" style={{ all: 'unset', cursor: 'pointer', width: 28, height: 28, borderRadius: 7, display: 'grid', placeItems: 'center', color: 'var(--ink-faint)', background: 'var(--surface-2)' }}>
            <Icon.Close size={14} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ all: 'unset', cursor: 'pointer', padding: '7px 10px', borderRadius: 7, fontSize: 12, fontWeight: 650, color: tab === t.id ? 'var(--accent-ink)' : 'var(--ink-soft)', background: tab === t.id ? 'var(--accent-soft)' : 'transparent' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <SettingsTabContent
          tab={tab}
          panel={panel}
          focusMode={focusMode}
          setFocusMode={setFocusMode}
          penMode={penMode}
          setPenMode={setPenMode}
          onResetWorkspace={onResetWorkspace}
          onLogout={onLogout}
        />
      </div>
    </div>
  );
}
