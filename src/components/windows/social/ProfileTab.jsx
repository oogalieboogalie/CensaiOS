/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import {
  hideBoardFromProfile, makeProfileKey, profileAddress, revokeProfileKey, saveSocialProfile, showBoardOnProfile,
} from '../../../lib/api/social.js';
import { BoardPicture } from './BoardPicture.jsx';
import { copyText, timeAgo } from './socialText.js';

function NameAndBio({ profile, onSaved }) {
  const [name, setName] = React.useState(profile.name);
  const [bio, setBio] = React.useState(profile.bio);
  const [note, setNote] = React.useState('');
  React.useEffect(() => { setName(profile.name); setBio(profile.bio); }, [profile.name, profile.bio]);
  const dirty = name !== profile.name || bio !== profile.bio;
  const save = async (event) => {
    event.preventDefault();
    try { await saveSocialProfile({ name, bio }); setNote('Saved'); await onSaved(); } catch (error) { setNote(error.message); }
  };
  return (
    <form className="hb-social-box" onSubmit={save}>
      <input className="hb-social-input hb-social-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Your name" data-testid="social-name" />
      <textarea className="hb-social-input" rows={2} maxLength={280} placeholder="A line about you and what you build" value={bio}
        onChange={(e) => setBio(e.target.value)} aria-label="About you" data-testid="social-bio" />
      <div className="hb-social-row">
        {note && <span className="hb-social-note" role="status">{note}</span>}
        <span className="hb-social-spacer" />
        <button type="submit" className="hb-btn" data-primary="true" disabled={!dirty} data-testid="social-save-profile">Save</button>
      </div>
    </form>
  );
}

function ShowBoardForm({ showable, onShown, setError }) {
  const choices = showable.filter((board) => !board.shown);
  const [workspaceId, setWorkspaceId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [note, setNote] = React.useState('');
  if (!choices.length) return null;
  const picked = workspaceId || choices[0].id;
  const submit = async (event) => {
    event.preventDefault();
    try {
      await showBoardOnProfile({ workspaceId: picked, title: title || undefined, note });
      setTitle(''); setNote(''); setWorkspaceId('');
      await onShown();
    } catch (error) { setError(error.message); }
  };
  return (
    <form className="hb-social-box" onSubmit={submit} data-testid="social-show-form">
      <span className="hb-social-label">Show off a board</span>
      <p className="hb-social-note">Followers see a picture of it and can open it to look around. They can't change anything, and windows that run on your computer (terminal, files, settings) stay hidden.</p>
      <select className="hb-social-input" value={picked} onChange={(e) => setWorkspaceId(e.target.value)} aria-label="Board" data-testid="social-show-board">
        {choices.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
      </select>
      <input className="hb-social-input" placeholder="Title (optional)" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="social-show-title" />
      <input className="hb-social-input" placeholder="What is it? (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} data-testid="social-show-note" />
      <div className="hb-social-row"><span className="hb-social-spacer" /><button type="submit" className="hb-btn" data-primary="true" data-testid="social-show">Put on my profile</button></div>
    </form>
  );
}

function FriendKey({ profile, keys, onChanged, setError }) {
  const [made, setMade] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const make = async () => {
    try {
      const result = await makeProfileKey('Friend');
      setMade(`Address: ${profileAddress(profile.id)}\nKey: ${result.key}`);
      await onChanged();
    } catch (error) { setError(error.message); }
  };
  const live = keys.filter((key) => !key.revoked_at);
  return (
    <div className="hb-social-box" data-testid="social-friend-key">
      <span className="hb-social-label">Friends on another censaiOS</span>
      <p className="hb-social-note">Give a friend two lines and their censaiOS can follow you. They see this profile and its feed, nothing else. Take a key back any time.</p>
      {made && (
        <>
          <pre className="hb-social-code" data-testid="social-key-lines">{made}</pre>
          <div className="hb-social-row">
            <span className="hb-social-note">Copy it now; the key is shown once.</span>
            <span className="hb-social-spacer" />
            <button type="button" className="hb-btn" onClick={async () => setCopied(await copyText(made))}>{copied ? 'Copied' : 'Copy both lines'}</button>
          </div>
        </>
      )}
      <div className="hb-social-row"><span className="hb-social-spacer" /><button type="button" className="hb-btn" onClick={make} data-testid="social-make-key">Let a friend follow you</button></div>
      {live.map((key) => (
        <div key={key.id} className="hb-social-row hb-social-key">
          <span className="hb-social-mono">csk_…{key.hint}</span>
          <span className="hb-social-note">made {timeAgo(key.created_at)}{key.last_used_at ? `, last read ${timeAgo(key.last_used_at)}` : ', not used yet'}</span>
          <span className="hb-social-spacer" />
          <button type="button" className="hb-btn" onClick={async () => { await revokeProfileKey(key.id).catch((e) => setError(e.message)); await onChanged(); }}>Take back</button>
        </div>
      ))}
    </div>
  );
}

/** Your profile: name, a line about you, your best boards, keys for friends. */
export function ProfileTab({ me, onChanged }) {
  const [error, setError] = React.useState('');
  if (!me) return <p className="hb-social-note">Loading your profile…</p>;
  return (
    <div className="hb-social-profile">
      {error && <p className="hb-social-error" role="alert">{error}</p>}
      <NameAndBio profile={me.profile} onSaved={onChanged} />
      <span className="hb-social-label">Boards on your profile</span>
      {!me.boards.length && <p className="hb-social-note">None yet. Show off a board below and it appears in your followers' feeds.</p>}
      <div className="hb-social-grid">
        {me.boards.map((board) => (
          <div key={board.id} className="hb-social-card" data-testid="social-my-board">
            <BoardPicture windows={board.windows} label={board.title} />
            <div className="hb-social-card-foot">
              <span className="hb-social-card-title">{board.title}</span>
              <span className="hb-social-spacer" />
              {board.openUrl && <a className="hb-btn" href={board.openUrl} target="_blank" rel="noopener noreferrer">Open</a>}
              <button type="button" className="hb-btn" onClick={async () => { await hideBoardFromProfile(board.id).catch((e) => setError(e.message)); await onChanged(); }}>Take off</button>
            </div>
            {board.note && <p className="hb-social-note hb-social-card-note">{board.note}</p>}
          </div>
        ))}
      </div>
      <ShowBoardForm showable={me.showable} onShown={onChanged} setError={setError} />
      <FriendKey profile={me.profile} keys={me.keys} onChanged={onChanged} setError={setError} />
    </div>
  );
}
