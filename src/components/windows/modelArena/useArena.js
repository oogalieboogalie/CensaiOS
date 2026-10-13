import React from 'react';
import { DEFAULT_LANES, MAX_LANES } from '../../../lib/modelArena/arenaCatalog.js';
import { applyArenaEvent, emptyResult, runArena } from '../../../lib/modelArena/runArena.js';

// Saved on the board (and synced to everyone on it), so keep it modest.
const SAVED_TEXT_LIMIT = 8_000;
const sameLanes = (a = [], b = []) => a.length === b.length && a.every((lane, i) => lane.provider === b[i]?.provider && lane.model === b[i]?.model);

/**
 * State for the arena window. The picked models, the last request and the
 * last finished race are saved on the window, so they survive a reload; the
 * words streaming in live only in this browser until the race ends.
 */
export function useArena(win = {}, onUpdate) {
  const lanes = Array.isArray(win.lanes) && win.lanes.length ? win.lanes.slice(0, MAX_LANES) : DEFAULT_LANES;
  const [prompt, setPrompt] = React.useState(win.prompt || '');
  const [system, setSystem] = React.useState(win.system || '');
  const [results, setResults] = React.useState(() => (
    sameLanes(win.lastRun?.lanes, lanes) ? win.lastRun.results : []
  ));
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState('');
  const latest = React.useRef(results);
  const abortRef = React.useRef(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const setLanes = React.useCallback((next) => {
    setResults([]);
    latest.current = [];
    onUpdate?.({ lanes: next.slice(0, MAX_LANES), lastRun: null });
  }, [onUpdate]);

  const run = React.useCallback(async () => {
    if (running || !prompt.trim() || !lanes.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const start = lanes.map(emptyResult);
    latest.current = start;
    setResults(start);
    setError('');
    setRunning(true);
    try {
      await runArena({
        prompt, system, models: lanes, signal: controller.signal,
        onEvent: (event) => {
          latest.current = applyArenaEvent(latest.current, event);
          setResults(latest.current);
        },
      });
    } catch (failure) {
      if (failure?.name !== 'AbortError') setError(failure.message || 'The race could not start.');
    } finally {
      setRunning(false);
      abortRef.current = null;
      // A stopped lane keeps what it had written, marked as stopped.
      latest.current = latest.current.map((r) => (r.status === 'done' || r.status === 'error' ? r : { ...r, status: 'stopped' }));
      setResults(latest.current);
      const saved = latest.current.map((r) => ({ ...r, text: String(r.text || '').slice(0, SAVED_TEXT_LIMIT) }));
      onUpdate?.({ prompt, system, lastRun: { at: new Date().toISOString(), lanes, results: saved } });
    }
  }, [running, prompt, system, lanes, onUpdate]);

  const stop = React.useCallback(() => abortRef.current?.abort(), []);
  const pickSample = React.useCallback((task) => { setPrompt(task.prompt); setSystem(task.system || ''); }, []);

  return { lanes, setLanes, prompt, setPrompt, system, setSystem, results, running, error, run, stop, pickSample };
}
