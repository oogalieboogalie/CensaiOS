/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import {
  DEFAULT_THEME,
  SettingsPanel,
  TERMINAL_THEME_PRESETS,
} from '../src/components/windows/WindowThemePanel.jsx';

describe('Terminal theme customization panel', () => {
  test('exposes the presets captured in the team ideas palette', () => {
    expect(TERMINAL_THEME_PRESETS.map((preset) => preset.name)).toEqual([
      'Render',
      'Vercel',
      'Envoy',
      'Kali Linux',
      'Arch Linux',
      'Jules',
    ]);
  });

  test('applies a preset without dropping the current font size', () => {
    const onThemeChange = jest.fn();
    const theme = { ...DEFAULT_THEME, fontSize: 18 };

    render(
      <SettingsPanel
        title="Terminal Theme"
        theme={theme}
        onThemeChange={onThemeChange}
        onClose={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText('Jules'));

    expect(onThemeChange).toHaveBeenCalledWith(expect.objectContaining({
      background: '#0D0D0D',
      foreground: '#00FFFF',
      cursor: '#8A2BE2',
      fontSize: 18,
    }));
  });

  test('does not commit invalid hex color drafts', () => {
    const onThemeChange = jest.fn();

    const { container } = render(
      <SettingsPanel
        title="Terminal Theme"
        theme={DEFAULT_THEME}
        onThemeChange={onThemeChange}
        onClose={jest.fn()}
      />
    );

    const backgroundInput = container.querySelector('input[type="text"]');
    fireEvent.change(backgroundInput, { target: { value: '#12345G' } });

    expect(onThemeChange).not.toHaveBeenCalled();
  });

  test('closes with Escape', () => {
    const onClose = jest.fn();
    render(
      <SettingsPanel
        title="Terminal Theme"
        theme={DEFAULT_THEME}
        onThemeChange={jest.fn()}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
