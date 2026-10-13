import React from 'react';
import { ThemePanelCard, Slider } from './ThemeControls.jsx';

export const GLASS_BLUR_RANGE = Object.freeze({ min: 0.25, max: 2, step: 0.05 });

/** Settings > Appearance, under Look: frosted glass on/off and how strong the blur is. */
export function FrostedGlassSection({ theme, setTheme }) {
  const on = theme.frostedGlass !== false;
  return (
    <ThemePanelCard style={{ padding: 12, display: 'grid', gap: 10 }} data-testid="frosted-glass-section">
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--ink)' }}>Glass</span>
        <input
          type="checkbox"
          role="switch"
          aria-label="Frosted glass"
          data-testid="frosted-glass-switch"
          checked={on}
          onChange={(e) => setTheme({ frostedGlass: e.target.checked })}
        />
      </label>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', lineHeight: 1.45 }}>
        Menus, pop-ups and the floating bars show the board through frosted glass. Turn it off for solid menus.
      </span>
      {on && (
        <Slider
          label="Blur strength"
          value={theme.glassBlur ?? 1}
          min={GLASS_BLUR_RANGE.min}
          max={GLASS_BLUR_RANGE.max}
          step={GLASS_BLUR_RANGE.step}
          onChange={(glassBlur) => setTheme({ glassBlur })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      )}
    </ThemePanelCard>
  );
}
