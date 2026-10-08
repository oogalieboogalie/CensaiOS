import React from 'react';
import { api } from '../../lib/api.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { useBoardEvent } from '../../lib/collaboration/boardEvents.js';
import { useCommentStore } from '../../lib/comments/commentStore.js';
import { CommentPanel } from '../comments/CommentPanel.jsx';
import { CommentPlacer } from '../comments/CommentPlacer.jsx';
import { pinPosition } from '../comments/CommentPins.jsx';
import { useBoardComments } from '../comments/useBoardComments.js';
import { ReactionIcon, REACTION_LABELS } from './ReactionIcons.jsx';

const CAMERA_INTERVAL_MS = 200;
const REACTION_TTL_MS = 3500;

/** Reactions float up in the corner for a few seconds, newest on top. */
export function FloatingReactions() {
  const [items, setItems] = React.useState([]);
  useBoardEvent('reaction', (message) => {
    const id = `${message.clientId}-${Date.now()}-${Math.random()}`;
    setItems((current) => [...current.slice(-7), { id, reaction: message.reaction, label: message.actor?.label }]);
    setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), REACTION_TTL_MS);
  });
  if (items.length === 0) return null;
  return (
    <div aria-live="polite" style={{ position: 'fixed', right: 16, bottom: 64, zIndex: 380, display: 'grid', gap: 6, justifyItems: 'end', pointerEvents: 'none' }}>
      {items.map((item) => (
        <div key={item.id} data-testid="floating-reaction" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 'var(--radius-full)', background: 'var(--surface)', border: '1px solid var(--hairline)', boxShadow: 'var(--elevation-2)', color: 'var(--ink-soft)', fontSize: 'var(--text-xs)' }}>
          <span style={{ color: 'var(--accent)' }}><ReactionIcon reaction={item.reaction} /></span>
          <span>{item.label || 'Someone'} · {REACTION_LABELS[item.reaction] || item.reaction}</span>
        </div>
      ))}
    </div>
  );
}

function useLiveShow(workspaceId) {
  const [links, setLinks] = React.useState([]);
  const refresh = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      const result = await api.listShareLinks(workspaceId);
      setLinks(result.links || []);
    } catch {
      setLinks([]);
    }
  }, [workspaceId]);
  React.useEffect(() => { refresh(); }, [refresh]);
  useBoardEvent('share.links.changed', refresh);
  return { liveLink: links.find((link) => link.mode === 'live' && link.active) || null, refresh };
}

/**
 * Everything the board owner sees of guest links while working: comment
 * pins' side panel and placer, the LIVE badge with the audience count,
 * raised hands, reactions, and the camera feed spectators follow.
 */
export function OwnerShareLayer({ collaboration, workspaceId, wins, pan, zoom, hidden = false }) {
  const live = collaboration?.status === 'live';
  useBoardComments({ mode: 'member', workspaceId, enabled: Boolean(workspaceId), live });
  const { liveLink } = useLiveShow(workspaceId);
  const [hands, setHands] = React.useState({});
  const lastCamera = React.useRef(0);
  const cameraTimer = React.useRef(null);

  useBoardEvent('hand', (message) => {
    setHands((current) => {
      const next = { ...current };
      if (message.raised) next[message.clientId] = message.actor?.label || 'Someone';
      else delete next[message.clientId];
      return next;
    });
  });

  // While a show is live, spectators follow this camera.
  const sendCamera = collaboration?.send;
  React.useEffect(() => {
    if (!liveLink || !sendCamera) return undefined;
    const emit = () => {
      lastCamera.current = Date.now();
      sendCamera({ type: 'camera', x: pan.x, y: pan.y, zoom, width: window.innerWidth, height: window.innerHeight });
    };
    const wait = CAMERA_INTERVAL_MS - (Date.now() - lastCamera.current);
    clearTimeout(cameraTimer.current);
    if (wait <= 0) emit();
    else cameraTimer.current = setTimeout(emit, wait);
    return () => clearTimeout(cameraTimer.current);
  }, [liveLink, sendCamera, pan.x, pan.y, zoom, collaboration?.spectators]);

  const jumpTo = React.useCallback((comment) => {
    const at = pinPosition(comment, wins);
    if (!at) return;
    const { setPan } = useWorkspaceStore.getState();
    setPan({ x: window.innerWidth / 2 - at.x * zoom, y: window.innerHeight / 2 - at.y * zoom });
  }, [wins, zoom]);

  const people = React.useMemo(
    () => (collaboration?.participants || []).map((participant) => participant.actor?.label).filter(Boolean),
    [collaboration?.participants],
  );
  const raised = Object.entries(hands);

  return (
    <>
      <CommentPlacer wins={wins} pan={pan} zoom={zoom} />
      <CommentPanel people={people} onJumpTo={jumpTo} />
      {!hidden && liveLink && (
        <div
          data-testid="live-badge"
          style={{
            position: 'fixed', right: 16, bottom: 16, zIndex: 360,
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 6px 12px',
            borderRadius: 'var(--radius-full)', background: 'var(--surface)', border: '1px solid var(--hairline)',
            boxShadow: 'var(--elevation-2)', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)',
          }}
        >
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: 'var(--danger)' }} />
          <span style={{ fontWeight: 700, color: 'var(--ink)', letterSpacing: 'var(--label-tracking)' }}>LIVE</span>
          <span>· {collaboration?.spectators || 0} watching</span>
          {liveLink.stage && <span style={{ color: 'var(--ink-faint)' }}>· stage on</span>}
          {raised.length > 0 && (
            <span data-testid="raised-hands" title={raised.map(([, name]) => name).join(', ')} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-ink)' }}>
              · <ReactionIcon reaction="hand" size={14} /> {raised.length}
            </span>
          )}
          <button
            type="button"
            onClick={async () => { await api.controlLiveShow(workspaceId, { action: 'end' }).catch(() => undefined); }}
            style={{ border: 0, borderRadius: 'var(--radius-full)', padding: '4px 10px', background: 'var(--surface-2)', color: 'var(--ink)', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}
          >
            End show
          </button>
        </div>
      )}
      {!hidden && <FloatingReactions />}
    </>
  );
}

export function useOpenCommentCount() {
  return useCommentStore((state) => state.comments.filter((comment) => !comment.threadId && !comment.resolvedAt).length);
}
