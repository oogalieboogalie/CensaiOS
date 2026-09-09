import React from 'react';
import { getCollaborationClientId } from '../../lib/collaboration/clientIdentity.js';
import { diffPresenceNotices } from '../../lib/collaboration/liveText.js';

const PATH = '/ws/workspace-collaboration';
const PREVIEW_TTL_MS = 4000;
const CURSOR_TTL_MS = 3000;
const TYPING_TTL_MS = 3000;
const TEXT_TTL_MS = 6000;

export function collaborationUrl(workspaceId, clientId) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}${PATH}?workspaceId=${encodeURIComponent(workspaceId)}`
    + `&clientId=${encodeURIComponent(clientId)}`;
}

export function mergeCollaborationPreviews(wins, previews, presence = {}, activeId = null) {
  const { text = {}, typing = {} } = presence;
  return wins.map((win) => {
    const preview = previews[win.id];
    const remote = text[win.id];
    const typer = typing[win.id];
    let next = preview ? {
      ...win,
      x: preview.x,
      y: preview.y,
      collaborationActor: preview.actor,
    } : win;
    if (typer) {
      next = { ...next, typingActor: { ...typer.actor, label: `${typer.actor?.label || 'Someone'} typing…` } };
    }
    // Live remote text for viewers only — never clobber the locally focused editor.
    if (remote && win.id !== activeId && (win.kind === 'doc' || win.kind === 'code_editor')) {
      next = {
        ...next,
        text: remote.text,
        code: win.kind === 'code_editor' ? remote.text : next.code,
        typingActor: remote.actor
          ? { ...remote.actor, label: `${remote.actor?.label || 'Someone'} typing…` }
          : next.typingActor,
      };
    }
    return next;
  });
}

export function useWorkspaceCollaboration({
  enabled, workspaceId, wins, revision, onAuthoritativeCommit, activeId,
}) {
  const clientId = React.useMemo(() => getCollaborationClientId(), []);
  const [state, setState] = React.useState({
    status: 'offline', participants: [], previews: {},
    cursors: {}, typing: {}, textPreviews: {}, notices: [],
    lastActivity: null, lastAgentRun: null,
  });
  const socketRef = React.useRef(null);
  const revisionRef = React.useRef(revision);
  const previewTimers = React.useRef(new Map());
  const lastPreviewAt = React.useRef(0);
  const lastCursorAt = React.useRef(0);
  const lastTypingAt = React.useRef(new Map());
  const lastTextAt = React.useRef(new Map());
  const sequence = React.useRef(0);
  const snapshotBaseline = React.useRef(false);

  React.useEffect(() => { revisionRef.current = revision; }, [revision]);

  React.useEffect(() => {
    if (!enabled || !workspaceId) {
      setState({ status: 'offline', participants: [], previews: {}, cursors: {}, typing: {}, textPreviews: {}, notices: [], lastActivity: null, lastAgentRun: null });
      return undefined;
    }
    let disposed = false;
    let reconnectTimer = null;
    let attempt = 0;

    const clearPreviews = () => {
      for (const timer of previewTimers.current.values()) clearTimeout(timer);
      previewTimers.current.clear();
      setState((current) => ({ ...current, previews: {}, textPreviews: {}, typing: {} }));
    };
    const expireEphemeral = (bucket, key, ttl) => {
      const priorTimer = previewTimers.current.get(`${bucket}:${key}`);
      if (priorTimer) clearTimeout(priorTimer);
      previewTimers.current.set(`${bucket}:${key}`, setTimeout(() => {
        setState((current) => {
          const next = { ...current[bucket] };
          delete next[key];
          return { ...current, [bucket]: next };
        });
      }, ttl));
    };
    const connect = () => {
      if (disposed) return;
      setState((current) => ({ ...current, status: attempt ? 'reconnecting' : 'connecting' }));
      const socket = new WebSocket(collaborationUrl(workspaceId, clientId));
      socketRef.current = socket;
      socket.addEventListener('open', () => { attempt = 0; });
      socket.addEventListener('message', (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'collaboration.ready') {
          setState((current) => ({
            ...current, status: 'live', participants: message.participants || [],
          }));
        } else if (message.type === 'presence.snapshot') {
          // First snapshot (or first after a reconnect) only sets the
          // baseline — no join toasts for people already here.
          const fresh = !snapshotBaseline.current;
          snapshotBaseline.current = true;
          setState((current) => {
            const notices = fresh
              ? []
              : diffPresenceNotices(current.participants, message.participants || []);
            return {
              ...current,
              participants: message.participants || [],
              notices: [...(current.notices || []), ...notices].slice(-5),
            };
          });
        } else if (message.type === 'window.preview') {
          const priorTimer = previewTimers.current.get(message.windowId);
          if (priorTimer) clearTimeout(priorTimer);
          previewTimers.current.set(message.windowId, setTimeout(() => {
            setState((current) => {
              const previews = { ...current.previews };
              delete previews[message.windowId];
              return { ...current, previews };
            });
          }, PREVIEW_TTL_MS));
          setState((current) => ({
            ...current,
            previews: { ...current.previews, [message.windowId]: message },
          }));
        } else if (message.type === 'opencode.completed') {
          setState((current) => ({
            ...current,
            lastAgentRun: { ...message.run, windowId: message.windowId, receivedAt: Date.now() },
          }));
        } else if (message.type === 'cursor.move') {
          expireEphemeral('cursors', message.clientId, CURSOR_TTL_MS);
          setState((current) => ({
            ...current,
            cursors: { ...current.cursors, [message.clientId]: message },
          }));
        } else if (message.type === 'typing') {
          expireEphemeral('typing', message.windowId, TYPING_TTL_MS);
          setState((current) => ({
            ...current,
            typing: { ...current.typing, [message.windowId]: message },
          }));
        } else if (message.type === 'text.preview') {
          expireEphemeral('textPreviews', message.windowId, TEXT_TTL_MS);
          setState((current) => ({
            ...current,
            textPreviews: { ...current.textPreviews, [message.windowId]: message },
          }));
        } else if (message.type === 'workspace.committed'
          && Number.isSafeInteger(message.revision)
          && message.revision > revisionRef.current) {
          const adopted = onAuthoritativeCommit(message.value, message.revision, message);
          if (adopted !== false) {
            revisionRef.current = message.revision;
            clearPreviews();
            if (message.actor?.type === 'agent') {
              setState((current) => ({ ...current, lastActivity: message.activity || null }));
            }
          }
        }
      });
      socket.addEventListener('close', () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (disposed) return;
        snapshotBaseline.current = false;
        setState((current) => ({ ...current, status: 'reconnecting', participants: [] }));
        const delay = Math.min(5000, 250 * (2 ** attempt));
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      });
      socket.addEventListener('error', () => undefined);
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      clearPreviews();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [clientId, enabled, onAuthoritativeCommit, workspaceId]);

  const previewWindowMove = React.useCallback((windowId, position) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (position.phase !== 'end' && now - lastPreviewAt.current < 32) return;
    lastPreviewAt.current = now;
    sequence.current += 1;
    socket.send(JSON.stringify({
      type: 'window.preview', windowId, x: position.x, y: position.y,
      phase: position.phase || 'move', sequence: sequence.current,
    }));
  }, []);

  const sendCursor = React.useCallback((x, y) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastCursorAt.current < 32) return;
    lastCursorAt.current = now;
    socket.send(JSON.stringify({ type: 'cursor.move', x, y }));
  }, []);

  const sendTyping = React.useCallback((windowId) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !windowId) return;
    const now = Date.now();
    const last = lastTypingAt.current.get(windowId) || 0;
    if (now - last < 1500) return;
    lastTypingAt.current.set(windowId, now);
    socket.send(JSON.stringify({ type: 'typing', windowId }));
  }, []);

  const sendTextPreview = React.useCallback((windowId, text) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !windowId) return;
    if (typeof text !== 'string' || text.length > 8192) return;
    const now = Date.now();
    const last = lastTextAt.current.get(windowId) || 0;
    if (now - last < 500) return;
    lastTextAt.current.set(windowId, now);
    socket.send(JSON.stringify({ type: 'text.preview', windowId, text }));
  }, []);

  const displayWins = React.useMemo(
    () => mergeCollaborationPreviews(
      wins, state.previews,
      { text: state.textPreviews, typing: state.typing }, activeId,
    ),
    [state.previews, state.textPreviews, state.typing, wins, activeId]
  );
  return { ...state, clientId, displayWins, previewWindowMove, sendCursor, sendTyping, sendTextPreview };
}
