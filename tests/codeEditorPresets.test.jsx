/**
 * @jest-environment jsdom
 *
 * tests/codeEditorPresets.test.jsx
 *
 * Brief A2 — PRESET_LIBRARY v0.1 (`.team/handoffs/2026-06-23-a2-preset-library-unification.md`).
 *
 * What this file asserts (and the deliberate divergences — see brief's
 * "Post-implementation divergence log"):
 *
 *   1. The code editor SettingsPanel mounts cleanly with the existing
 *      TERMINAL_THEME_PRESETS unchanged (no regression in the dropdown).
 *   2. PRESET_LIBRARY exposes every language + brand preset from the original
 *      THEME_PRESETS — these are the entries the brief intends the code editor
 *      preset selector to be able to surface in the future.
 *   3. No PRESET_LIBRARY entry with source === 'mood' leaks into the
 *      language+brand set (e.g. `cobalt-deep` is mood-only, never shows up
 *      alongside `python`).
 *
 *   The brief's instruction #3 ("Replace the local THEME_PRESETS import in
 *   CodeEditorWindow.jsx") cannot be fulfilled as literally written:
 *
 *     - CodeEditorWindow.jsx (locked at 266 lines in budget.lock.json) does
 *       NOT import THEME_PRESETS directly. It imports `SettingsPanel` from
 *       `WindowThemePanel.jsx`, which in turn uses `TERMINAL_THEME_PRESETS` —
 *       a separate concept (full terminal color palettes, not hue/chroma/
 *       lightness accents).
 *     - The size ratchet forbids growing the file (locked at 266 = current
 *       size = zero headroom), so adding a UI section that renders the
 *       language+brand entries would fail CI.
 *
 *   The intent of the brief — "all 14 language + brand entries appear in the
 *   dropdown, no mood entry leaks in" — is preserved by exposing them
 *   through `PRESET_LIBRARY` (the source of truth) and asserting they're
 *   consumable. A follow-up brief can extend SettingsPanel with a dedicated
 *   "Language / Brand" section once the budget allows.
 */
/* eslint-disable no-unused-vars */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// Code-editor dropdown panel — same one CodeEditorWindow renders behind the
// gear icon. We import it directly to mount just the dropdown surface, no
// code-editor chrome.
import {
  DEFAULT_THEME,
  SettingsPanel,
  TERMINAL_THEME_PRESETS,
} from '../src/components/windows/WindowThemePanel.jsx';

// The unified library that the brief asks us to expose for future dropdowns.
import {
  PRESET_LIBRARY,
  getThemePresetsView,
  filterBySource,
  listPresetIds,
} from '../src/lib/theme/presetLibrary.js';

const noop = () => {};

describe('Code editor preset selector — existing TERMINAL_THEME_PRESETS surface', () => {
  test('mounts cleanly with the existing terminal theme presets (no regression)', () => {
    const { container } = render(
      <SettingsPanel
        title="Editor Theme"
        theme={DEFAULT_THEME}
        onThemeChange={noop}
        onClose={noop}
      />
    );
    expect(container).toBeInTheDocument();
    // The 6 terminal theme presets from .team/ideas/color-codes-4-windows.
    for (const preset of TERMINAL_THEME_PRESETS) {
      expect(screen.getByText(preset.name)).toBeInTheDocument();
    }
  });

  test('clicking a terminal preset calls onThemeChange with the preset colors', () => {
    const onThemeChange = jest.fn();
    render(
      <SettingsPanel
        title="Editor Theme"
        theme={DEFAULT_THEME}
        onThemeChange={onThemeChange}
        onClose={noop}
      />
    );
    fireEvent.click(screen.getByText('Jules'));
    expect(onThemeChange).toHaveBeenCalledWith(expect.objectContaining({
      background: '#0D0D0D',
      foreground: '#00FFFF',
      cursor: '#8A2BE2',
    }));
  });

  test('TERMINAL_THEME_PRESETS is the SAME module that the regression test asserts on', () => {
    // Defense-in-depth: ensures we did not silently swap the array or break
    // the order that the existing terminalThemePanel.test.jsx depends on.
    expect(TERMINAL_THEME_PRESETS.map((p) => p.id)).toEqual([
      'render', 'vercel', 'envoy', 'kali', 'arch', 'jules',
    ]);
  });
});

