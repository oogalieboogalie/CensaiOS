import React from 'react';
import { api } from '../lib/api.js';
import { useWorkspaceStore } from '../lib/store.js';
import { Canvas } from '../components/Canvas.jsx';
import { computeFitView } from '../lib/canvasMath.js';
import { withoutUnsupportedWindows } from '../lib/appUtils.js';
import { emitBoardEvent, useBoardEvent } from '../lib/collaboration/boardEvents.js';
import { followCamera } from '../lib/guest/guestIdentity.js';
import { useCommentStore } from '../lib/comments/commentStore.js';
import { installGuestFetchGuard } from '../lib/guest/guestFetchGuard.js';
import { CommentPins } from '../components/comments/CommentPins.jsx';
import { CommentPanel } from '../components/comments/CommentPanel.jsx';
import { CommentPlacer } from '../components/comments/CommentPlacer.jsx';
import { useBoardComments } from '../components/comments/useBoardComments.js';
import { FloatingReactions } from '../components/guest/OwnerShareLayer.jsx';
import { useWorkspaceCollaboration } from './hooks/useWorkspaceCollaboration.js';
import { useYjsCanvas } from './hooks/useYjsCanvas.js';
import { GuestReactionButtons, JoinForm, Notice, ROLE_COPY, Wordmark, chipButton, page, primary } from './GuestJoin.jsx';

const NOOP = () => {};
const noopAuthoritative = () => true;
function applyBoard(board) {
  const store = useWorkspaceStore.getState();
  store.setWins(withoutUnsupportedWindows(board.wins || []));
  store.setCanvasGroups(board.canvasGroups || []);
  store.setPaths(board.paths || []);
  store.setLinks(board.links || []);
}

