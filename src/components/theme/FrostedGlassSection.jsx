import React from 'react';
import { SettingsRow, SettingsSection, SettingsSlider, SettingsSwitch } from './settingsKit.jsx';

export const GLASS_BLUR_RANGE = Object.freeze({ min: 0.25, max: 2, step: 0.05 });

/** Settings > Appearance: frosted glass on menus and bars, and how strong the blur is. */
export function FrostedGlassSection({ theme, setTheme }) {
  const on = theme.frostedGlass !== false;
  return (
    <SettingsSection title="Frosted menus" data-testid="frosted-glass-section">
      <SettingsRow label="Frosted glass" hint="Menus, pop-ups and the floating bars show the board through frosted glass. Off makes them solid.">
        <SettingsSwitch label="Frosted glass" data-testid="frosted-glass-switch" checked={on} onChange={(frostedGlass) => setTheme({ frostedGlass })} />
      </SettingsRow>
      {on && (
        <SettingsSlider
          label="Blur strength"
          value={theme.glassBlur ?? 1}
          min={GLASS_BLUR_RANGE.min}
          max={GLASS_BLUR_RANGE.max}
          step={GLASS_BLUR_RANGE.step}
          onChange={(glassBlur) => setTheme({ glassBlur })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      )}
    </SettingsSection>
  );
}
