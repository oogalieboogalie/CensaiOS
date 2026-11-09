import React from 'react';
import { TRANSLATION_PAIRS } from '../../../shared/comments/translationPairs.js';
import { useCommentStore } from '../../lib/comments/commentStore.js';

const PAIRS = ['en-fr', 'fr-en'];
const MENTION_SPLIT = /(@[a-zA-Z0-9][a-zA-Z0-9._-]{0,39})/g;

function timeLabel(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const buttonStyle = (on = false) => ({
  border: on ? 0 : '1px solid var(--hairline)',
  borderRadius: 'var(--radius-md)',
  padding: '4px 8px',
  background: on ? 'var(--accent)' : 'var(--surface-2)',
  color: on ? 'var(--on-fill)' : 'var(--ink-soft)',
  font: 'inherit',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  cursor: 'pointer',
});

function Text({ text }) {
  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--ink)', lineHeight: 1.45 }}>
      {String(text).split(MENTION_SPLIT).map((part, index) => (part.startsWith('@')
        ? <span key={index} style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>{part}</span>
        : <React.Fragment key={index}>{part}</React.Fragment>))}
    </div>
  );
}

/**
 * One comment in a thread: the original, a visible English ↔ French
 * control, and the translation once someone on the board has asked for it.
 */
export function CommentMessage({ comment }) {
  const translate = useCommentStore((state) => state.translate);
  const saved = comment.translation?.pair && TRANSLATION_PAIRS[comment.translation.pair] ? comment.translation : null;
  const [pair, setPair] = React.useState(saved?.pair || 'en-fr');
  const [show, setShow] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (saved?.pair) setPair(saved.pair);
    if (saved?.text) setShow(true);
  }, [saved?.pair, saved?.text]);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      await translate(comment.id, pair);
    } catch (translateError) {
      setError(translateError.message);
    } finally {
      setBusy(false);
    }
  };

  const target = TRANSLATION_PAIRS[saved?.pair]?.toLabel;

  return (
    <article data-testid="comment-entry" style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: comment.author?.color || 'var(--accent)' }} />
        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{comment.author?.name || 'Someone'}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }}>{timeLabel(comment.createdAt)}</span>
      </div>
      <Text text={comment.body} />
      <div role="group" aria-label="Translate" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {PAIRS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={pair === id}
            title={`${TRANSLATION_PAIRS[id].fromLabel} to ${TRANSLATION_PAIRS[id].toLabel}`}
            onClick={() => setPair(id)}
            style={buttonStyle(pair === id)}
          >
            {TRANSLATION_PAIRS[id].control}
          </button>
        ))}
        <button
          type="button"
          data-testid="comment-translate"
          onClick={run}
          disabled={busy}
          style={{ ...buttonStyle(true), opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Translating…' : 'Translate'}
        </button>
      </div>
      {show && saved && (
        <div data-testid="comment-translation" style={{ display: 'grid', gap: 2, padding: '6px 8px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', fontWeight: 600 }}>{target}</span>
          <Text text={saved.text} />
        </div>
      )}
      {saved && (
        <button type="button" onClick={() => setShow((current) => !current)} style={{ ...buttonStyle(), justifySelf: 'start' }}>
          {show ? 'Hide translation' : 'Show translation'}
        </button>
      )}
      {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{error}</div>}
    </article>
  );
}
