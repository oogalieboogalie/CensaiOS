import React from 'react';
import { useTheme } from '../Theme.jsx';
import { SettingsRow, SettingsRows, SettingsSection, SwitchRow } from './settingsKit.jsx';

const PAN_OPTIONS = [
  { value: 'both', label: 'Space + drag, or the middle mouse button' },
  { value: 'space', label: 'Space + drag' },
  { value: 'middle', label: 'Middle mouse button' },
  { value: 'alt', label: 'Alt (Option on a Mac) + drag' },
];

/** Settings > Canvas: moving around the board. */
export function MovingAroundSection({ focusMode, setFocusMode, penMode, setPenMode }) {
  const { theme, setTheme } = useTheme();
  return (
    <SettingsSection title="Moving around" data-testid="canvas-moving-section">
      <SettingsRows>
        <SettingsRow label="Move the board with" htmlFor="canvas-pan-mode">
          <select id="canvas-pan-mode" className="hb-set-input" aria-label="Canvas pan control"
            value={theme.canvasPanMode || 'both'} onChange={(event) => setTheme({ canvasPanMode: event.target.value })}>
            {PAN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </SettingsRow>
        {typeof penMode !== 'undefined' && (
          <SwitchRow label="Pen mode" hint="A pen draws on the board, and a finger moves it." checked={penMode} onChange={() => setPenMode?.(!penMode)} />
        )}
        {typeof focusMode !== 'undefined' && (
          <SwitchRow label="Focus mode" hint="Fades the top bar and hides the side dock while you work." checked={focusMode} onChange={() => setFocusMode?.(!focusMode)} />
        )}
        <SwitchRow
          label="Show agent cursors"
          hint="Watch an agent's named cursor move to its window and type while it works."
          checked={theme.agentCursors !== false}
          onChange={(on) => setTheme({ agentCursors: on })}
        />
      </SettingsRows>
    </SettingsSection>
  );
}

/** Settings > Canvas: how windows line up and join groups. */
export function WindowsAndGroupsSection() {
  const { theme, setTheme } = useTheme();
  return (
    <SettingsSection
      title="Windows and groups"
      hint="The space between grouped windows and their title bars are in Appearance, under Windows."
      data-testid="canvas-groups-section"
    >
      <SettingsRows>
        <SwitchRow
          label="Snap windows together"
          hint="A window you move lines up with the edges of the windows near it."
          checked={theme.gridSnapping !== false}
          onChange={(on) => setTheme({ gridSnapping: on })}
        />
        <SwitchRow
          label="Dock windows into groups"
          hint="Drop a window on a group and it takes a place in the group's layout."
          checked={theme.groupSnapping !== false}
          onChange={(on) => setTheme({ groupSnapping: on })}
        />
      </SettingsRows>
    </SettingsSection>
  );
}
