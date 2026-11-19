import React from 'react';
import { useAdBlockEnabled } from '../../lib/adBlock.js';
import { hasNativeBrowserPane } from '../../lib/nativeBrowserPane.js';
import { YorName } from '../yorware/YorSecurity.jsx';
import { SettingsSection, SwitchRow } from './settingsKit.jsx';

/** Settings > Canvas: the "Block ads on web pages" switch. */
export function AdBlockCard() {
  const [on, setOn] = useAdBlockEnabled();
  const where = hasNativeBrowserPane()
    ? 'Stops ads and trackers in Browser and Search windows, using the EasyList and EasyPrivacy lists built into the app. Works offline. Applies to the next page you open.'
    : 'Works in the censaiOS desktop app. In a web browser, a page inside a window belongs to that site, so censaiOS cannot filter it. An ad blocker added to your browser, such as uBlock Origin, covers those windows too.';
  return (
    <SettingsSection title="Web pages" badge={<YorName id="dunedain" />} data-testid="ad-block-section">
      <SwitchRow label="Block ads on web pages" hint={where} checked={on} onChange={setOn} />
    </SettingsSection>
  );
}