function GuestBoard({ session, onEnded, onLeave }) {
  React.useState(() => installGuestFetchGuard());
  const workspaceId = session.workspace.id;
  const projected = session.projected !== false;
  const editing = !projected;
  const live = Boolean(session.live);
  const canComment = session.role === 'comment' || session.role === 'edit';
  const {
    wins, canvasGroups, paths, links, pan, zoom, activeId,
    setPan, setZoom, setActiveId, setWorkspaceId, setPaths, onUpdate, onClose, onUpdateGroup, resizeGroup, onCloseGroup, moveGroup, createLink, deleteLink,
  } = useWorkspaceStore();
  const [following, setFollowing] = React.useState(live);
  const followingRef = React.useRef(following);
  React.useEffect(() => { followingRef.current = following; }, [following]);
  const hostCamera = React.useRef(null);
  const fitted = React.useRef(false);
  const [handRaised, setHandRaised] = React.useState(false);

  React.useEffect(() => {
    setWorkspaceId(workspaceId);
    applyBoard({});
  }, [workspaceId, setWorkspaceId]);

  const fitOnce = React.useCallback(() => {
    if (fitted.current) return;
    const state = useWorkspaceStore.getState();
    if (!state.wins.length) return;
    fitted.current = true;
    const fit = computeFitView(state.wins, state.canvasGroups);
    setPan({ x: fit.x, y: fit.y });
    setZoom(fit.zoom);
  }, [setPan, setZoom]);

  const applyHostCamera = React.useCallback(() => {
    if (!hostCamera.current) return;
    const next = followCamera(hostCamera.current, { width: window.innerWidth, height: window.innerHeight });
    setPan(next.pan);
    setZoom(next.zoom);
    fitted.current = true;
  }, [setPan, setZoom]);

  // First paint from REST, then live pictures over the socket.
  React.useEffect(() => {
    if (!projected) return;
    api.getGuestBoard().then((result) => { applyBoard(result.board || {}); fitOnce(); }).catch(() => undefined);
  }, [projected, fitOnce]);

  const onEvent = React.useCallback((message) => {
    if (message.type === 'guest.board') {
      applyBoard(message.board || {});
      if (!followingRef.current || !hostCamera.current) fitOnce();
      return;
    }
    if (message.type === 'camera') {
      hostCamera.current = message;
      if (followingRef.current) applyHostCamera();
      return;
    }
    if (message.type === 'guest.ended') onEnded(message.reason);
    emitBoardEvent(message);
  }, [applyHostCamera, fitOnce, onEnded]);

  const yjs = useYjsCanvas({ enabled: editing, workspaceId, guest: true });
  React.useEffect(() => { if (yjs.status === 'live') fitOnce(); }, [yjs.status, fitOnce]);
  const collaboration = useWorkspaceCollaboration({
    enabled: true, workspaceId, wins, revision: 0, onAuthoritativeCommit: noopAuthoritative,
    activeId, crdt: editing && yjs.status === 'live', guest: true, onEvent,
  });
  useBoardComments({ mode: 'guest', workspaceId, enabled: canComment, live: collaboration.status === 'live' });
  const commentsOpen = useCommentStore((state) => state.panelOpen);
  const setCommentsOpen = useCommentStore((state) => state.setPanelOpen);

  const onPanZoom = React.useCallback(({ panX, panY, zoom: nextZoom }) => {
    setPan({ x: panX, y: panY });
    setZoom(nextZoom);
    if (followingRef.current) setFollowing(false);
  }, [setPan, setZoom]);

  const sendReaction = (reaction) => collaboration.send({ type: 'reaction', reaction });
  const toggleHand = () => {
    const raised = !handRaised;
    if (collaboration.send({ type: 'hand', raised })) setHandRaised(raised);
  };

  const people = React.useMemo(
    () => (collaboration.participants || []).map((participant) => participant.actor?.label).filter(Boolean),
    [collaboration.participants],
  );
  const chip = live ? 'Watching live' : (ROLE_COPY[session.role]?.chip || 'Viewing');

  return (
    <>
      <div id="canvas-root" style={{ position: 'fixed', inset: 0 }} data-testid="guest-board" data-guest-role={session.role}>
        <Canvas
          wins={collaboration.displayWins} activeId={activeId} selectedIds={activeId ? [activeId] : []}
          pan={pan} zoom={zoom} onPanZoom={onPanZoom}
          onFitView={NOOP} onJumpNearestCluster={NOOP}
          onUpdate={editing ? onUpdate : NOOP} onClose={editing ? onClose : NOOP}
          onSelect={(id) => setActiveId(id || null)} onSelection={NOOP} onDeleteSelected={NOOP}
          onSpawn={NOOP} dockState={{ groups: [], offset: 0 }}
          canvasGroups={canvasGroups} paths={paths} setPaths={editing ? setPaths : NOOP}
          links={links} onLinkCreate={editing ? createLink : NOOP} onLinkDelete={editing ? deleteLink : NOOP}
          onSpawnGroup={NOOP} onUpdateGroup={editing ? onUpdateGroup : NOOP} onResizeGroup={editing ? resizeGroup : NOOP}
          onCloseGroup={editing ? onCloseGroup : NOOP} onMoveGroup={editing ? moveGroup : NOOP}
          onAutoArrangeGroup={NOOP}
          activeTool="select" penMode={false} inkActions={false}
          onWindowMovePreview={editing ? collaboration.previewWindowMove : NOOP}
          onCursorMove={live ? undefined : collaboration.sendCursor} cursors={collaboration.cursors}
          suppressEmptyState
          worldOverlay={canComment ? <CommentPins zoom={zoom} /> : null}
        />
      </div>

      <header
        data-testid="guest-bar"
        style={{
          position: 'fixed', top: 12, left: 12, right: commentsOpen ? 348 : 12, zIndex: 350,
          display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 6px 12px', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-full)', boxShadow: 'var(--elevation-1)', pointerEvents: 'auto', fontSize: 'var(--text-sm)' }}>
          <Wordmark />
          <span style={{ width: 1, height: 16, background: 'var(--hairline)' }} />
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{session.workspaceName || 'Shared board'}</span>
          <span data-testid="guest-role-chip" style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
            {live && <span aria-hidden="true" style={{ display: 'inline-block', width: 6, height: 6, marginRight: 5, borderRadius: 'var(--radius-full)', background: 'var(--danger)' }} />}
            {chip}
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
          {live && !following && (
            <button type="button" data-testid="guest-follow" onClick={() => { setFollowing(true); applyHostCamera(); }} style={chipButton(true)}>Back to host</button>
          )}
          {live && following && <span style={{ ...chipButton(), cursor: 'default' }}>Following host</span>}
          {(live || session.role === 'comment') && (
            <GuestReactionButtons onReact={sendReaction} handRaised={handRaised} onToggleHand={toggleHand} />
          )}
          {!live && (collaboration.participants || []).slice(0, 5).map((participant) => (
            <span key={participant.clientId} title={participant.actor?.label} style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-full)', background: participant.actor?.color || 'var(--accent-soft)', color: participant.actor?.color ? 'var(--on-fill)' : 'var(--accent-ink)', fontSize: 'var(--text-xs)', fontWeight: 700, border: '2px solid var(--surface)' }}>
              {(participant.actor?.label || '?').slice(0, 2).toUpperCase()}
            </span>
          ))}
          {canComment && (
            <button type="button" data-testid="guest-comments" aria-pressed={commentsOpen} onClick={() => setCommentsOpen(!commentsOpen)} style={chipButton(commentsOpen)}>Comments</button>
          )}
          <button type="button" data-testid="guest-leave" onClick={onLeave} style={chipButton()}>Leave</button>
        </div>
      </header>

      {canComment && (
        <>
          <CommentPlacer wins={wins} pan={pan} zoom={zoom} />
          <CommentPanel people={people} />
        </>
      )}
      {!live && <FloatingReactions />}
    </>
  );
}

