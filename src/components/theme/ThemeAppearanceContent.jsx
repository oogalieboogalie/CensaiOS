import React from 'react';
import { ColorsSection } from './ThemeDesignSections.jsx';
import { LookSection } from './ThemeLookSection.jsx';
import { WindowsSection } from './ThemeWindowsSection.jsx';
import { FrostedGlassSection } from './FrostedGlassSection.jsx';
import { SettingsPage } from './settingsKit.jsx';

/** Settings > Appearance: Look, Windows, Frosted menus, Colors. */
export function ThemeAppearanceContent({ panel, intro = 'How censaiOS looks. Every change shows on the board right away.' }) {
  const { theme, setTheme, setShape } = panel;
  return (
    <SettingsPage intro={intro} data-testid="theme-appearance-content">
      <LookSection {...panel} />
      <WindowsSection theme={theme} setTheme={setTheme} setShape={setShape || setTheme} />
      <FrostedGlassSection theme={theme} setTheme={setTheme} />
      <ColorsSection {...panel} />
    </SettingsPage>
  );
}
