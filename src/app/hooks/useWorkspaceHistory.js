import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import {
  HISTORY_KEYS,
  mergeHistorySnapshot,
  subscribeRemoteHistory,
} from '../../lib/workspace/historyMerge.js';

const HISTORY_LIMIT = 60;
const COALESCE_MS = 300;

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function capture(state) {
  return Object.fromEntries(HISTORY_KEYS.map((key) => [key, clone(state[key])]));
}

function signature(snapshot) {
  return JSON.stringify(snapshot);
}

export function useWorkspaceHistory(enabled) {
  const pastRef = React.useRef([]);
  const futureRef = React.useRef([]);
  const currentRef = React.useRef(null);
  const pendingStartRef = React.useRef(null);
  const timerRef = React.useRef(null);
  const restoringRef = React.useRef(false);
  // Sequence stamps every stack entry and remote snapshot on one timeline so
  // undo can tell "this entry predates the last remote commit" and merge
  // instead of restoring stale remote objects verbatim.
  const seqRef = React.useRef(0);
  const remoteRef = React.useRef(null);

  const flushPending = React.useCallback(() => {
    if (!pendingStartRef.current) return;
    pastRef.current.push({ seq: ++seqRef.current, snapshot: pendingStartRef.current });
    pastRef.current = pastRef.current.slice(-HISTORY_LIMIT);
    pendingStartRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  // Remote commits are not undoable; they become the new baseline and are
  // remembered so older entries merge around them instead of clobbering them.
  const noteRemoteSnapshot = React.useCallback(() => {
    const snap = capture(useWorkspaceStore.getState());
    currentRef.current = snap;
    pendingStartRef.current = null;
    futureRef.current = [];
    remoteRef.current = { seq: ++seqRef.current, snapshot: clone(snap) };
  }, []);

  const pruneRemote = React.useCallback(() => {
    const remote = remoteRef.current;
    if (!remote) return;
    if (pastRef.current.length === 0 || pastRef.current[0].seq > remote.seq) {
      remoteRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (!enabled) return undefined;
    pastRef.current = [];
    futureRef.current = [];
    pendingStartRef.current = null;
    remoteRef.current = null;
    currentRef.current = capture(useWorkspaceStore.getState());

    const unsubscribeStore = useWorkspaceStore.subscribe((state) => {
      if (restoringRef.current) return;
      const next = capture(state);
      if (signature(next) === signature(currentRef.current)) return;
      if (!pendingStartRef.current) pendingStartRef.current = currentRef.current;
      currentRef.current = next;
      futureRef.current = [];
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flushPending, COALESCE_MS);
    });
    const unsubscribeRemote = subscribeRemoteHistory(noteRemoteSnapshot);

    return () => {
      unsubscribeStore();
      unsubscribeRemote();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, flushPending, noteRemoteSnapshot]);

  const restore = React.useCallback((snapshot) => {
    restoringRef.current = true;
    useWorkspaceStore.setState({ ...clone(snapshot), activeId: null, selectedIds: [] });
    currentRef.current = clone(snapshot);
    restoringRef.current = false;
  }, []);

  const resolveTarget = React.useCallback((entry) => {
    const remote = remoteRef.current;
    if (remote && entry.seq < remote.seq) {
      return mergeHistorySnapshot(entry.snapshot, currentRef.current, remote.snapshot);
    }
    return entry.snapshot;
  }, []);

  const undo = React.useCallback(() => {
    flushPending();
    const entry = pastRef.current.pop();
    if (!entry || !currentRef.current) return false;
    futureRef.current.push({ seq: ++seqRef.current, snapshot: clone(currentRef.current) });
    restore(resolveTarget(entry));
    pruneRemote();
    return true;
  }, [flushPending, restore, resolveTarget, pruneRemote]);

  const redo = React.useCallback(() => {
    flushPending();
    const entry = futureRef.current.pop();
    if (!entry || !currentRef.current) return false;
    pastRef.current.push({ seq: ++seqRef.current, snapshot: clone(currentRef.current) });
    pastRef.current = pastRef.current.slice(-HISTORY_LIMIT);
    restore(resolveTarget(entry));
    pruneRemote();
    return true;
  }, [flushPending, restore, resolveTarget, pruneRemote]);

  return { undo, redo };
}
