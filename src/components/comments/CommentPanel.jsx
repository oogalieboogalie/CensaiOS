import React from 'react';
import { threadsOf, useCommentStore } from '../../lib/comments/commentStore.js';

const MENTION_SPLIT = /(@[a-zA-Z0-9][a-zA-Z0-9._-]{0,39})/g;

function timeLabel(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function handleOf(name) {
  return String(name || '').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

function Body({ text }) {
  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--ink)', lineHeight: 1.45 }}>
      {String(text).split(MENTION_SPLIT).map((part, index) => (part.startsWith('@')
        ? <span key={index} style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>{part}</span>
        : <React.Fragment key={index}>{part}</React.Fragment>))}
    </div>
  );
}

function Author({ author, at }) {
  const agent = author?.kind === 'agent';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: author?.color || (agent ? 'var(--agent)' : 'var(--accent)') }} />
      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{author?.name || 'Someone'}</span>
      {agent && <span style={{ color: 'var(--ink-faint)' }}>agent</span>}
      {author?.kind === 'guest' && <span style={{ color: 'var(--ink-faint)' }}>guest</span>}
      <span style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }}>{timeLabel(at)}</span>
    </div>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', minHeight: 64, resize: 'vertical',
  padding: '8px 10px', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)',
  background: 'var(--surface-2)', color: 'var(--ink)', font: 'inherit', fontSize: 'var(--text-sm)',
};

const buttonStyle = (primary = false) => ({
  border: primary ? 0 : '1px solid var(--hairline)', borderRadius: 'var(--radius-md)',
  padding: '6px 10px', background: primary ? 'var(--accent)' : 'var(--surface-2)',
  color: primary ? 'var(--on-fill)' : 'var(--ink-soft)', font: 'inherit',
  fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
});

