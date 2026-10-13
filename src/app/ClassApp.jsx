// A student's way into a live lesson (spec 12): `?class=<token>`. They type
// their name and an invite code (or subscribe through Stripe), and land on
// their own copy of the lesson board. The rejoin token kept here brings
// them back to the same seat without another code.

import React from 'react';
import { api } from '../lib/api.js';
import { GUEST_COLORS, loadGuestIdentity, saveGuestIdentity } from '../lib/guest/guestIdentity.js';
import { ClassSeat } from './ClassSeat.jsx';
import { Notice, Wordmark, card, field, page, primary } from './GuestJoin.jsx';

const SEATS_KEY = 'homebase.classSeats.v1';
const PENDING_POLL_MS = 3000;

function readSeat(token) {
  try { return JSON.parse(localStorage.getItem(SEATS_KEY) || '{}')[token] || null; } catch { return null; }
}

function saveSeat(token, rejoinToken) {
  try {
    const all = JSON.parse(localStorage.getItem(SEATS_KEY) || '{}');
    all[token] = rejoinToken;
    localStorage.setItem(SEATS_KEY, JSON.stringify(all));
  } catch { /* storage unavailable */ }
}

function ClassJoinForm({ token, preview, onJoined, onPending }) {
  const [identity, setIdentity] = React.useState(loadGuestIdentity);
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const paid = preview.gate === 'stripe';
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.joinClass(token, { name: identity.name.trim(), color: identity.color, code });
      saveGuestIdentity({ name: identity.name.trim(), color: identity.color });
      if (result.rejoinToken) saveSeat(token, result.rejoinToken);
      if (result.checkoutUrl) {
        onPending();
        window.location.assign(result.checkoutUrl);
        return;
      }
      onJoined();
    } catch (joinError) {
      setError(joinError.message);
      setBusy(false);
    }
  };
  const ready = identity.name.trim() && (paid || code.trim());
  return (
    <div style={page}>
      <form onSubmit={submit} style={card} data-testid="class-join">
        <Wordmark />
        <div>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 650 }}>{preview.title}</div>
          <div style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
            {preview.instructor ? `With ${preview.instructor}. ` : ''}You get your own copy of the lesson board, {preview.steps} steps to work through, and can watch the instructor live. No account needed.
          </div>
        </div>
        <label style={{ display: 'grid', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
          Your name
          <input data-testid="class-name" autoFocus maxLength={40} value={identity.name} placeholder="How your instructor will see you" style={field}
            onChange={(event) => setIdentity((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <div role="radiogroup" aria-label="Your color" style={{ display: 'flex', gap: 8 }}>
          {GUEST_COLORS.map((color) => (
            <button key={color} type="button" role="radio" aria-checked={identity.color === color} aria-label={`Color ${color}`}
              onClick={() => setIdentity((current) => ({ ...current, color }))}
              style={{ width: 22, height: 22, borderRadius: 'var(--radius-full)', background: color, cursor: 'pointer', border: identity.color === color ? '2px solid var(--ink)' : '2px solid var(--surface)', boxShadow: '0 0 0 1px var(--hairline)' }} />
          ))}
        </div>
        {!paid && (
          <label style={{ display: 'grid', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
            Invite code
            <input data-testid="class-code" value={code} placeholder="ABCD-EFGH" autoComplete="off" style={{ ...field, fontFamily: 'var(--font-mono)' }}
              onChange={(event) => setCode(event.target.value)} />
          </label>
        )}
        {paid && !preview.stripeReady && <div style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-xs)' }}>Paid sign-up is not open yet. Ask your instructor for an invite.</div>}
        <div style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>{preview.seatsLeft} of the class seats left.</div>
        {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{error}</div>}
        <button type="submit" data-testid="class-join-submit" disabled={busy || !ready || (paid && !preview.stripeReady)} style={{ ...primary, opacity: busy || !ready ? 0.6 : 1 }}>
          {busy ? 'Joining…' : paid ? 'Subscribe and join' : 'Join class'}
        </button>
      </form>
    </div>
  );
}

export function ClassApp({ token }) {
  const [phase, setPhase] = React.useState({ name: 'loading' });

  const enter = React.useCallback(async () => {
    try {
      const preview = await api.previewClass(token);
      const rejoinToken = readSeat(token);
      if (!rejoinToken) return setPhase({ name: 'join', preview });
      const result = await api.rejoinClass(token, rejoinToken).catch((error) => ({ error }));
      if (result.joined) return setPhase({ name: 'seat' });
      if (result.pending) return setPhase({ name: 'pending', preview });
      if (result.error?.status === 410) return setPhase({ name: 'ended', reason: result.error.message });
      return setPhase({ name: 'join', preview });
    } catch (error) {
      return setPhase({ name: 'invalid', message: error.message });
    }
  }, [token]);
  React.useEffect(() => { enter(); }, [enter]);

  // Back from Stripe: the seat opens once Stripe confirms the payment.
  React.useEffect(() => {
    if (phase.name !== 'pending') return undefined;
    const id = setInterval(enter, PENDING_POLL_MS);
    return () => clearInterval(id);
  }, [phase.name, enter]);

  if (phase.name === 'loading') return <div style={{ ...page, fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>Opening the class…</div>;
  if (phase.name === 'invalid') return <Notice title="This class link doesn't work" body={phase.message || 'Ask your instructor for a new one.'} />;
  if (phase.name === 'ended') return <Notice title="Your seat has ended" body={`${phase.reason || 'Your class membership has ended.'} Renew it or ask your instructor to get back in.`} />;
  if (phase.name === 'pending') return <Notice title="Finishing your sign-up" body="Waiting for the payment to confirm. This page opens your board as soon as it does." />;
  if (phase.name === 'join') return <ClassJoinForm token={token} preview={phase.preview} onJoined={() => setPhase({ name: 'seat' })} onPending={() => setPhase({ name: 'pending', preview: phase.preview })} />;
  return <ClassSeat onEnded={(reason) => setPhase({ name: 'ended', reason })} />;
}
