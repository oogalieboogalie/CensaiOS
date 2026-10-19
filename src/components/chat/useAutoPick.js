import React from 'react';
import { api } from '../../lib/api.js';
import { KEYS_CHANGED_EVENT } from '../../lib/api/keys.js';
import { updateAgent } from '../../lib/agentStore.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { autoPickModel } from '../../lib/modelStrengths/autoPick.js';

const BENCHMARKS_KIND = 'arenaBenchmarks';
const NO_RUNS = [];

/**
 * Diagram 14, "model strengths": with Auto-pick on, each message is read
 * before it is sent and the agent switches to the model best at that kind of
 * task (Alex's strengths list, tipped by the board's Benchmarks). The last
 * pick and its "why" live on the window so the note survives a reload.
 */
export function useAutoPick({ win, onUpdate, agent }) {
  const on = Boolean(win.autoModel) && !win.demoMode;
  const runs = useWorkspaceStore((s) => (s.wins || []).find((w) => w.kind === BENCHMARKS_KIND)?.runs) || NO_RUNS;
  const [keyProviders, setKeyProviders] = React.useState([]);
  const [keysVersion, setKeysVersion] = React.useState(0);

  React.useEffect(() => {
    const bump = () => setKeysVersion((v) => v + 1);
    window.addEventListener(KEYS_CHANGED_EVENT, bump);
    return () => window.removeEventListener(KEYS_CHANGED_EVENT, bump);
  }, []);

  React.useEffect(() => {
    if (win.demoMode) return undefined;
    let cancelled = false;
    api.getUserKeys()
      .then((rows) => { if (!cancelled) setKeyProviders((rows || []).filter((r) => r.hasKey !== false).map((r) => r.provider)); })
      .catch(() => { /* no keys known: the pick keeps the current model */ });
    return () => { cancelled = true; };
  }, [win.demoMode, keysVersion]);

  const current = { provider: agent?.model_provider || agent?.modelProvider || null, model: agent?.model_name || agent?.modelName || '' };

  /** Pick for this message and switch the agent if a better model fits. */
  const beforeSend = React.useCallback(async (text) => {
    if (!on || !agent) return;
    const result = autoPickModel({ text, keyProviders, runs, current });
    const at = new Date().toISOString();
    if (result.keep) {
      onUpdate({ autoPick: { keep: true, why: result.why, model: current.model, at } });
      return;
    }
    if (result.changed) {
      const updated = { ...agent, model_provider: result.provider, model_name: result.model };
      try {
        await api.saveAgent(updated);
        updateAgent(updated);
      } catch (err) {
        onUpdate({ autoPick: { keep: true, why: `Could not switch to ${result.model}: ${err?.message || 'save failed'}.`, model: current.model, at } });
        return;
      }
    }
    const { provider, model, family, strength, why } = result;
    onUpdate({ autoPick: { provider, model, family, strength, why, at } });
  }, [on, agent, keyProviders, runs, current.provider, current.model, onUpdate]);

  const setAuto = React.useCallback((value) => {
    onUpdate(value ? { autoModel: true } : { autoModel: false, autoPick: null });
  }, [onUpdate]);

  return { on, pick: on ? win.autoPick || null : null, beforeSend, setAuto, keyProviders };
}