/** Text box with @mention suggestions for agents and people on the board. */
function Composer({ placeholder, submitLabel, onSubmit, onCancel, mentionables, autoFocus }) {
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const ref = React.useRef(null);
  const query = /(?:^|\s)@([a-zA-Z0-9._-]*)$/.exec(text)?.[1];
  const suggestions = query === undefined ? [] : mentionables
    .filter((entry) => entry.handle.startsWith(query.toLowerCase()))
    .slice(0, 5);

  const insert = (handle) => {
    setText((current) => current.replace(/@([a-zA-Z0-9._-]*)$/, `@${handle} `));
    ref.current?.focus();
  };
  const submit = async (event) => {
    event?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(text.trim());
      setText('');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 6, position: 'relative' }}>
      <textarea
        ref={ref}
        data-testid="comment-input"
        aria-label={placeholder}
        autoFocus={autoFocus}
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event);
          if (event.key === 'Escape') onCancel?.();
          event.stopPropagation();
        }}
        style={inputStyle}
      />
      {suggestions.length > 0 && (
        <div role="listbox" style={{ display: 'grid', gap: 2, padding: 4, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', background: 'var(--surface)' }}>
          {suggestions.map((entry) => (
            <button key={`${entry.kind}-${entry.handle}`} type="button" role="option" aria-selected="false" onClick={() => insert(entry.handle)} style={{ ...buttonStyle(), border: 0, textAlign: 'left', display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--ink)' }}>@{entry.handle}</span>
              <span style={{ color: 'var(--ink-faint)' }}>{entry.kind === 'agent' ? `agent · ${entry.name}` : entry.name}</span>
            </button>
          ))}
        </div>
      )}
      {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {onCancel && <button type="button" onClick={onCancel} style={buttonStyle()}>Cancel</button>}
        <button type="submit" data-testid="comment-submit" disabled={!text.trim() || busy} style={{ ...buttonStyle(true), opacity: !text.trim() || busy ? 0.5 : 1 }}>
          {busy ? 'Posting…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

/**
 * Side panel for comment threads: the list, one open thread with replies,
 * and the composer for a freshly placed pin.
 */
export function CommentPanel({ people = [], onJumpTo = null }) {
  const {
    comments, agents, canComment, panelOpen, openThreadId, draft, tool, status, error,
  } = useCommentStore();
  const { post, resolve, openThread, setPanelOpen, setDraft, setTool } = useCommentStore.getState();
  const [showResolved, setShowResolved] = React.useState(false);
  const threads = React.useMemo(() => threadsOf(comments), [comments]);
  const mentionables = React.useMemo(() => {
    const list = agents.map((agent) => ({ kind: 'agent', handle: agent.handle, name: agent.name }));
    for (const person of people) {
      const handle = handleOf(person);
      if (handle && !list.some((entry) => entry.handle === handle)) list.push({ kind: 'person', handle, name: person });
    }
    return list;
  }, [agents, people]);

  if (!panelOpen) return null;
  const open = openThreadId ? threads.find((thread) => thread.id === openThreadId) : null;
  const visible = threads.filter((thread) => Boolean(thread.resolvedAt) === showResolved);

  return (
    <aside
      data-testid="comment-panel"
      aria-label="Comments"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: 'fixed', top: 16, right: 16, bottom: 16, width: 320, zIndex: 400,
        display: 'flex', flexDirection: 'column', gap: 10, padding: 12,
        background: 'var(--surface)', border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--elevation-3)',
        color: 'var(--ink)', fontSize: 'var(--text-sm)', overflow: 'hidden',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 650, fontSize: 'var(--text-md)' }}>Comments</div>
        <span style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>{threads.filter((thread) => !thread.resolvedAt).length} open</span>
        <button type="button" aria-label="Close comments" onClick={() => setPanelOpen(false)} style={{ ...buttonStyle(), marginLeft: 'auto', padding: '4px 8px' }}>Close</button>
      </header>

      {canComment && !draft && !open && (
        <button type="button" data-testid="comment-tool" aria-pressed={tool} onClick={() => setTool(!tool)} style={{ ...buttonStyle(tool), justifySelf: 'start' }}>
          {tool ? 'Click the board to place a pin' : 'Add a comment'}
        </button>
      )}

      {status === 'error' && <div role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{error}</div>}

      {draft && (
        <section style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
            New comment {draft.windowTitle ? `on ${draft.windowTitle}` : 'on the board'}
          </div>
          <Composer
            autoFocus
            placeholder="Say something. Type @ to mention an agent or a person."
            submitLabel="Post"
            mentionables={mentionables}
            onCancel={() => setDraft(null)}
            onSubmit={async (body) => {
              const created = await post({ body, x: draft.x, y: draft.y, windowId: draft.windowId || null });
              openThread(created.id);
            }}
          />
        </section>
      )}

      {open && (
        <section data-testid="comment-thread" style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, flex: 1 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => openThread(null)} style={buttonStyle()}>All threads</button>
            {onJumpTo && <button type="button" onClick={() => onJumpTo(open)} style={buttonStyle()}>Show on board</button>}
            {canComment && (
              <button type="button" data-testid="comment-resolve" onClick={() => resolve(open.id, !open.resolvedAt)} style={{ ...buttonStyle(), marginLeft: 'auto' }}>
                {open.resolvedAt ? 'Reopen' : 'Resolve'}
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gap: 12, overflowY: 'auto', minHeight: 0 }}>
            {[open, ...open.replies].map((comment) => (
              <article key={comment.id} data-testid="comment-entry" style={{ display: 'grid', gap: 4 }}>
                <Author author={comment.author} at={comment.createdAt} />
                <Body text={comment.body} />
              </article>
            ))}
            {open.resolvedAt && <div style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>Resolved by {open.resolvedBy || 'someone'}</div>}
          </div>
          {canComment && !open.resolvedAt && (
            <Composer placeholder="Reply" submitLabel="Reply" mentionables={mentionables} onSubmit={(body) => post({ body, threadId: open.id })} />
          )}
        </section>
      )}

      {!open && !draft && (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" aria-pressed={!showResolved} onClick={() => setShowResolved(false)} style={buttonStyle(!showResolved)}>Open</button>
            <button type="button" aria-pressed={showResolved} onClick={() => setShowResolved(true)} style={buttonStyle(showResolved)}>Resolved</button>
          </div>
          <div style={{ display: 'grid', gap: 6, overflowY: 'auto', minHeight: 0, alignContent: 'start' }}>
            {visible.length === 0 && (
              <div style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)', padding: '8px 2px' }}>
                {showResolved ? 'Nothing resolved yet.' : 'No open comments.'}
              </div>
            )}
            {visible.map((thread) => (
              <button
                key={thread.id}
                type="button"
                data-testid="comment-thread-row"
                onClick={() => { openThread(thread.id); onJumpTo?.(thread); }}
                style={{ display: 'grid', gap: 4, textAlign: 'left', padding: 8, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', color: 'inherit', font: 'inherit', cursor: 'pointer' }}
              >
                <Author author={thread.author} at={thread.createdAt} />
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink-soft)' }}>{thread.body}</div>
                {thread.replies.length > 0 && <div style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>{thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}</div>}
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
