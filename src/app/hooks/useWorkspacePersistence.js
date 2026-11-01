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
//
// The local draft is a copy of what the server does not have yet: a settings
// change, or board edits this tab made while the doc was away (`boardSaves`
// from useYjsCanvas says which; a draft of settings alone says `board:
// false`). It goes once the server has everything, so a draft found on the
// next load always holds real unsaved work, and a settings change still
// waiting when the page closes is sent on the way out. Which agents the board
// uses is saved too but never drafted: it follows from the board, which the
// doc already has. `holdDraft`: a draft from an earlier visit is being
// offered back; leave it alone until the person picks what to do with it.
function signatures(workspace, canvasSource) {
  if (canvasSource !== 'yjs' || !workspace || typeof workspace !== 'object') {
    const whole = JSON.stringify(workspace);
    return { save: whole, settings: whole };
  }
  const settings = { ...workspace };
  for (const key of SYNCED_KEYS) delete settings[key];
  return {
    save: JSON.stringify({ settings, memberships: deriveCanvasProjectMemberships(workspace) }),
    settings: JSON.stringify(settings),
  };
}

export function useWorkspacePersistence({
  enabled, workspace, revision, onRevision, rebaseOnConflict = false, canvasSource = null, canvasLive = true,
  boardSaves = null, holdDraft = false,
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
  const boardSavesRef = React.useRef(boardSaves);
  boardSavesRef.current = boardSaves;
  const holdRef = React.useRef(holdDraft);
  holdRef.current = holdDraft;
  const savedSettingsRef = React.useRef(null);
  // Board edits made while the doc was away that the server has not confirmed.
  const awayEditsRef = React.useRef(false);

  // Without the shared doc's word, a board edit while it is away counts as unsaved.
  const boardUnsaved = () => (boardSavesRef.current ? boardSavesRef.current.unsaved : true);
  const dropDraftIfSaved = React.useCallback(() => {
    if (!recoveryStoredRef.current || holdRef.current) return;
    if (savingRef.current || blockedRef.current || failedRef.current || boardSavesRef.current?.unsaved) return;
    if (latestRef.current && latestRef.current.signature !== baselineRef.current) return;
    recoveryStoredRef.current = false;
    awayEditsRef.current = false;
    clearWorkspaceDraft(latestRef.current?.workspace?.workspaceId);
  }, []);

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
      savedSettingsRef.current = candidate.settings;
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
      } else {
        dropDraftIfSaved();
      }
    }
  }, [onRevision, canvasSource, dropDraftIfSaved]);

  React.useEffect(() => {
    if (!enabled) return;
    const { save: signature, settings } = signatures(workspace, canvasSource);
    if (baselineRef.current === null) {
      baselineRef.current = signature;
      savedSettingsRef.current = settings;
      return;
    }
    latestRef.current = { workspace, signature, settings };
    // A settings change is drafted and sent; a change in which agents the
    // board uses is only sent; board edits made while the doc is away are
    // drafted (the doc sends them once back). The board arriving from the
    // doc is not an edit, and online edits go straight to the doc.
    const awayEdits = waitingRef.current && boardUnsaved();
    if (awayEdits) awayEditsRef.current = true;
    if ((awayEdits || settings !== savedSettingsRef.current) && !holdRef.current) {
      const board = canvasSource !== 'yjs' || awayEditsRef.current;
      recoveryStoredRef.current = writeWorkspaceDraft(workspace, revisionRef.current, { board });
    }
    if (signature === baselineRef.current) return;
    if (blockedRef.current || savingRef.current || waitingRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 1000);
    return () => clearTimeout(timerRef.current);
  }, [enabled, flush, workspace, canvasSource]);

  // The doc has every board edit this tab made: the draft may be done.
  React.useEffect(() => {
    if (!enabled || !boardSaves) return undefined;
    return boardSaves.onSaved(() => {
      awayEditsRef.current = false;
      dropDraftIfSaved();
    });
  }, [enabled, boardSaves, dropDraftIfSaved]);

  // Leaving the page (a reload, a closed tab) before a settings save went
  // out, or while it is on its way: send it with the page, so the next visit
  // has it. On the shared board a save never conflicts, so a second is safe.
  React.useEffect(() => {
    if (!enabled || canvasSource !== 'yjs') return undefined;
    const sendNow = () => {
      const latest = latestRef.current;
      if (!latest || latest.signature === baselineRef.current || waitingRef.current) return;
      api.saveWorkspace(latest.workspace, revisionRef.current, { canvasSource, keepalive: true }).catch(() => {});
    };
    window.addEventListener('pagehide', sendNow);
    return () => window.removeEventListener('pagehide', sendNow);
  }, [enabled, canvasSource]);

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
    const { save: signature, settings } = signatures(workspace, canvasSource);
    baselineRef.current = signature;
    savedSettingsRef.current = settings;
    latestRef.current = { workspace, signature, settings };
    revisionRef.current = nextRevision;
    recoveryStoredRef.current = false;
    clearWorkspaceDraft(workspace?.workspaceId);
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
