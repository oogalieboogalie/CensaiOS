import React from 'react';
import { getKrakenRequests, previewKraken, releaseKraken, stopKraken } from '../../../lib/api/kraken.js';
import { logToApp } from '../../../lib/appLog/browserLog.js';
import { requestIsOpen } from '../../../lib/kraken/words.js';
import { useWorkspaceStore } from '../../../lib/store.js';
import { useVisibilityAwareInterval } from '../../../lib/usePolling.js';

const OPEN_MS = 4000;
const IDLE_MS = 30000;
const WHERE = { where: 'kraken' };

/**
 * State for the Kraken Request window. The request lives on the server, so
 * closing the window or reloading never stops it; the window keeps only the
 * draft report (on the window, so it survives a reload) and watches the
 * person's requests, more often while one is out.
 */
export function useKraken(win = {}, onUpdate) {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const projectName = useWorkspaceStore((state) => state.currentProject?.name || '');
  const [requests, setRequests] = React.useState([]);
  const [preview, setPreview] = React.useState(null);
  const [skipped, setSkipped] = React.useState(() => new Set());
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');

  const report = win.krakenReport || '';
  const mode = win.krakenMode === 'fix' ? 'fix' : 'writeup';
  const project = win.krakenProject ?? projectName;
  const setDraft = React.useCallback((patch) => {
    setPreview(null);
    setError('');
    onUpdate?.(patch);
  }, [onUpdate]);

  const refresh = React.useCallback(async () => {
    try {
      setRequests(await getKrakenRequests({ workspaceId }));
    } catch {
      // offline or signed out: the next look tries again
    }
  }, [workspaceId]);

  const open = requests.find(requestIsOpen) || null;
  React.useEffect(() => { refresh(); }, [refresh]);
  useVisibilityAwareInterval(refresh, open ? OPEN_MS : IDLE_MS);

  const run = React.useCallback(async (what, work) => {
    setBusy(what);
    setError('');
    try {
      return await work();
    } catch (failure) {
      setError(failure.message);
      logToApp('warn', `kraken: ${what} did not go through (status ${failure.status || 'none'})`, WHERE);
      return null;
    } finally {
      setBusy('');
    }
  }, []);

  const look = React.useCallback(() => run('preview', async () => {
    const result = await previewKraken({ workspaceId, report, mode, project: mode === 'fix' ? project : '' });
    setSkipped(new Set());
    setPreview(result);
    logToApp('info', `kraken: report read, ${result.arms.length} findings`, WHERE);
  }), [run, workspaceId, report, mode, project]);

  const release = React.useCallback(() => run('release', async () => {
    const only = preview.arms.filter((arm) => !skipped.has(arm.n)).map((arm) => arm.n);
    await releaseKraken({ workspaceId, report, mode, project: mode === 'fix' ? project : '', only });
    logToApp('info', `kraken: request handed out, ${only.length} arms`, WHERE);
    setPreview(null);
    onUpdate?.({ krakenReport: '' });
    await refresh();
  }), [run, preview, skipped, workspaceId, report, mode, project, onUpdate, refresh]);

  const stop = React.useCallback((id) => run('stop', async () => {
    await stopKraken({ workspaceId, id });
    logToApp('info', 'kraken: request stopped from the window', WHERE);
    await refresh();
  }), [run, workspaceId, refresh]);

  const toggle = React.useCallback((n) => setSkipped((now) => {
    const next = new Set(now);
    if (!next.delete(n)) next.add(n);
    return next;
  }), []);

  return {
    workspaceId, report, mode, project, setDraft, preview, skipped, toggle, look, release, stop,
    busy, error, requests, open, clearPreview: () => setPreview(null),
  };
}
