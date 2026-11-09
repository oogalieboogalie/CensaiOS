/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import {
  DESKTOP_AUTH_NOTE, REDDIT_CATEGORIES, WEB_FALLBACK_NOTE,
  parseRedditInput, sourceFromCategory, sourceKey,
} from '../../../lib/reddit/redditFeed.js';

export function RedditSources({ source, native, onChoose, onClose }) {
  const [text, setText] = React.useState('');
  const [note, setNote] = React.useState('');
  const current = sourceKey(source);

  const pick = (next) => { onChoose(next); onClose(); };

  const submit = (e) => {
    e.preventDefault();
    const parsed = parseRedditInput(text);
    setNote('');
    if (!parsed) {
      setNote('Type a subreddit like pics, r/science, or paste a Reddit link.');
      return;
    }
    pick(parsed);
  };

  return (
    <div className="hb-reddit-sheet" role="dialog" aria-label="Choose Reddit feed" data-testid="reddit-sources">
      <div className="hb-reddit-sheet-head">
        <span className="hb-reddit-label">Browse</span>
        <button type="button" className="hb-reddit-icon-btn" title="Close" aria-label="Close" onClick={onClose}>
          <Icon.Close size={14} />
        </button>
      </div>
      <form className="hb-reddit-search" onSubmit={submit}>
        <input
          autoFocus
          className="hb-reddit-input"
          aria-label="Subreddit or Reddit link"
          placeholder="r/pics, home, or a Reddit link"
          value={text}
          onChange={(e) => { setText(e.target.value); setNote(''); }}
        />
        <button type="submit" className="hb-btn" data-primary="true" disabled={!text.trim()}>Go</button>
      </form>
      {note && <p className="hb-reddit-note" role="status">{note}</p>}

      <div className="hb-reddit-label">Categories</div>
      <ul className="hb-reddit-cats" data-testid="reddit-categories">
        {REDDIT_CATEGORIES.map((cat) => {
          const next = sourceFromCategory(cat);
          const active = current === sourceKey(next);
          return (
            <li key={cat.id}>
              <button type="button" className="hb-reddit-cat" aria-current={active ? 'true' : undefined} onClick={() => pick(next)}>
                <span className="hb-reddit-cat-label">{cat.label}</span>
                <span className="hb-reddit-cat-hint">{active ? 'Open' : cat.hint}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="hb-reddit-foot">{native ? DESKTOP_AUTH_NOTE : WEB_FALLBACK_NOTE}</p>
    </div>
  );
}
