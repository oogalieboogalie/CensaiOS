import React from 'react';
import { api } from '../../lib/api.js';
import { deriveCanvasProjectMemberships, persistWorkspaceWithPrewarm } from '../../lib/projectPrewarm.js';
import { clearWorkspaceDraft, writeWorkspaceDraft } from '../../lib/api/workspaceAuthority.js';
import { SYNCED_KEYS } from '../../lib/collaboration/yCanvasSync.js';

// Background retry schedule after a failed save. The canvas never blocks:
// the draft is already in localStorage and flush() always sends the latest
// candidate, so waiting longer only costs time, never data.
const RETRY_DELAYS = [5000, 15000, 30000, 60000];

// canvasSource 'yjs': the shared doc owns the canvas, so saves carry only the
// settings beside it and never conflict; while the doc is not connected
// (canvasLive false) edits wait in the local draft and nothing is sent.
// Moving or editing windows doesn't send anything on this path at all: a
// save goes out only when the settings (or which agents the board uses,
// for project prewarm) change.
export function saveSignature(workspace, canvasSource) {
  if (canvasSource !== 'yjs' || !workspace || typeof workspace !== 'object') return JSON.stringify(workspace);
  const settings = { ...workspace };
  for (const key of SYNCED_KEYS) delete settings[key];
  return JSON.stringify({ settings, memberships: deriveCanvasProjectMemberships(workspace) });
}

export function useWorkspacePersistence({
  enabled, workspace, revision, onRevision, rebaseOnConflict = false, canvasSource = null, canvasLive = true,
}) {
  const [state, setState] = React.useState({ status: 'idle', error: '' });
  const baselineRef = React.useRef(null);
  const latestRef = React.useRef(null);
  const revisionRef = React.useRef(revision);
  const savingRef = React.useRef(false);
  const blockedRef = React.useRef(false);
  const failedRef = React.useRef(false);
  const retryAttemptRef = React.useRef(0);
  const recoveryStoredRef = React.useRef(false);
  const timerRef = React.useRef(null);

  const rebaseRef = React.useRef(rebaseOnConflict);
  const rebaseAttemptsRef = React.useRef(0);
  React.useEffect(() => { revisionRef.current = revision; }, [revision]);
  React.useEffect(() => { rebaseRef.current = rebaseOnConflict; }, [rebaseOnConflict]);
  const waitingRef = React.useRef(false);
  waitingRef.current = canvasSource === 'yjs' && !canvasLive;

  const flush = React.useCallback(async () => {
    if (savingRef.current || blockedRef.current || waitingRef.current || !latestRef.current) return;
    const candidate = latestRef.current;
    savingRef.current = true;
    setState({ status: 'saving', error: '' });
    try {
      const saved = await persistWorkspaceWithPrewarm({
        api,
        workspace: candidate.workspace,
        expectedRevision: revisionRef.current,
        canvasSource,
      });
      revisionRef.current = saved.revision;
      onRevision(saved.revision);
      baselineRef.current = candidate.signature;
      failedRef.current = false;
      retryAttemptRef.current = 0;
      rebaseAttemptsRef.current = 0;
      setState({ status: 'saved', error: '' });
    } catch (error) {
      if (error.code === 'workspace_revision_conflict' && rebaseRef.current && rebaseAttemptsRef.current < 5) {
        rebaseAttemptsRef.current += 1;
        // Live CRDT sync already merged the canvas with everyone else's edits,
        // so this snapshot is not stale: adopt the server's revision and resave.
        try {
          const latest = await api.fetchWorkspaceRevision(candidate.workspace?.workspaceId);
          revisionRef.current = latest;
          onRevision(latest);
        } catch { /* the retry below surfaces a persistent failure */ }
        failedRef.current = true;
        setState({ status: 'saving', error: '' });
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { failedRef.current = false; flush(); }, 200);
      } else if (error.code === 'workspace_revision_conflict') {
        blockedRef.current = true;
        setState({ status: 'conflict', error: error.message || 'Workspace changed elsewhere' });
      } else {
        // Degraded, never blocking: the draft is already preserved locally,
        // the canvas stays interactive, and the latest edits ride along on
        // the next background attempt.
        failedRef.current = true;
        setState({
          status: 'degraded',
          error: error.message || 'Workspace save failed',
          recoveryStored: recoveryStoredRef.current,
        });
        clearTimeout(timerRef.current);
        const delay = RETRY_DELAYS[Math.min(retryAttemptRef.current, RETRY_DELAYS.length - 1)];
        retryAttemptRef.current += 1;
        timerRef.current = setTimeout(flush, delay);
      }
    } finally {
      savingRef.current = false;
      if (!blockedRef.current && !failedRef.current && latestRef.current?.signature !== baselineRef.current) {
        timerRef.current = setTimeout(flush, 250);
      }
    }
  }, [onRevision, canvasSource]);

  React.useEffect(() => {
    if (!enabled) return;
    const signature = saveSignature(workspace, canvasSource);
    if (baselineRef.current === null) {
      baselineRef.current = signature;
      return;
    }
    latestRef.current = { workspace, signature };
    // Offline board edits still land in the local draft; online, only a
    // settings change is drafted and sent (the doc holds the board).
    if (signature === baselineRef.current && !waitingRef.current) return;
    recoveryStoredRef.current = writeWorkspaceDraft(workspace, revisionRef.current);
    if (signature === baselineRef.current) return;
    if (blockedRef.current || savingRef.current || waitingRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 1000);
    return () => clearTimeout(timerRef.current);
  }, [enabled, flush, workspace, canvasSource]);

  // Back online: send whatever waited in the draft.
  React.useEffect(() => {
    if (!enabled || !canvasLive || !latestRef.current) return;
    if (latestRef.current.signature === baselineRef.current || blockedRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 250);
  }, [enabled, canvasLive, flush]);

  React.useEffect(() => () => clearTimeout(timerRef.current), []);

  const retry = React.useCallback(() => {
    blockedRef.current = false;
    failedRef.current = false;
    retryAttemptRef.current = 0;
    clearTimeout(timerRef.current);
    setState({ status: 'saving', error: '' });
    flush();
  }, [flush]);

  const adoptExternal = React.useCallback((workspace, nextRevision) => {
    const pending = latestRef.current?.signature;
    if (savingRef.current || (pending && pending !== baselineRef.current)) {
      blockedRef.current = true;
      setState({ status: 'conflict', error: 'Workspace changed while this canvas had unsaved edits' });
      return false;
    }
    clearTimeout(timerRef.current);
    const signature = saveSignature(workspace, canvasSource);
    baselineRef.current = signature;
    latestRef.current = { workspace, signature };
    revisionRef.current = nextRevision;
    recoveryStoredRef.current = false;
    clearWorkspaceDraft();
    onRevision(nextRevision);
    setState({ status: 'saved', error: '' });
    return true;
  }, [onRevision, canvasSource]);

  // Record a newer server revision without adopting its content (live CRDT
  // sync owns the shared canvas fields).
  const acknowledgeRevision = React.useCallback((nextRevision) => {
    if (!Number.isSafeInteger(nextRevision) || nextRevision <= revisionRef.current) return;
    revisionRef.current = nextRevision;
    onRevision(nextRevision);
  }, [onRevision]);

  return {
    ...state,
    retry,
    adoptExternal,
    acknowledgeRevision,
    download: () => api.downloadWorkspaceSnapshot(latestRef.current?.workspace, 'draft'),
  };
}
