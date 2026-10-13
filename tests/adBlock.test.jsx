/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { isAdBlockEnabled, setAdBlockEnabled } from '../src/lib/adBlock.js';
import { AdBlockCard } from '../src/components/theme/AdBlockCard.jsx';

afterEach(() => {
  localStorage.clear();
  delete window.__TAURI__;
});

describe('Block ads on web pages', () => {
  test('is on by default and remembers when it is switched off', () => {
    expect(isAdBlockEnabled()).toBe(true);
    setAdBlockEnabled(false);
    expect(isAdBlockEnabled()).toBe(false);
    setAdBlockEnabled(true);
    expect(isAdBlockEnabled()).toBe(true);
  });

  test('tells the desktop app when the switch changes', () => {
    const invoke = jest.fn(() => Promise.resolve());
    window.__TAURI__ = { core: { invoke } };
    setAdBlockEnabled(false);
    expect(invoke).toHaveBeenCalledWith('adblock_set_enabled', { enabled: false });
  });

  test('the Settings switch flips the setting', () => {
    render(<AdBlockCard />);
    const toggle = screen.getByRole('button', { name: 'Block ads on web pages' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    act(() => { fireEvent.click(toggle); });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(isAdBlockEnabled()).toBe(false);
  });

  test('the web build says plainly where blocking works', () => {
    render(<AdBlockCard />);
    expect(screen.getByText(/Works in the censaiOS desktop app/)).toBeInTheDocument();
  });

  test('the desktop app says what it blocks', () => {
    window.__TAURI__ = { core: { invoke: jest.fn(() => Promise.resolve()) } };
    render(<AdBlockCard />);
    expect(screen.getByText(/EasyList and EasyPrivacy/)).toBeInTheDocument();
  });
});