/**
 * The whole app for someone who opened a share link (`?join=<token>`): a
 * name prompt, then the shared board with only what their link allows.
 */
export function GuestApp({ token }) {
  const [phase, setPhase] = React.useState({ name: 'loading' });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [preview, current] = await Promise.all([
          api.previewGuestLink(token),
          api.getGuestSession().catch(() => ({ guest: null })),
        ]);
        if (cancelled) return;
        if (current?.guest && current.linkId === preview.linkId) setPhase({ name: 'board', session: current });
        else setPhase({ name: 'join', preview });
      } catch (error) {
        if (!cancelled) setPhase({ name: 'invalid', message: error.message });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const onJoined = React.useCallback(async () => {
    try {
      const current = await api.getGuestSession();
      if (current?.guest) setPhase({ name: 'board', session: current });
      else setPhase({ name: 'invalid', message: 'This link was turned off.' });
    } catch (error) {
      setPhase({ name: 'invalid', message: error.message });
    }
  }, []);
  const onEnded = React.useCallback((reason) => setPhase({ name: 'ended', reason }), []);
  const onLeave = React.useCallback(async () => {
    await api.leaveGuestSession().catch(() => undefined);
    setPhase({ name: 'left' });
  }, []);

  useBoardEvent('guest.ended', (message) => onEnded(message.reason));

  if (phase.name === 'loading') {
    return <div style={{ ...page, fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>Opening the board…</div>;
  }
  if (phase.name === 'invalid') {
    return <Notice title="This link doesn't work" body={phase.message || 'It may have been turned off or expired. Ask the person who sent it for a new one.'} />;
  }
  if (phase.name === 'ended') {
    return <Notice title="This link was turned off" body={`${phase.reason || 'The owner turned off this link.'} Ask them for a new one if you need to get back in.`} />;
  }
  if (phase.name === 'left') {
    return <Notice title="You left the board" body="Thanks for stopping by." action={<button type="button" style={primary} onClick={() => window.location.reload()}>Join again</button>} />;
  }
  if (phase.name === 'join') return <JoinForm token={token} preview={phase.preview} onJoined={onJoined} />;
  return <GuestBoard session={phase.session} onEnded={onEnded} onLeave={onLeave} />;
}
