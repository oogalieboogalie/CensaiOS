/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { DEFAULT_THEME, MOODS, ThemeProvider } from '../src/components/Theme.jsx';
import { ColorSettingsPanel } from '../src/components/ColorSettingsPanel.jsx';

const THEME_KEY = 'homebase.theme.v1';
const ids = Object.keys(MOODS);
const other = ids.find((id) => id !== DEFAULT_THEME.mood) || ids[1];

function renderPanel(props = {}) {
  return render(
    <ThemeProvider>
      <ColorSettingsPanel onClose={jest.fn()} {...props} />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  window.localStorage.removeItem(THEME_KEY);
});

describe('ColorSettingsPanel', () => {
  test('renders the preset list and preview without crashing', () => {
    renderPanel();
    expect(screen.getByTestId('color-settings-panel')).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Theme presets' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: other })).toBeInTheDocument();
  });

  test('Apply writes the staged preset to the theme store', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('option', { name: other }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(document.documentElement.getAttribute('data-mood')).toBe(other);
  });

  test('Reset reverts an unapplied pick', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('option', { name: other }));
    expect(screen.getByRole('option', { name: other })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByRole('option', { name: other })).toHaveAttribute('aria-selected', 'false');
    expect(document.documentElement.getAttribute('data-mood')).toBe(DEFAULT_THEME.mood);
  });

  test('Cancel closes without writing', () => {
    const onClose = jest.fn();
    renderPanel({ onClose });
    fireEvent.click(screen.getByRole('option', { name: other }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.documentElement.getAttribute('data-mood')).toBe(DEFAULT_THEME.mood);
  });
});
