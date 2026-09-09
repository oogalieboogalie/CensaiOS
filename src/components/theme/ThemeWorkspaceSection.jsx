import React from 'react';
import { SURFACE_CONTROLS, useTheme } from '../Theme.jsx';
import { SurfaceControl, ThemePanelCard } from './ThemeControls.jsx';
import { CanvasInteractionSettings } from './CanvasInteractionSettings.jsx';
import { WorkspaceAccountActions } from './WorkspaceAccountActions.jsx';

export function FineTuneSection({ theme, setTheme, clearOverrides, activeSurface, setActiveSurface }) {
  return (
    <ThemePanelCard>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Fine Tune</div>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Per-surface OKLCH controls</div>
        </div>
        <button onClick={clearOverrides} style={{ all: 'unset', cursor: 'pointer', padding: '6px 9px', borderRadius: 7, background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-soft)', fontSize: 11, fontWeight: 650 }}>Clear</button>
      </div>
      {SURFACE_CONTROLS.map(item => (
        <SurfaceControl key={item.varName} item={item} theme={theme} setTheme={setTheme} activeSurface={activeSurface} setActiveSurface={setActiveSurface} />
      ))}
    </ThemePanelCard>
  );
}

export function WorkspaceSection({ focusMode, setFocusMode, penMode, setPenMode, onResetWorkspace, onLogout }) {
  const { theme, setTheme } = useTheme();
  return (
    <div style={{ display: 'grid', gap: 13 }}>
      <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 13 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 750, color: 'var(--ink)' }}>Canvas behavior</div>
          <div style={{ marginTop: 3, fontSize: 11, color: 'var(--ink-faint)' }}>Movement, snapping, drawing, and display scale.</div>
        </div>
      {typeof focusMode !== 'undefined' && (
        <WorkspaceToggle
          label="Focus Mode"
          description="Hide surrounding chrome while working"
          checked={focusMode}
          onChange={() => setFocusMode?.(!focusMode)}
        />
      )}
      {typeof penMode !== 'undefined' && (
        <WorkspaceToggle
          label="Pen Mode"
          description="Stylus draws on the canvas; touch drags the workspace"
          checked={penMode}
          onChange={() => setPenMode?.(!penMode)}
        />
      )}
      <WorkspaceToggle
        label="Grid/Window Snapping"
        description="Enable windows to snap to other windows on move"
        checked={theme.gridSnapping !== false}
        onChange={() => setTheme({ gridSnapping: theme.gridSnapping === false })}
      />
      <CanvasInteractionSettings />
      <div style={{ display: 'grid', gap: 4, padding: '4px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Window Border Thickness</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>{theme.borderWidth || 1}px</span>
        </div>
        <input
          type="range"
          min="1"
          max="5"
          step="1"
          value={theme.borderWidth || 1}
          onChange={(e) => setTheme({ borderWidth: Number(e.target.value) })}
          style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
      </div>
      <div style={{ display: 'grid', gap: 4, padding: '4px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>App Font Scale</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>{Math.round((theme.fontScale || 1.0) * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.8"
          max="1.5"
          step="0.05"
          value={theme.fontScale || 1.0}
          onChange={(e) => setTheme({ fontScale: Number(e.target.value) })}
          style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
      </div>
      </ThemePanelCard>
      <WorkspaceAccountActions onResetWorkspace={onResetWorkspace} onLogout={onLogout} />
    </div>
  );
}

function WorkspaceToggle({ label, description, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{description}</div>
      </div>
      <button
        type="button"
        onClick={onChange}
        aria-pressed={checked}
        style={{ position: 'relative', width: 44, height: 24, borderRadius: 999, border: 0, padding: 0, background: checked ? 'var(--accent)' : 'oklch(0.5 0 0 / 0.22)', cursor: 'pointer', transition: 'background 0.15s', flex: '0 0 auto' }}
      >
        <span style={{ position: 'absolute', top: 2, left: checked ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px oklch(0 0 0 / 0.28)', transition: 'left 0.15s' }} />
      </button>
    </div>
  );
}
