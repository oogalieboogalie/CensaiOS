import React from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { useWorkspaceStore } from '../../lib/store.js';
import { canvasWorkspaceSnapshot } from '../../lib/workspace/canvasWorkspaceSnapshot.js';
import { notifyRemoteHistory } from '../../lib/workspace/historyMerge.js';
import { SYNCED_KEYS, isDocEmpty, readDocState, writeStateToDoc } from '../../lib/collaboration/yCanvasSync.js';

const LOCAL_ORIGIN = 'censai-local-store';

export function hocuspocusUrl(workspaceId, location = globalThis.location, { guest = false } = {}) {
  const protocol = location?.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location?.host}/hocuspocus?workspaceId=${encodeURIComponent(workspaceId)}${guest ? '&guest=1' : ''}`;
}

function pick(state) {
  const out = {};
  for (const key of SYNCED_KEYS) out[key] = state[key];
  return out;
}

/**
 * Binds the canvas store to the workspace's shared Yjs document so every
 * member's window/group/ink edits merge in real time (CRDT), instead of
 * whole-canvas saves racing each other. Returns { status } where status is
 * 'off' | 'connecting' | 'live'.
 */
export function useYjsCanvas({ enabled, workspaceId, store = useWorkspaceStore, guest = false }) {
  const [status, setStatus] = React.useState('off');

  React.useEffect(() => {
    if (!enabled || !workspaceId || typeof WebSocket === 'undefined') {
      setStatus('off');
      return undefined;
    }
    const doc = new Y.Doc();
    let synced = false;
    let applyingRemote = false;

    const applyRemote = () => {
      const current = store.getState();
      const next = readDocState(doc, current);
      const changed = {};
      for (const key of SYNCED_KEYS) if (next[key] !== current[key]) changed[key] = next[key];
      if (!Object.keys(changed).length) return;
      applyingRemote = true;
      try { store.setState(changed); } finally { applyingRemote = false; }
      // Two people can each write half of a group change (a seam drag and a
      // group move); every client re-solves tiled groups the same way, so
      // they converge. Runs as a local edit so the fix syncs.
      store.getState().reconcileGroupTiles?.();
      notifyRemoteHistory(canvasWorkspaceSnapshot(store.getState()));
    };

    const onDocUpdate = (_update, origin) => {
      if (origin !== LOCAL_ORIGIN && synced) applyRemote();
    };
    doc.on('update', onDocUpdate);

    const unsubscribe = store.subscribe((state, prev) => {
      if (!synced || applyingRemote) return;
      if (!SYNCED_KEYS.some((key) => state[key] !== prev[key])) return;
      writeStateToDoc(doc, pick(prev), pick(state), LOCAL_ORIGIN);
    });

    setStatus('connecting');
    const provider = new HocuspocusProvider({
      url: hocuspocusUrl(workspaceId, globalThis.location, { guest }),
      name: workspaceId,
      document: doc,
      onSynced: () => {
        if (synced) return;
        // First client into a never-synced doc seeds it from its canvas;
        // everyone else adopts the shared doc.
        // A guest never seeds: their store starts empty and is not the board.
        if (isDocEmpty(doc) && !guest) writeStateToDoc(doc, null, pick(store.getState()), LOCAL_ORIGIN);
        else applyRemote();
        synced = true;
        setStatus('live');
      },
      onDisconnect: () => setStatus((s) => (s === 'off' ? s : 'connecting')),
      onConnect: () => { if (synced) setStatus('live'); },
    });

    return () => {
      unsubscribe();
      doc.off('update', onDocUpdate);
      provider.destroy();
      doc.destroy();
      setStatus('off');
    };
  }, [enabled, workspaceId, store, guest]);

  return { status };
}
