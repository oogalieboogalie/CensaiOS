import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { threadsOf, useCommentStore } from '../../lib/comments/commentStore.js';

// A pin on a window is stored relative to the window's corner so it rides
// along when the window moves; a pin on the board is stored in board units.
export function pinPosition(comment, wins) {
  if (comment.windowId) {
    const win = wins.find((entry) => String(entry.id) === String(comment.windowId));
    if (!win) return null;
    return { x: win.x + Number(comment.x || 0), y: win.y + Number(comment.y || 0) };
  }
  if (!Number.isFinite(comment.x) || !Number.isFinite(comment.y)) return null;
  return { x: comment.x, y: comment.y };
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function Pin({ x, y, zoom, label, color, active, count, onClick, testId }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); onClick?.(); }}
      title={label}
      style={{
        position: 'absolute', left: x, top: y, zIndex: 210,
        transform: `translate(0, -100%) scale(${1 / (zoom || 1)})`, transformOrigin: '0 100%',
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '3px 7px 3px 3px', border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-full) var(--radius-full) var(--radius-full) var(--radius-xs)',
        background: active ? 'var(--accent)' : 'var(--surface)',
        color: active ? 'var(--on-fill)' : 'var(--ink)',
        boxShadow: 'var(--elevation-2)', cursor: 'pointer', font: 'inherit',
        fontSize: 'var(--text-xs)', fontWeight: 600, pointerEvents: 'auto',
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: 'var(--radius-full)', display: 'grid', placeItems: 'center',
        background: color || 'var(--accent-soft)', color: color ? 'var(--on-fill)' : 'var(--accent-ink)',
        fontSize: 'var(--text-xs)', fontWeight: 700,
      }}>
        {initials(label)}
      </span>
      {count > 0 && <span>{count}</span>}
    </button>
  );
}

/** Comment pins drawn in board space (rendered inside the canvas overlay). */
export function CommentPins({ zoom = 1, wins: winsProp = null }) {
  const storeWins = useWorkspaceStore((state) => state.wins);
  const wins = winsProp || storeWins;
  const comments = useCommentStore((state) => state.comments);
  const openThreadId = useCommentStore((state) => state.openThreadId);
  const draft = useCommentStore((state) => state.draft);
  const openThread = useCommentStore((state) => state.openThread);
  const threads = React.useMemo(() => threadsOf(comments), [comments]);
  return (
    <>
      {threads.map((thread) => {
        if (thread.resolvedAt && thread.id !== openThreadId) return null;
        const at = pinPosition(thread, wins);
        if (!at) return null;
        return (
          <Pin
            key={thread.id}
            testId="comment-pin"
            x={at.x}
            y={at.y}
            zoom={zoom}
            label={thread.author?.name}
            color={thread.author?.color}
            active={thread.id === openThreadId}
            count={thread.replies.length}
            onClick={() => openThread(thread.id)}
          />
        );
      })}
      {draft && (() => {
        const at = pinPosition(draft, wins);
        return at ? <Pin x={at.x} y={at.y} zoom={zoom} label="New comment" active testId="comment-draft-pin" /> : null;
      })()}
    </>
  );
}
