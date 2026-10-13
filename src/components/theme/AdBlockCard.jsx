import React from 'react';
import { ThemePanelCard } from './ThemeControls.jsx';
import { useAdBlockEnabled } from '../../lib/adBlock.js';
import { hasNativeBrowserPane } from '../../lib/nativeBrowserPane.js';

/** Settings > Canvas: the "Block ads on web pages" switch. */
export function AdBlockCard() {
  const [on, setOn] = useAdBlockEnabled();
  const desktop = hasNativeBrowserPane();
  const where = desktop
    ? 'Stops ads and trackers in Browser and Search windows, using the EasyList and EasyPrivacy lists built into the app. Works offline. Applies to the next page you open.'
    : 'Works in the censaiOS desktop app. In a web browser, a page inside a window belongs to that site, so censaiOS cannot filter it. An ad blocker added to your browser, such as uBlock Origin, covers those windows too.';
  return (
    <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 11 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 750, color: 'var(--ink)' }}>Block ads on web pages</div>
          <div style={{ marginTop: 3, fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>{where}</div>
        </div>
        <button
          type="button"
          aria-label="Block ads on web pages"
          aria-pressed={on}
          onClick={() => setOn(!on)}
          style={{ position: 'relative', width: 44, height: 24, borderRadius: 'var(--radius-full)', border: 0, padding: 0, background: on ? 'var(--accent)' : 'oklch(0.5 0 0 / 0.22)', cursor: 'pointer', transition: 'background 0.15s', flex: '0 0 auto' }}
        >
          <span style={{ position: 'absolute', top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'var(--on-fill)', boxShadow: 'var(--elevation-1)', transition: 'left 0.15s' }} />
        </button>
      </div>
    </ThemePanelCard>
  );
}
