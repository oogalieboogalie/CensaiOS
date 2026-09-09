/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars */
/**
 * tests/marketplaceWindow.test.jsx
 *
 * Brief B2 — `.team/handoffs/2026-06-23-b2-marketplace-window.md`.
 *
 * Mount tests for the MarketplaceWindow component:
 *   1. Renders without crashing.
 *   2. Tabs render with the four documented categories.
 *   3. Switching tabs updates the visible rows.
 *   4. Search filters rows by label/description.
 *   5. Toggling a row updates the workspace's windowAllowList via the
 *      B1 setWindowAllowed action.
 *   6. Selection round-trips through the store.
 */
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MarketplaceWindow } from '../src/components/MarketplaceWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';
import { filterCatalogBySearch } from '../src/lib/marketplace/registry.js';

// Snapshot the initial store so we can restore between tests.
const originalState = useWorkspaceStore.getState();

beforeEach(() => {
  // Reset the store to a known state. windowAllowList is the field B2 cares
  // about; everything else can stay default.
  act(() => {
    useWorkspaceStore.setState({
      windowAllowList: {},
      setWindowAllowed: originalState.setWindowAllowed,
    });
  });
});

afterAll(() => {
  act(() => {
    useWorkspaceStore.setState(originalState);
  });
});

describe('Brief B2 - MarketplaceWindow panel', () => {
  test('renders all four tabs', () => {
    render(<MarketplaceWindow />);
    expect(screen.getByTestId('marketplace-tab-window')).toBeTruthy();
    expect(screen.getByTestId('marketplace-tab-agent')).toBeTruthy();
    expect(screen.getByTestId('marketplace-tab-integration')).toBeTruthy();
    expect(screen.getByTestId('marketplace-tab-theme')).toBeTruthy();
  });

  test('search input is present and starts empty', () => {
    render(<MarketplaceWindow />);
    const search = screen.getByTestId('marketplace-search');
    expect(search).toBeTruthy();
    expect(search.value).toBe('');
  });

  test('switching tabs updates the visible rows', () => {
    render(<MarketplaceWindow />);
    // Default tab is 'window'. Switch to 'theme'.
    act(() => {
      fireEvent.click(screen.getByTestId('marketplace-tab-theme'));
    });
    // Theme rows include 'cobalt-deep' (from PRESET_LIBRARY mood source).
    expect(screen.queryByTestId('marketplace-row-cobalt-deep')).toBeTruthy();
  });

  test('search filters rows by label (case-insensitive)', () => {
    render(<MarketplaceWindow />);
    const search = screen.getByTestId('marketplace-search');
    act(() => {
      fireEvent.change(search, { target: { value: 'chat' } });
    });
    // The Chat window row should be visible. Other rows hidden.
    expect(screen.queryByTestId('marketplace-row-chat')).toBeTruthy();
    // 'terminal' should not be visible while searching for 'chat'.
    expect(screen.queryByTestId('marketplace-row-terminal')).toBeNull();
  });

  test('toggling a row flips the corresponding entry in windowAllowList', () => {
    render(<MarketplaceWindow />);
    const chatToggle = screen.getByTestId('marketplace-toggle-chat');
    // Initial state: chat not in windowAllowList.
    expect(useWorkspaceStore.getState().windowAllowList.chat).toBeFalsy();
    act(() => {
      fireEvent.click(chatToggle);
    });
    // After toggle: chat = true.
    expect(useWorkspaceStore.getState().windowAllowList.chat).toBe(true);
    act(() => {
      fireEvent.click(chatToggle);
    });
    // After second toggle: chat = false.
    expect(useWorkspaceStore.getState().windowAllowList.chat).toBe(false);
  });

  test('toggle button reflects the current allow-list state', () => {
    // Pre-seed the store: chat = true.
    act(() => {
      useWorkspaceStore.setState({ windowAllowList: { chat: true } });
    });
    render(<MarketplaceWindow />);
    const chatToggle = screen.getByTestId('marketplace-toggle-chat');
    expect(chatToggle.textContent).toBe('On');
    expect(chatToggle.getAttribute('aria-checked')).toBe('true');
  });

  test('filterCatalogBySearch round-trip (integration)', () => {
    // Pure-logic check on the same function the panel uses.
    const rows = [
      { kind: 'chat', label: 'Chat' },
      { kind: 'docs', label: 'Docs' },
    ];
    expect(filterCatalogBySearch(rows, 'chat')).toHaveLength(1);
    expect(filterCatalogBySearch(rows, '')).toHaveLength(2);
  });
});