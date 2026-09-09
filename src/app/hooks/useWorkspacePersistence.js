import React from 'react';
import { api } from '../../lib/api.js';
import { persistWorkspaceWithPrewarm } from '../../lib/projectPrewarm.js';
import { clearWorkspaceDraft, writeWorkspaceDraft } from '../../lib/api/workspaceAuthority.js';

// Background retry schedule after a failed save. The canvas never blocks:
// the draft is already in localStorage and flush() always sends the latest
// candidate, so waiting longer only costs time, never data.
const RETRY_DELAYS = [5000, 15000, 30000, 60000];

export function useWorkspacePersistence({ enabled, workspace, revision, onRevision }) {
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

  React.useEffect(() => { revisionRef.current = revision; }, [revision]);

  const flush = React.useCallback(async () => {
    if (savingRef.current || blockedRef.current || !latestRef.current) return;
    const candidate = latestRef.current;
    savingRef.current = true;
    setState({ status: 'saving', error: '' });
    try {
      const saved = await persistWorkspaceWithPrewarm({
        api,
        workspace: candidate.workspace,
        expectedRevision: revisionRef.current,
      });
      revisionRef.current = saved.revision;
      onRevision(saved.revision);
      baselineRef.current = candidate.signature;
      failedRef.current = false;
      retryAttemptRef.current = 0;
      setState({ status: 'saved', error: '' });
    } catch (error) {
      if (error.code === 'workspace_revision_conflict') {
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
  }, [onRevision]);

  React.useEffect(() => {
    if (!enabled) return;
    const signature = JSON.stringify(workspace);
    if (baselineRef.current === null) {
      baselineRef.current = signature;
      return;
    }
    if (signature === baselineRef.current) return;
    latestRef.current = { workspace, signature };
    recoveryStoredRef.current = writeWorkspaceDraft(workspace, revisionRef.current);
    if (blockedRef.current || savingRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 1000);
    return () => clearTimeout(timerRef.current);
  }, [enabled, flush, workspace]);

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
    const signature = JSON.stringify(workspace);
    baselineRef.current = signature;
    latestRef.current = { workspace, signature };
    revisionRef.current = nextRevision;
    recoveryStoredRef.current = false;
    clearWorkspaceDraft();
    onRevision(nextRevision);
    setState({ status: 'saved', error: '' });
    return true;
  }, [onRevision]);

  return {
    ...state,
    retry,
    adoptExternal,
    download: () => api.downloadWorkspaceSnapshot(latestRef.current?.workspace, 'draft'),
  };
}
