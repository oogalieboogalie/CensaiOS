// Guest landing pieces: the name prompt for a share link and the full-page
// notices (invalid, ended, left), and the reaction buttons on the guest
// header. GuestApp.jsx owns the board itself.

import React from 'react';
import { api } from '../lib/api.js';
import { ReactionIcon, REACTION_LABELS } from '../components/guest/ReactionIcons.jsx';
import { GUEST_COLORS, loadGuestIdentity, saveGuestIdentity } from '../lib/guest/guestIdentity.js';

export const ROLE_COPY = {
  view: { chip: 'Viewing', join: 'You can look around this board.' },
  comment: { chip: 'Commenting', join: 'You can look around and leave comments.' },
  edit: { chip: 'Editing', join: 'You can edit this board with its owner.' },
};


export const page = {
  position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
  background: 'var(--canvas)', color: 'var(--ink)', fontFamily: 'var(--font-ui)',
};
export const card = {
  width: 'min(380px, calc(100vw - 32px))', display: 'grid', gap: 14, padding: 22,
  background: 'var(--surface)', border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--elevation-2)',
};
export const field = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', color: 'var(--ink)', font: 'inherit',
  fontSize: 'var(--text-sm)',
};
export const primary = {
  border: 0, borderRadius: 'var(--radius-md)', padding: '9px 12px', background: 'var(--accent)',
  color: 'var(--on-fill)', font: 'inherit', fontSize: 'var(--text-sm)', fontWeight: 650, cursor: 'pointer',
};
export const chipButton = (active = false) => ({
  display: 'flex', alignItems: 'center', gap: 5, border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-full)', padding: '5px 10px',
  background: active ? 'var(--accent)' : 'var(--surface)', color: active ? 'var(--on-fill)' : 'var(--ink-soft)',
  font: 'inherit', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
});

export function Wordmark() {
  return (
    <span style={{ fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
      censai<span style={{ color: 'var(--accent)' }}>OS</span>
    </span>
  );
}

export function Notice({ title, body, action = null }) {
  return (
    <div style={page}>
      <div style={card} data-testid="guest-notice">
        <Wordmark />
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 650 }}>{title}</div>
        <div style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-sm)' }}>{body}</div>
        {action}
      </div>
    </div>
  );
}

export function JoinForm({ token, preview, onJoined }) {
  const [identity, setIdentity] = React.useState(loadGuestIdentity);
  const [passcode, setPasscode] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (!identity.name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const joined = await api.joinGuestLink(token, { name: identity.name.trim(), color: identity.color, passcode });
      saveGuestIdentity({ name: identity.name.trim(), color: identity.color });
      onJoined(joined);
    } catch (joinError) {
      setError(joinError.message);
      setBusy(false);
    }
  };
  const copy = preview.live
    ? { chip: 'Watching live', join: 'The host is live. You will follow their view and can react.' }
    : ROLE_COPY[preview.role] || ROLE_COPY.view;
  return (
    <div style={page}>
      <form onSubmit={submit} style={card} data-testid="guest-join">
        <Wordmark />
        <div>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 650 }}>{preview.workspaceName || 'Shared board'}</div>
          <div style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-sm)', marginTop: 4 }}>{copy.join} No account needed.</div>
        </div>
        <label style={{ display: 'grid', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
          Your name
          <input
            data-testid="guest-name"
            autoFocus
            maxLength={40}
            value={identity.name}
            onChange={(event) => setIdentity((current) => ({ ...current, name: event.target.value }))}
            placeholder="How others will see you"
            style={field}
          />
        </label>
        <div style={{ display: 'grid', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
          Your color
          <div role="radiogroup" aria-label="Your color" style={{ display: 'flex', gap: 8 }}>
            {GUEST_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={identity.color === color}
                aria-label={`Color ${color}`}
                onClick={() => setIdentity((current) => ({ ...current, color }))}
                style={{
                  width: 22, height: 22, borderRadius: 'var(--radius-full)', background: color, cursor: 'pointer',
                  border: identity.color === color ? '2px solid var(--ink)' : '2px solid var(--surface)',
                  boxShadow: '0 0 0 1px var(--hairline)',
                }}
              />
            ))}
          </div>
        </div>
        {preview.needsPasscode && (
          <label style={{ display: 'grid', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
            Passcode
            <input data-testid="guest-passcode" type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} style={field} />
          </label>
        )}
        {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{error}</div>}
        <button type="submit" data-testid="guest-join-submit" disabled={busy || !identity.name.trim()} style={{ ...primary, opacity: busy || !identity.name.trim() ? 0.6 : 1 }}>
          {busy ? 'Joining…' : 'Join board'}
        </button>
      </form>
    </div>
  );
}

export function GuestReactionButtons({ onReact, handRaised, onToggleHand }) {
  return (
    <>
      {Object.keys(REACTION_LABELS).map((reaction) => (
        <button key={reaction} type="button" data-testid={`guest-react-${reaction}`} title={REACTION_LABELS[reaction]} aria-label={REACTION_LABELS[reaction]} onClick={() => onReact(reaction)} style={{ ...chipButton(), padding: 6 }}>
          <ReactionIcon reaction={reaction} />
        </button>
      ))}
      <button type="button" data-testid="guest-hand" aria-pressed={handRaised} onClick={onToggleHand} style={chipButton(handRaised)}>
        <ReactionIcon reaction="hand" size={14} />{handRaised ? 'Hand raised' : 'Raise hand'}
      </button>
    </>
  );
}
