/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { followSocial, listSocialPeople, unfollowSocial } from '../../../lib/api/social.js';
import { initials, timeAgo } from './socialText.js';

function followFor(follows, { profileId = null, boardId = null }) {
  return follows.find((f) => f.where === 'here' && (boardId ? f.board?.id === boardId : (!f.board && f.profileId === profileId)));
}

function FollowButton({ follow, onFollow, onUnfollow, testId, children }) {
  return follow
    ? <button type="button" className="hb-btn" data-on="true" onClick={() => onUnfollow(follow.id)} data-testid={`${testId}-unfollow`}>Following</button>
    : <button type="button" className="hb-btn" data-primary="true" onClick={onFollow} data-testid={testId}>{children}</button>;
}

function RemoteForm({ onAdded }) {
  const [address, setAddress] = React.useState('');
  const [key, setKey] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const paste = (text) => {
    // People often paste both lines at once from the other Social window.
    const a = /Address:\s*(\S+)/i.exec(text);
    const k = /Key:\s*(\S+)/i.exec(text);
    if (a) setAddress(a[1]); else setAddress(text);
    if (k) setKey(k[1]);
  };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await followSocial({ address: address.trim(), key: key.trim() });
      setAddress('');
      setKey('');
      await onAdded();
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  return (
    <form className="hb-social-box" onSubmit={submit} data-testid="social-remote-form">
      <span className="hb-social-label">A friend on another censaiOS</span>
      <p className="hb-social-note">In their Social window, Profile, they press "Let a friend follow you" and send you two lines. Paste them here.</p>
      <input className="hb-social-input" placeholder="Address: https://…/api/social/v1/profiles/…" value={address}
        onChange={(e) => paste(e.target.value)} data-testid="social-remote-address" />
      <input className="hb-social-input" placeholder="Key: csk_…" value={key} onChange={(e) => setKey(e.target.value)} data-testid="social-remote-key" />
      <div className="hb-social-row">
        {error && <span className="hb-social-error" role="alert">{error}</span>}
        <span className="hb-social-spacer" />
        <button type="submit" className="hb-btn" data-primary="true" disabled={busy || !address || !key} data-testid="social-remote-follow">Follow</button>
      </div>
    </form>
  );
}

/** People here to follow, friends on other installs, and everything you follow. */
export function FollowingTab({ onChanged }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const load = React.useCallback(async () => {
    try { setData(await listSocialPeople()); setError(''); } catch (failure) { setError(failure.message); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  const act = (fn) => async (...args) => {
    try { await fn(...args); await load(); onChanged?.(); } catch (failure) { setError(failure.message); }
  };
  const follow = act((body) => followSocial(body));
  const unfollow = act((id) => unfollowSocial(id));
  if (!data) return <p className="hb-social-note">{error || 'Loading people…'}</p>;
  const remote = data.follows.filter((f) => f.where === 'remote');
  return (
    <div className="hb-social-following">
      {error && <p className="hb-social-error" role="alert">{error}</p>}
      <span className="hb-social-label">People on this censaiOS</span>
      {!data.people.length && <p className="hb-social-note">No one else here has a profile yet. Invite a teammate to the board, or follow a friend on another censaiOS below.</p>}
      {data.people.map((person) => (
        <section key={person.id} className="hb-social-person" data-testid="social-person">
          <div className="hb-social-row">
            <span className="hb-social-avatar">{initials(person.name)}</span>
            <div className="hb-social-person-text">
              <strong>{person.name}</strong>
              {person.bio && <span className="hb-social-note">{person.bio}</span>}
            </div>
            <span className="hb-social-spacer" />
            <FollowButton follow={followFor(data.follows, { profileId: person.id })} testId="social-follow-person"
              onFollow={() => follow({ profileId: person.id })} onUnfollow={unfollow}>Follow</FollowButton>
          </div>
          {person.boardList.map((board) => (
            <div key={board.id} className="hb-social-row hb-social-board-row">
              <span className="hb-social-board-name">{board.title}</span>
              {board.note && <span className="hb-social-note">{board.note}</span>}
              <span className="hb-social-spacer" />
              <FollowButton follow={followFor(data.follows, { boardId: board.id })} testId="social-follow-board"
                onFollow={() => follow({ boardId: board.id })} onUnfollow={unfollow}>Follow board</FollowButton>
            </div>
          ))}
        </section>
      ))}
      <RemoteForm onAdded={async () => { await load(); onChanged?.(); }} />
      {remote.length > 0 && <span className="hb-social-label">On other censaiOS computers</span>}
      {remote.map((f) => (
        <div key={f.id} className="hb-social-row hb-social-person" data-testid="social-remote-follow-row">
          <span className="hb-social-avatar">{initials(f.name)}</span>
          <div className="hb-social-person-text">
            <strong>{f.name}{f.board ? `: ${f.board.title}` : ''}</strong>
            <span className="hb-social-note">
              {f.error ? f.error : `Checked ${timeAgo(f.fetchedAt)}`}{f.verified ? ' · signed by their censaiOS' : ''}
            </span>
          </div>
          <span className="hb-social-spacer" />
          <button type="button" className="hb-btn" onClick={() => unfollow(f.id)}>Unfollow</button>
        </div>
      ))}
    </div>
  );
}
