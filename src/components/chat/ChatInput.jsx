import React from 'react';
import { Icon } from '../Icons.jsx';

const MAX_TEXTAREA_HEIGHT = 200;
const MIN_TEXTAREA_HEIGHT = 36;

export function ChatInput({
  draft, setDraft,
  sending, send,
  showAttach, setShowAttach,
  imageAttachment, onUpdate
}) {
  const textareaRef = React.useRef(null);

  // Auto-grow the textarea up to MAX_TEXTAREA_HEIGHT as the user types.
  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = next + 'px';
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden';
  }, [draft]);

  const handleKeyDown = (e) => {
    // Enter sends · Shift+Enter inserts a newline.
    // Skip the send during IME composition so Japanese / Chinese / Korean
    // users can confirm a candidate with Enter without firing a message.
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing &&
      e.keyCode !== 229
    ) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
      {imageAttachment && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: 'var(--surface-2)', borderRadius: 8, alignSelf: 'flex-start', border: '1px solid var(--hairline)', position: 'relative' }}>
          <img src={imageAttachment} alt="Canvas Snapshot" style={{ height: 48, borderRadius: 4, objectFit: 'contain' }} />
          <button onClick={() => onUpdate({ imageAttachment: null })} aria-label="Remove attachment" style={{ all: 'unset', cursor: 'pointer', position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: 'var(--ink)', color: 'var(--surface)', display: 'grid', placeItems: 'center' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        <button
          onClick={() => setShowAttach(s => !s)}
          title="Attach"
          aria-label="Attach"
          aria-expanded={showAttach}
          style={{ all: 'unset', cursor: 'pointer', width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--ink-soft)', background: showAttach ? 'var(--accent-soft)' : 'transparent', flexShrink: 0 }}
        >
          <Icon.Plus size={16}/>
        </button>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="enter to send · shift+enter for newline"
          disabled={sending}
          rows={1}
          aria-label="Message"
          style={{
            flex: 1,
            background: 'var(--surface-2)',
            border: '1px solid var(--hairline)',
            borderRadius: 10,
            padding: '8px 12px',
            font: '13px/1.4 var(--font-sans)',
            fontFamily: 'var(--font-sans)',
            color: 'var(--ink)',
            outline: 'none',
            resize: 'none',
            minHeight: MIN_TEXTAREA_HEIGHT,
            maxHeight: MAX_TEXTAREA_HEIGHT,
            lineHeight: 1.4,
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={send}
          title="Send"
          aria-label="Send message"
          disabled={sending}
          style={{ all: 'unset', cursor: sending ? 'wait' : 'pointer', width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--accent-ink)', background: 'var(--accent-soft)', opacity: sending ? 0.5 : 1, flexShrink: 0 }}
        >
          <Icon.Send size={14}/>
        </button>
        {showAttach && <AttachMenu onClose={() => setShowAttach(false)} />}
      </div>
    </div>
  );
}

function AttachMenu({ onClose }) {
  const items = [
    { icon: <Icon.Tools size={14}/>, label: 'tools', hint: 'web search · code exec · etc' },
    { icon: <Icon.Memory size={14}/>, label: 'memory', hint: 'pull a snippet of context' },
    { icon: <Icon.Group size={14}/>, label: 'group', hint: 'CC another agent' },
    { icon: <Icon.Files size={14}/>, label: 'conversation files', hint: 'docs · transcripts' },
    { icon: <Icon.Plug size={14}/>, label: 'connectors', hint: 'Notion · Linear · Slack' },
  ];
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 5 }} />
      <div style={{ position: 'absolute', bottom: 50, left: 6, zIndex: 6, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 12, boxShadow: 'var(--shadow-pop)', padding: 6, minWidth: 230 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '6px 10px 4px' }}>Attach</div>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <span style={{ color: 'var(--ink-soft)' }}>{it.icon}</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{it.label}</span>
              <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{it.hint}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}