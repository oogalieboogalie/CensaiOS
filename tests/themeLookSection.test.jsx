/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { api } from '../src/lib/api.js';
import { ThemeProvider } from '../src/components/Theme.jsx';
import { useThemePanel } from '../src/components/theme/useThemePanel.js';
import { LookSection } from '../src/components/theme/ThemeLookSection.jsx';

function Harness() {
  const panel = useThemePanel();
  return <LookSection {...panel} />;
}

const rootVar = (name) => document.documentElement.style.getPropertyValue(name);

afterEach(() => jest.restoreAllMocks());

beforeEach(() => {
  window.localStorage.removeItem('homebase.theme.v1');
});

describe('Look section', () => {
  test('one click restyles color, radius, density and labels together', async () => {
    jest.spyOn(api, 'getThemeCustomPresets').mockResolvedValue([]);
    render(<ThemeProvider><Harness /></ThemeProvider>);
    await act(async () => {});
    expect(screen.getByTestId('look-graphite')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('look-terminal'));
    expect(document.documentElement.getAttribute('data-mood')).toBe('terminal');
    expect(rootVar('--radius-scale')).toBe('0.25');
    expect(rootVar('--density')).toBe('0.85');
    expect(rootVar('--label-case')).toBe('uppercase');
    expect(screen.getByTestId('look-terminal')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Make your own generates a custom colorway and shape', async () => {
    jest.spyOn(api, 'getThemeCustomPresets').mockResolvedValue([]);
    render(<ThemeProvider><Harness /></ThemeProvider>);
    await act(async () => {});
    fireEvent.click(screen.getByTestId('look-custom'));
    const panel = screen.getByTestId('look-custom-panel');
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.getAttribute('data-mood')).toBe('custom');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    const radius = panel.querySelectorAll('input[type="range"]')[3];
    fireEvent.change(radius, { target: { value: '1.5' } });
    expect(rootVar('--radius-scale')).toBe('1.5');
  });
});
