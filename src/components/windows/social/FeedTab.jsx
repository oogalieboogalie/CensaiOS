/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { postToFeed } from '../../../lib/api/social.js';
import { BoardPicture } from './BoardPicture.jsx';
import { initials, sourceNote, timeAgo } from './socialText.js';

function Composer({ boards, onPosted }) {
  const [text, setText] = React.useState('');
  const [boardId, setBoardId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const send = async (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await postToFeed({ body: text, boardId: boardId || undefined });
      setText('');
      await onPosted();
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  return (
    <form className="hb-social-composer" onSubmit={send} data-testid="social-composer">
      <textarea className="hb-social-input" rows={2} maxLength={500} placeholder="Share what you're building"
        value={text} onChange={(e) => setText(e.target.value)} data-testid="social-post-text" />
      <div className="hb-social-row">
        <select className="hb-social-input hb-social-select" value={boardId} onChange={(e) => setBoardId(e.target.value)}
          aria-label="About which board" data-testid="social-post-board">
          <option value="">Not about a board</option>
          {boards.map((board) => <option key={board.id} value={board.id}>About {board.title}</option>)}
        </select>
        <span className="hb-social-spacer" />
        {error && <span className="hb-social-error" role="alert">{error}</span>}
        <button type="submit" className="hb-btn" data-primary="true" disabled={busy || !text.trim()} data-testid="social-post">Post</button>
      </div>
    </form>
  );
}

function Avatar({ actor }) {
  if (actor.kind === 'agent') return <span className="hb-social-avatar" data-agent="true"><Icon.Bot size={14} /></span>;
  return <span className="hb-social-avatar">{initials(actor.name)}</span>;
}

function FeedItem({ item, board, showPicture }) {
  const agentOf = item.actor.kind === 'agent' ? `${item.author.name}'s agent` : null;
  const isPost = item.kind === 'post';
  return (
    <article className="hb-social-item" data-kind={item.kind} data-testid="social-feed-item">
      <Avatar actor={item.actor} />
      <div className="hb-social-item-body">
        <div className="hb-social-line">
          <strong>{item.actor.name}</strong>
          {agentOf && <span className="hb-social-tag">{agentOf}</span>}
          {!isPost && <span> {item.text}</span>}
        </div>
        {isPost && <p className="hb-social-post">{item.text}</p>}
        <div className="hb-social-meta">
          <span>{timeAgo(item.at)}</span>
          {isPost && item.board && <span>· about {item.board.title}</span>}
          {item.author.where === 'remote' && <span>· on {item.author.name}'s censaiOS{item.source?.verified ? ', signed' : ''}</span>}
        </div>
        {showPicture && board && (
          <div className="hb-social-card">
            <BoardPicture windows={board.windows} label={`${board.title} by ${board.owner}`} />
            <div className="hb-social-card-foot">
              <span className="hb-social-card-title">{board.title}</span>
              <span className="hb-social-meta">{board.windows.length} windows</span>
              <span className="hb-social-spacer" />
              {board.openUrl && <a className="hb-btn" href={board.openUrl} target="_blank" rel="noopener noreferrer" data-testid="social-open-board">Open board</a>}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/** The feed: your posts, people and boards you follow, and their agents at work. */
export function FeedTab({ feed, myBoards, onRefresh, onGoFollow }) {
  if (!feed) return <p className="hb-social-note">Loading your feed…</p>;
  const pictured = new Set();
  const problems = (feed.sources || []).filter((source) => source.error);
  return (
    <div className="hb-social-feed">
      <Composer boards={myBoards} onPosted={onRefresh} />
      {problems.map((source) => <p key={source.followId} className="hb-social-note" data-testid="social-source-off">{sourceNote(source)}</p>)}
      {!feed.items.length && (
        <div className="hb-social-empty">
          <p>Your feed fills up with what you and the people you follow are building, and what their agents are doing.</p>
          <button type="button" className="hb-btn" onClick={onGoFollow}>Find people to follow</button>
        </div>
      )}
      {feed.items.map((item) => {
        const key = item.board?.key;
        const showPicture = Boolean(key && feed.boards[key] && !pictured.has(key) && item.kind !== 'agent');
        if (showPicture) pictured.add(key);
        return <FeedItem key={item.id} item={item} board={key ? feed.boards[key] : null} showPicture={showPicture} />;
      })}
    </div>
  );
}
