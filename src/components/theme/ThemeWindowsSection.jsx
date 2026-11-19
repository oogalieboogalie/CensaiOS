import React from 'react';
import { GROUP_GAP_RANGE } from '../../lib/layout/gap.js';
import { normalizeShape } from '../../lib/theme/looks.js';
import { HEADER_MODES, HEADER_MODE_LABELS } from '../../lib/windowHeader.js';
import { SettingsGroup, SettingsSection, SettingsSlider } from './settingsKit.jsx';
import { GroupPreview, WindowPreview } from './settingsPreview.jsx';

// What each header style does, as a person sees it (src/lib/windowHeader.js).
export const HEADER_MODE_HINTS = Object.freeze({
  strip: 'A slim title bar is always shown.',
  ghost: 'The title bar fades in when you point at the window.',
  bare: 'No title bar. Pointing shows a small pill with the buttons.',
  edge: 'No title bar. The buttons sit in a column on the right.',
});

/**
 * Appearance > Windows: how every window is drawn. Header style, border and
 * group gap belong to the look (picking a look sets them); border and text
 * size stay as you leave them.
 */
export function WindowsSection({ theme, setTheme, setShape }) {
  const shape = normalizeShape(theme);
  const border = theme.borderWidth || 1;
  return (
    <SettingsSection title="Windows" hint="How every window on the board is drawn." data-testid="theme-windows-section">
      <SettingsGroup title="Title bar" hint={HEADER_MODE_HINTS[shape.headerMode]} data-testid="look-header-mode">
        <div role="radiogroup" aria-label="Window title bar" className="hb-set-tiles hb-set-tiles--small">
          {HEADER_MODES.map((mode) => (
            <button key={mode} type="button" role="radio" aria-checked={shape.headerMode === mode} className="hb-set-tile"
              title={HEADER_MODE_HINTS[mode]} onClick={() => setShape({ headerMode: mode })}>
              <WindowPreview header={mode} radiusScale={shape.radiusScale} borderWidth={border} />
              <span className="hb-set-tile-name">{HEADER_MODE_LABELS[mode]}</span>
            </button>
          ))}
        </div>
      </SettingsGroup>
      <SettingsGroup>
        <div className="hb-set-demo">
          <SettingsSlider label="Border thickness" value={border} min={1} max={5} step={1}
            onChange={(borderWidth) => setTheme({ borderWidth })} format={(v) => `${v}px`} />
          <WindowPreview header={shape.headerMode} radiusScale={shape.radiusScale} borderWidth={border} />
        </div>
      </SettingsGroup>
      <SettingsGroup data-testid="look-group-gap">
        <div className="hb-set-demo">
          <SettingsSlider label="Space between grouped windows" value={shape.groupGap}
            min={GROUP_GAP_RANGE.min} max={GROUP_GAP_RANGE.max} step={GROUP_GAP_RANGE.step}
            onChange={(groupGap) => setShape({ groupGap })} format={(v) => `${Math.round(v)}px`}
            hint="Windows in a group move apart or closer and stay inside the group's edge." />
          <GroupPreview gap={shape.groupGap} />
        </div>
      </SettingsGroup>
      <SettingsGroup>
        <SettingsSlider label="Text size" value={theme.fontScale || 1} min={0.8} max={1.5} step={0.05}
          onChange={(fontScale) => setTheme({ fontScale })} format={(v) => `${Math.round(v * 100)}%`}
          hint="Makes all the text in censaiOS bigger or smaller." />
      </SettingsGroup>
    </SettingsSection>
  );
}
