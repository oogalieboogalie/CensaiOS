// Data hook for the LeadHound window: key status, the hunt itself, saving a
// key to the BYOK vault, and banking a lead in the Lead Queue. The last hunt
// is mirrored into window state (win.leadHound) so it survives a reload.

import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';

export const HUNT_STEPS = [
  { id: 'plan', label: 'Planning searches' },
  { id: 'search', label: 'Searching the web with Tavily' },
  { id: 'score', label: 'Scoring fit' },
  { id: 'enrich', label: 'Finding contact details' },
  { id: 'draft', label: 'Drafting sequences and ice breakers' },
];

async function readJson(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || fallback);
  return data;
}

export function useLeadHound({ win = {}, onUpdate } = {}) {
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const saved = win.leadHound || {};
  const [keyStatus, setKeyStatus] = React.useState({ loading: true, configured: false, source: null });
  const [result, setResult] = React.useState(saved.result || null);
  const [running, setRunning] = React.useState(false);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [error, setError] = React.useState('');

  const loadStatus = React.useCallback(async () => {
    try {
      const data = await readJson(await fetch('/api/leadhound/status'), 'Status check failed');
      setKeyStatus({ loading: false, configured: Boolean(data?.tavily?.configured), source: data?.tavily?.source || null });
    } catch {
      setKeyStatus({ loading: false, configured: false, source: null });
    }
  }, []);

  React.useEffect(() => { loadStatus(); }, [loadStatus]);

  // The server answers in one response; walk the visible steps meanwhile so
  // the user sees where a long hunt is, capped before the last step.
  React.useEffect(() => {
    if (!running) return undefined;
    setStepIndex(0);
    const timer = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, HUNT_STEPS.length - 1));
    }, 6000);
    return () => clearInterval(timer);
  }, [running]);

  const hunt = React.useCallback(async (brief) => {
    if (running) return;
    setRunning(true);
    setError('');
    try {
      const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
      const data = await readJson(await fetch(`/api/leadhound/run${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brief),
      }), 'Hunt failed');
      setResult(data);
      onUpdate?.({ leadHound: { brief, result: data } });
    } catch (err) {
      setError(err.message || 'Hunt failed');
    } finally {
      setRunning(false);
    }
  }, [running, workspaceId, onUpdate]);

  const saveTavilyKey = React.useCallback(async (apiKey) => {
    await readJson(await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'tavily', apiKey }),
    }), 'Could not save the key');
    await loadStatus();
  }, [loadStatus]);

  const bankLead = React.useCallback(async (lead) => {
    const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    return readJson(await fetch(`/api/leadhound/save${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead }),
    }), 'Could not save the lead');
  }, [workspaceId]);

  const reset = React.useCallback(() => {
    setResult(null);
    setError('');
    onUpdate?.({ leadHound: { brief: saved.brief || null, result: null } });
  }, [onUpdate, saved.brief]);

  return {
    keyStatus, result, running, stepIndex, error,
    initialBrief: saved.brief || null,
    hunt, saveTavilyKey, bankLead, reset,
  };
}