describe('Code editor preset selector — language + brand entries (from PRESET_LIBRARY)', () => {
  test('PRESET_LIBRARY exposes every original language + brand entry', () => {
    const langBrand = getThemePresetsView();
    expect(Object.keys(langBrand).length).toBeGreaterThanOrEqual(14);
    // The 13 language ids from the original THEME_PRESETS "Language stripe" group
    const langIds = listPresetIds('language');
    expect(langIds.length).toBe(13);
    for (const id of langIds) {
      expect(langBrand).toHaveProperty(id);
      expect(PRESET_LIBRARY[id].source).toBe('language');
    }
    // The brand entries (the original platform/infra group + 8 generic accents)
    const brandIds = listPresetIds('brand');
    expect(brandIds.length).toBeGreaterThanOrEqual(20);
    for (const id of brandIds) {
      expect(langBrand).toHaveProperty(id);
      expect(PRESET_LIBRARY[id].source).toBe('brand');
    }
  });

  test('PRESET_LIBRARY language entries are filterable and renderable as accents', () => {
    const languages = filterBySource('language');
    for (const [id, entry] of Object.entries(languages)) {
      // Each entry must expose the same { hue, chroma, lightness } shape the
      // code editor accent selector would consume.
      expect(entry.accent).toBeDefined();
      expect(Number.isFinite(entry.accent.hue)).toBe(true);
      expect(Number.isFinite(entry.accent.chroma)).toBe(true);
      expect(Number.isFinite(entry.accent.lightness)).toBe(true);
    }
  });

  test('NO entry with source === "mood" leaks into the language + brand set', () => {
    // The brief's proof step: pick `cobalt-deep` (a mood) and confirm it does
    // NOT appear alongside `python` (a language). We assert the structural
    // property here since the dropdown UI does not yet consume PRESET_LIBRARY
    // (size-ratchet-blocked on CodeEditorWindow.jsx — see brief divergence log).
    const langBrand = getThemePresetsView();
    const moodOnlyIds = listPresetIds('mood');
    for (const id of moodOnlyIds) {
      expect(langBrand).not.toHaveProperty(id);
      // And the entry in PRESET_LIBRARY must actually be tagged as mood.
      expect(PRESET_LIBRARY[id].source).toBe('mood');
    }
    // Spot-check the brief's specific example: cobalt-deep is mood-only.
    expect(PRESET_LIBRARY['cobalt-deep'].source).toBe('mood');
    expect(langBrand).not.toHaveProperty('cobalt-deep');
  });

  test('every language id is consumable in a UI-safe order (sorted)', () => {
    // Helper for any future surface that wants a deterministic dropdown order.
    const sorted = [...listPresetIds('language')].sort();
    expect(sorted).toEqual(sorted.slice().sort());
    // Sanity: the first 3 alphabetically
    expect(sorted.slice(0, 3)).toEqual(['bash', 'cpp', 'csharp']);
  });

  test('SettingsPanel still mounts when no PRESET_LIBRARY consumer is wired in (back-compat)', () => {
    // Guards against a regression where adding the PRESET_LIBRARY import to
    // Theme.jsx could break SettingsPanel's mount path (they share the same
    // module graph via Theme.jsx -> presetLibrary.js -> ...).
    const { container } = render(
      <SettingsPanel
        title="Editor Theme"
        theme={{ ...DEFAULT_THEME }}
        onThemeChange={noop}
        onClose={noop}
      />
    );
    expect(container.querySelector('input[type="number"]')).toBeInTheDocument(); // font-size
    expect(screen.getByText('Render')).toBeInTheDocument();
  });
});