/**
 * @jest-environment jsdom
 */
import React from 'react';
import fs from 'node:fs';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DEFAULT_THEME, ThemeProvider, migrateTheme, useTheme } from '../src/components/Theme.jsx';
import { FrostedGlassSection } from '../src/components/theme/FrostedGlassSection.jsx';

function Harness() {
  const { theme, setTheme } = useTheme();
  return <FrostedGlassSection theme={theme} setTheme={setTheme} />;
}

describe('frosted glass', () => {
  beforeEach(() => { localStorage.clear(); });

  test('is on by default and the board marks it on', () => {
    expect(DEFAULT_THEME.frostedGlass).toBe(true);
    render(<ThemeProvider><Harness /></ThemeProvider>);
    expect(screen.getByTestId('frosted-glass-switch')).toBeChecked();
    expect(document.documentElement.getAttribute('data-frost')).toBe('on');
  });

  test('the Settings switch turns it off and the choice is saved', () => {
    render(<ThemeProvider><Harness /></ThemeProvider>);
    act(() => { fireEvent.click(screen.getByTestId('frosted-glass-switch')); });
    expect(screen.getByTestId('frosted-glass-switch')).not.toBeChecked();
    expect(document.documentElement.getAttribute('data-frost')).toBe('off');
    expect(JSON.parse(localStorage.getItem('homebase.theme.v1')).frostedGlass).toBe(false);
  });

  test('an older saved board keeps a glass-off choice when moved to the brand look', () => {
    expect(migrateTheme({ mood: 'graphite', frostedGlass: false }, { light: false }).frostedGlass).toBe(false);
  });

  test('glass off, reduce transparency and no-blur browsers all fall back to solid', () => {
    const css = fs.readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
    expect(css).toMatch(/:root\[data-frost="off"\]\s*\{[^}]*--glass-filter: none/);
    expect(css).toMatch(/prefers-reduced-transparency: reduce\)\s*\{\s*:root:root\s*\{[^}]*--glass-filter: none/);
    expect(css).toMatch(/@supports not \(\(backdrop-filter[^{]*\{\s*:root:root\s*\{[^}]*--glass-filter: none/);
  });
});

describe('glass blur strength', () => {
  beforeEach(() => { localStorage.clear(); });

  test('the slider sets the blur scale on the board and saves it', () => {
    render(<ThemeProvider><Harness /></ThemeProvider>);
    expect(document.documentElement.style.getPropertyValue('--glass-blur-scale')).toBe('1');
    const slider = screen.getByLabelText(/Blur strength/);
    act(() => { fireEvent.change(slider, { target: { value: '1.5' } }); });
    expect(document.documentElement.style.getPropertyValue('--glass-blur-scale')).toBe('1.5');
    expect(JSON.parse(localStorage.getItem('homebase.theme.v1')).glassBlur).toBe(1.5);
  });

  test('the slider hides while glass is off', () => {
    render(<ThemeProvider><Harness /></ThemeProvider>);
    act(() => { fireEvent.click(screen.getByTestId('frosted-glass-switch')); });
    expect(screen.queryByLabelText(/Blur strength/)).toBeNull();
  });
});
