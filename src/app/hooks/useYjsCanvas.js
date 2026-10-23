import React from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { useWorkspaceStore } from '../../lib/store.js';
import { canvasWorkspaceSnapshot } from '../../lib/workspace/canvasWorkspaceSnapshot.js';
import { notifyRemoteHistory } from '../../lib/workspace/historyMerge.js';
import { SYNCED_KEYS, isDocEmpty, readDocState, writeStateToDoc } from '../../lib/collaboration/yCanvasSync.js';
import { setListMergeReporter } from '../../lib/collaboration/windowLists.js';
import { setSheetMergeReporter } from '../../lib/collaboration/windowSheet.js';
import { collectTextEvents, recordRemoteText } from '../../lib/collaboration/remoteTextEdits.js';
import { CANVAS_ROOT } from '../../../shared/collab/ySchema.js';
import { logToApp } from '../../lib/appLog/browserLog.js';

const LOCAL_ORIGIN = 'censai-local-store';

// One line in the app log when two people's list items (to-dos, Idea Pad
// bullets) were merged.
const LIST_NAMES = { items: ['to-dos', 'todos'], ideas: ['Idea Pad bullets', 'idea-pad'] };
setListMergeReporter(({ field, kept }) => {
  const [what, where] = LIST_NAMES[field] || ['list items', 'board'];
  logToApp('info', `board sync: merged ${what}, kept ${kept} added by someone else at the same moment`, { where });
});
// ...and when a Sheet write kept cells someone else typed (counts only).
setSheetMergeReporter(({ kept }) => {
  logToApp('info', `board sync: merged Sheet cells, kept ${kept} typed by someone else at the same moment`, { where: 'sheet' });
});

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
 * Binds the canvas store to the workspace's shared Yjs document, the only
 * source of truth for windows, groups, ink, links and dock. Every member's
 * edits merge in real time (CRDT, last writer wins per field). Returns
 * { status, awareness }: status is 'off' | 'connecting' | 'live', and
 * awareness (presence on the same connection) is set once the doc is live.
 */
export function useYjsCanvas({ enabled, workspaceId, store = useWorkspaceStore, guest = false }) {
  const [status, setStatus] = React.useState('off');
  const [awareness, setAwareness] = React.useState(null);

  React.useEffect(() => {
    if (!enabled || !workspaceId || typeof WebSocket === 'undefined') {
      setStatus('off');
      return undefined;
    }
    const doc = new Y.Doc();
    // The board as this tab first drew it (from the backup copy). Edits made
    // before the first sync are replayed onto the shared doc as a diff from
    // here, so nothing done in the first moments is lost.
    const bootState = pick(store.getState());
    let synced = false;
    let applyingRemote = false;

    const applyRemote = () => {
      const current = store.getState();
      const next = readDocState(doc, current);
      const changed = {};
      for (const key of SYNCED_KEYS) if (next[key] !== current[key]) changed[key] = next[key];
      // Where other people's typing landed, for the editors' carets (remoteTextEdits.js).
      recordRemoteText(current.wins, next.wins);
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
    const onTextEvents = (events, tr) => collectTextEvents(events, tr.origin === LOCAL_ORIGIN);
    doc.getMap(CANVAS_ROOT).observeDeep(onTextEvents);

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
        else {
          if (!isDocEmpty(doc)) writeStateToDoc(doc, bootState, pick(store.getState()), LOCAL_ORIGIN);
          applyRemote();
        }
        synced = true;
        setStatus('live');
        setAwareness(provider.awareness);
      },
      onDisconnect: () => setStatus((s) => (s === 'off' ? s : 'connecting')),
      onConnect: () => { if (synced) setStatus('live'); },
    });

    return () => {
      unsubscribe();
      doc.off('update', onDocUpdate);
      doc.getMap(CANVAS_ROOT).unobserveDeep(onTextEvents);
      provider.destroy();
      doc.destroy();
      setStatus('off');
      setAwareness(null);
    };
  }, [enabled, workspaceId, store, guest]);

  return { status, awareness };
}
