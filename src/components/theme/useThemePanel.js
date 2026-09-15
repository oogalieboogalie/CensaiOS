import React from 'react';
import { api } from '../../lib/api.js';
import { DEFAULT_THEME, MOODS, createId, useTheme } from '../Theme.jsx';
import { normalizeSettingsTab, SETTINGS_TABS } from './settingsTabs.js';
import { buildRandomThemeCombo } from './randomTheme.js';

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

  const comboHistoryRef = React.useRef([]);
  const randomizeTheme = () => {
    const combo = buildRandomThemeCombo(Math.random, comboHistoryRef.current);
    if (!combo) return;
    comboHistoryRef.current = [...comboHistoryRef.current, combo.signature].slice(-12);
    setTheme(combo.patch);
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
