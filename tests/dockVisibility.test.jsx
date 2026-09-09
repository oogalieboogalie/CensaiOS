/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars */
/**
 * tests/dockVisibility.test.jsx
 *
 * Brief B3 — `.team/handoffs/2026-06-23-b3-sidebar-visibility.md`.
 *
 * Asserts:
 *   1. `MultiGroupDock` renders the collapsed marker when `visible: false`.
 *   2. The collapsed marker opens the visibility toggle on click.
 *   3. `MultiGroupDock` renders the full dock (with groups + add-group
 *      button + the visibility-toggle button) when `visible: true`.
 *   4. The visibility toggle's master switch flips the store's `dock.visible`.
 *   5. The persistence round-trip — set visible, read from store, assert.
 *   6. Per-group + per-agent setters update the store's `dock` object.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MultiGroupDock } from '../src/components/Dock.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';
import {
  DEFAULT_DOCK_VISIBILITY,
  setDockVisible,
  setGroupVisible,
  setAgentVisible,
  isGroupVisible,
  isAgentVisible,
} from '../src/components/dock/useDockVisibility.js';

const DEFAULT_GROUPS = [
  { id: 'core', name: 'Core Team', hue: 5, agentIds: ['architect', 'censai', 'atlas'], collapsed: false },
];

const originalState = useWorkspaceStore.getState();

beforeEach(() => {
  act(() => {
    useWorkspaceStore.setState({
      dock: { visible: false, groupOverrides: {} },
      setDock: originalState.setDock,
    });
  });
});

afterAll(() => {
  act(() => {
    useWorkspaceStore.setState(originalState);
  });
});

describe('Brief B3 - dock visibility', () => {
  test('DEFAULT_DOCK_VISIBILITY has visible: false (dock starts hidden)', () => {
    expect(DEFAULT_DOCK_VISIBILITY.visible).toBe(false);
  });

  test('renders the collapsed marker when dock.visible is false', () => {
    render(
      <MultiGroupDock
        groups={DEFAULT_GROUPS}
        onGroupsChange={() => {}}
        focusMode={false}
        dockOffset={0}
        onMoveDock={() => {}}
        onDragAgent={() => {}}
      />
    );
    expect(screen.getByTestId('dock-collapsed-marker')).toBeTruthy();
  });

  test('renders the full dock + visibility toggle button when dock.visible is true', () => {
    act(() => {
      useWorkspaceStore.setState({ dock: { visible: true, groupOverrides: {} } });
    });
    render(
      <MultiGroupDock
        groups={DEFAULT_GROUPS}
        onGroupsChange={() => {}}
        focusMode={false}
        dockOffset={0}
        onMoveDock={() => {}}
        onDragAgent={() => {}}
      />
    );
    expect(screen.queryByTestId('dock-collapsed-marker')).toBeNull();
    expect(screen.getByTestId('dock-visibility-btn')).toBeTruthy();
  });

  test('clicking the visibility toggle button opens the popover', () => {
    act(() => {
      useWorkspaceStore.setState({ dock: { visible: true, groupOverrides: {} } });
    });
    render(
      <MultiGroupDock
        groups={DEFAULT_GROUPS}
        onGroupsChange={() => {}}
        focusMode={false}
        dockOffset={0}
        onMoveDock={() => {}}
        onDragAgent={() => {}}
      />
    );
    act(() => {
      fireEvent.click(screen.getByTestId('dock-visibility-btn'));
    });
    expect(screen.getByTestId('dock-visibility-toggle')).toBeTruthy();
  });

  test('clicking the same gear closes the popover and outside click dismisses it', () => {
    act(() => useWorkspaceStore.setState({ dock: { visible: true, groupOverrides: {} } }));
    render(<MultiGroupDock groups={DEFAULT_GROUPS} onGroupsChange={() => {}} focusMode={false} dockOffset={0} onMoveDock={() => {}} onDragAgent={() => {}} />);
    const gear = screen.getByTestId('dock-visibility-btn');
    fireEvent.click(gear);
    fireEvent.mouseDown(gear);
    fireEvent.click(gear);
    expect(screen.queryByTestId('dock-visibility-toggle')).toBeNull();
    fireEvent.click(gear);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('dock-visibility-toggle')).toBeNull();
  });

  test('group and agent switches control the rendered rails', () => {
    act(() => useWorkspaceStore.setState({ dock: { visible: true, groupOverrides: {} } }));
    const { container } = render(<MultiGroupDock groups={DEFAULT_GROUPS} onGroupsChange={() => {}} focusMode={false} dockOffset={0} onMoveDock={() => {}} onDragAgent={() => {}} />);
    fireEvent.click(screen.getByTestId('dock-visibility-btn'));
    expect(container.querySelector('[data-dock-group="core"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Show architect' }));
    expect(container.querySelector('[data-dock-agent="architect"]')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Show Core Team' }));
    expect(container.querySelector('[data-dock-group="core"]')).toBeNull();
  });

  test('toggling the master switch updates the store', () => {
    act(() => {
      useWorkspaceStore.setState({ dock: { visible: false, groupOverrides: {} } });
    });
    render(
      <MultiGroupDock
        groups={DEFAULT_GROUPS}
        onGroupsChange={() => {}}
        focusMode={false}
        dockOffset={0}
        onMoveDock={() => {}}
        onDragAgent={() => {}}
      />
    );
    // Click the collapsed marker to open the toggle.
    act(() => {
      fireEvent.click(screen.getByTestId('dock-collapsed-marker'));
    });
    const masterSwitch = screen.getByRole('switch', { name: 'Show dock' });
    act(() => {
      fireEvent.click(masterSwitch);
    });
    expect(useWorkspaceStore.getState().dock.visible).toBe(true);
  });
});

describe('Brief B3 - isGroupVisible / isAgentVisible derivation', () => {
  test('isGroupVisible returns false when master dock.visible is false', () => {
    expect(isGroupVisible({ visible: false }, 'core', ['architect'])).toBe(false);
  });

  test('isGroupVisible falls back to groupOverrides[groupId].visible', () => {
    const dock = { visible: true, groupOverrides: { core: { visible: false } } };
    expect(isGroupVisible(dock, 'core', ['architect'])).toBe(false);
  });

  test('isGroupVisible returns true when group override is true', () => {
    const dock = { visible: true, groupOverrides: { core: { visible: true } } };
    expect(isGroupVisible(dock, 'core', ['architect'])).toBe(true);
  });

  test('isAgentVisible respects group + agent overrides', () => {
    const dock = { visible: true, groupOverrides: { core: { visible: true, agentOverrides: { architect: false } } } };
    expect(isAgentVisible(dock, 'core', 'architect', ['architect', 'censai'])).toBe(false);
    expect(isAgentVisible(dock, 'core', 'censai', ['architect', 'censai'])).toBe(true);
  });

  test('setDockVisible / setGroupVisible / setAgentVisible return new state objects', () => {
    const a = setDockVisible(undefined, true);
    expect(a.visible).toBe(true);
    const b = setGroupVisible(a, 'core', true);
    expect(b.groupOverrides.core.visible).toBe(true);
    const c = setAgentVisible(b, 'core', 'architect', false);
    expect(c.groupOverrides.core.agentOverrides.architect).toBe(false);
    // Pure: original not mutated.
    expect(a.groupOverrides).toEqual({});
  });
});
