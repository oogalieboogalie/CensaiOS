// Data hook for the LeadHound window: key status, the hunt itself (streamed
// step by step), saving a key to the BYOK vault, banking a lead in the Lead
// Queue, and edits to the drafted outreach. The last hunt lives in window
// state (win.leadHound), so it survives a reload and teammates on the same
// board see the same leads and the same edits.

import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';

export const HUNT_STEPS = [
  { id: 'plan', label: 'Planning searches' },
  { id: 'search', label: 'Searching the web with Tavily' },
  { id: 'score', label: 'Scoring fit' },
  { id: 'enrich', label: 'Finding contact details' },
  { id: 'draft', label: 'Drafting sequences and ice breakers' },
];

const stepIndexOf = (id) => Math.max(0, HUNT_STEPS.findIndex((s) => s.id === id));

// Tavily errors that a new key fixes; the window offers the key field again.
export const KEY_ERROR_CODES = new Set(['TAVILY_KEY_REQUIRED', 'TAVILY_KEY_INVALID', 'TAVILY_OUT_OF_CREDITS']);

const failure = (message, code) => Object.assign(new Error(message), { code });

async function readJson(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw failure(data?.error || fallback, data?.code);
  return data;
}

// Reads an application/x-ndjson hunt: step lines go to onLine, the result
// line is returned, an error line throws.
export async function readHuntStream(res, onLine) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  const take = (line) => {
    if (!line.trim()) return;
    const msg = JSON.parse(line);
    if (msg.type === 'error') throw failure(msg.error || 'Hunt failed', msg.code);
    if (msg.type === 'result') {
      const { type, ...rest } = msg;
      result = rest;
    } else {
      onLine(msg);
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach(take);
    if (done) break;
  }
  take(buffer);
  if (!result) throw new Error('The hunt ended before it finished. Try again.');
  return result;
}

export function useLeadHound({ win = {}, onUpdate } = {}) {
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const saved = win.leadHound || {};
  const [keyStatus, setKeyStatus] = React.useState({ loading: true, configured: false, source: null });
  const [result, setResult] = React.useState(saved.result || null);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState({ stepIndex: 0, details: {} });
  const [error, setError] = React.useState('');
  const [errorCode, setErrorCode] = React.useState(null);
  const resultRef = React.useRef(result);
  resultRef.current = result;

  // A teammate's hunt or edit arrives through window state.
  React.useEffect(() => {
    if (saved.result !== undefined && saved.result !== resultRef.current) setResult(saved.result || null);
  }, [saved.result]);

  const loadStatus = React.useCallback(async () => {
    try {
      const data = await readJson(await fetch('/api/leadhound/status'), 'Status check failed');
      setKeyStatus({ loading: false, configured: Boolean(data?.tavily?.configured), source: data?.tavily?.source || null });
    } catch {
      setKeyStatus({ loading: false, configured: false, source: null });
    }
  }, []);

  React.useEffect(() => { loadStatus(); }, [loadStatus]);

  const hunt = React.useCallback(async (brief) => {
    if (running) return;
    setRunning(true);
    setError('');
    setErrorCode(null);
    setProgress({ stepIndex: 0, details: {} });
    try {
      const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
      const res = await fetch(`/api/leadhound/run${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
        body: JSON.stringify(brief),
      });
      const type = res.headers?.get?.('content-type') || '';
      const data = res.ok && type.includes('ndjson') && res.body?.getReader
        ? await readHuntStream(res, ({ step, type: _t, ...detail }) => {
          setProgress((p) => ({ stepIndex: stepIndexOf(step), details: { ...p.details, [step]: { ...p.details[step], ...detail } } }));
        })
        : await readJson(res, 'Hunt failed');
      setResult(data);
      onUpdate?.({ leadHound: { brief, result: data } });
    } catch (err) {
      setError(err.message || 'Hunt failed');
      setErrorCode(err.code || null);
    } finally {
      setRunning(false);
    }
  }, [running, workspaceId, onUpdate]);

  const updateLead = React.useCallback((index, patch) => {
    const current = resultRef.current;
    if (!current?.leads?.[index]) return;
    const leads = current.leads.map((lead, i) => (i === index ? { ...lead, ...patch } : lead));
    const next = { ...current, leads };
    resultRef.current = next;
    setResult(next);
    onUpdate?.({ leadHound: { brief: saved.brief || current.brief || null, result: next } });
  }, [onUpdate, saved.brief]);

  const saveTavilyKey = React.useCallback(async (apiKey) => {
    await readJson(await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'tavily', apiKey }),
    }), 'Could not save the key');
    setError('');
    setErrorCode(null);
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
    resultRef.current = null;
    setError('');
    // The wake-up sample hunt's brief is not theirs; start them on a blank form.
    onUpdate?.({ leadHound: { brief: saved.sample ? null : saved.brief || null, result: null } });
  }, [onUpdate, saved.brief, saved.sample]);

  return {
    keyStatus, result, running, progress, error, errorCode,
    initialBrief: saved.brief || null,
    hunt, saveTavilyKey, bankLead, reset, updateLead,
  };
}
