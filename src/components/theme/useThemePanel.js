import React from 'react';
import { api } from '../../lib/api.js';
import { DEFAULT_THEME, MOODS, createId, useTheme } from '../Theme.jsx';
import { normalizeSettingsTab, SETTINGS_TABS } from './settingsTabs.js';

export function useThemePanel(initialTab = 'appearance', tabRequestId = null) {
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = React.useState(() => normalizeSettingsTab(initialTab));
  const [moodsExpanded, setMoodsExpanded] = React.useState(false);
  const [customPresets, setCustomPresets] = React.useState([]);
  const [savingPreset, setSavingPreset] = React.useState(false);
  const [presetName, setPresetName] = React.useState('');
  const [activeSurface, setActiveSurface] = React.useState('canvas');
  const [pos, setPos] = React.useState(null);
  const dragStartRef = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    api.getThemeCustomPresets()
      .then(presets => { if (!cancelled) setCustomPresets(presets || []); })
      .catch(err => console.error('Failed to load theme custom presets', err));
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    setTab(normalizeSettingsTab(initialTab));
  }, [initialTab, tabRequestId]);

  const resetTheme = () => setTheme({ ...DEFAULT_THEME });
  const clearOverrides = () => setTheme({ customVars: {} });

  const applyMoodPreset = (name) => {
    const nextMood = MOODS[name] || MOODS.cream;
    setTheme({ mood: name, customVars: {}, ...(nextMood.accent || {}) });
  };

  const randomizeTheme = () => {
    const isDark = Math.random() > 0.5;
    const baseHue = Math.floor(Math.random() * 360);
    // No accent picker anymore: the accent is drawn from the same picked
    // palette (base hue, pushed to full color) so random themes stay coherent.
    const accentHue = baseHue;
    const accentChroma = Number((0.14 + Math.random() * 0.08).toFixed(3));
    const accentLightness = isDark
      ? Number((0.60 + Math.random() * 0.18).toFixed(2))
      : Number((0.45 + Math.random() * 0.18).toFixed(2));
    const rnd = (min, max) => min + Math.random() * (max - min);
    const customVars = {};
    if (isDark) {
      customVars['--bg'] = `oklch(${rnd(0.14, 0.20).toFixed(3)} ${rnd(0.005, 0.020).toFixed(3)} ${baseHue})`;
      customVars['--canvas'] = `oklch(${rnd(0.11, 0.16).toFixed(3)} ${rnd(0.005, 0.020).toFixed(3)} ${baseHue})`;
      customVars['--surface'] = `oklch(${rnd(0.19, 0.25).toFixed(3)} ${rnd(0.005, 0.020).toFixed(3)} ${baseHue})`;
      customVars['--surface-2'] = `oklch(${rnd(0.16, 0.21).toFixed(3)} ${rnd(0.005, 0.015).toFixed(3)} ${baseHue})`;
      customVars['--ink'] = `oklch(${rnd(0.90, 0.96).toFixed(3)} ${rnd(0.002, 0.010).toFixed(3)} ${baseHue})`;
      customVars['--ink-soft'] = `oklch(${rnd(0.70, 0.78).toFixed(3)} ${rnd(0.004, 0.010).toFixed(3)} ${baseHue})`;
      customVars['--hairline'] = `oklch(${rnd(0.28, 0.35).toFixed(3)} ${rnd(0.005, 0.015).toFixed(3)} ${baseHue})`;
      customVars['--hairline-strong'] = `oklch(${rnd(0.38, 0.46).toFixed(3)} ${rnd(0.005, 0.015).toFixed(3)} ${baseHue})`;
    } else {
      customVars['--bg'] = `oklch(${rnd(0.94, 0.98).toFixed(3)} ${rnd(0.005, 0.015).toFixed(3)} ${baseHue})`;
      customVars['--canvas'] = `oklch(${rnd(0.92, 0.96).toFixed(3)} ${rnd(0.005, 0.018).toFixed(3)} ${baseHue})`;
      customVars['--surface'] = `oklch(${rnd(0.97, 0.995).toFixed(3)} ${rnd(0.002, 0.010).toFixed(3)} ${baseHue})`;
      customVars['--surface-2'] = `oklch(${rnd(0.93, 0.97).toFixed(3)} ${rnd(0.005, 0.015).toFixed(3)} ${baseHue})`;
      customVars['--ink'] = `oklch(${rnd(0.18, 0.26).toFixed(3)} ${rnd(0.01, 0.03).toFixed(3)} ${baseHue})`;
      customVars['--ink-soft'] = `oklch(${rnd(0.38, 0.46).toFixed(3)} ${rnd(0.008, 0.02).toFixed(3)} ${baseHue})`;
      customVars['--hairline'] = `oklch(${rnd(0.83, 0.89).toFixed(3)} ${rnd(0.005, 0.015).toFixed(3)} ${baseHue})`;
      customVars['--hairline-strong'] = `oklch(${rnd(0.70, 0.78).toFixed(3)} ${rnd(0.008, 0.02).toFixed(3)} ${baseHue})`;
    }
    setTheme({ mood: isDark ? 'midnight' : 'cream', hue: accentHue, chroma: accentChroma, lightness: accentLightness, customVars });
  };

  const saveCurrentPreset = async () => {
    const fallbackName = `${theme.mood} ${customPresets.length + 1}`;
    const name = (presetName || fallbackName).trim();
    if (!name) return;
    const next = [
      { id: createId(), name, theme: { hue: theme.hue, chroma: theme.chroma, lightness: theme.lightness, mood: theme.mood, customVars: { ...(theme.customVars || {}) } } },
      ...customPresets,
    ].slice(0, 24);
    try {
      await api.saveThemeCustomPresets(next);
      setCustomPresets(next);
      setPresetName('');
      setSavingPreset(false);
    } catch (err) {
      console.error('Failed to save theme custom preset', err);
    }
  };

  const applyCustomPreset = (preset) =>
    setTheme({ ...DEFAULT_THEME, ...preset.theme, customVars: { ...(preset.theme?.customVars || {}) } });

  const deleteCustomPreset = async (id) => {
    const next = customPresets.filter(p => p.id !== id);
    try {
      await api.saveThemeCustomPresets(next);
      setCustomPresets(next);
    } catch (err) {
      console.error('Failed to delete theme custom preset', err);
    }
  };

  const startDrag = (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
    e.preventDefault();
    const dialogEl = e.currentTarget.closest('[role="dialog"]');
    const rect = dialogEl.getBoundingClientRect();
    dragStartRef.current = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top };
    const move = (event) => {
      if (!dragStartRef.current) return;
      setPos({ x: dragStartRef.current.startLeft + (event.clientX - dragStartRef.current.startX), y: dragStartRef.current.startTop + (event.clientY - dragStartRef.current.startY) });
    };
    const up = () => { dragStartRef.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return {
    theme, setTheme, tab, setTab, moodsExpanded, setMoodsExpanded,
    customPresets, savingPreset, setSavingPreset, presetName, setPresetName,
    activeSurface, setActiveSurface, pos, tabs: SETTINGS_TABS,
    resetTheme, clearOverrides, applyMoodPreset, randomizeTheme,
    saveCurrentPreset, applyCustomPreset, deleteCustomPreset,
    startDrag,
  };
}
