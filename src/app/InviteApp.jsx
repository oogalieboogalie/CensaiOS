import React from 'react';
import { BrandMark, BrandWordmark } from '../components/brand/BrandMark.jsx';
import { previewInvite, redeemInvite } from '../lib/invites/index.js';
import { workspaceShareLink } from '../lib/workspace/shareLink.js';

// Opened from an "Invite to this board" link (?invite=<code>): the person
// types their name, gets their own account here, and lands on that board.
export function InviteApp({ code }) {
  const [invite, setInvite] = React.useState(null);
  const [name, setName] = React.useState('');
  const [state, setState] = React.useState({ status: 'loading', message: '' });

  React.useEffect(() => {
    let cancelled = false;
    previewInvite(code)
      .then((data) => { if (!cancelled) { setInvite(data); setState({ status: 'ready', message: '' }); } })
      .catch((error) => { if (!cancelled) setState({ status: 'error', message: error.message }); });
    return () => { cancelled = true; };
  }, [code]);

  const join = async (event) => {
    event.preventDefault();
    setState({ status: 'joining', message: '' });
    try {
      const result = await redeemInvite(code, name);
      // Drops the code from the address bar: it is used up now.
      window.location.replace(workspaceShareLink(result.workspaceId, { href: `${window.location.origin}/` }));
    } catch (error) {
      setState({ status: error.status === 410 ? 'error' : 'ready', message: error.message });
    }
  };

  return (
    <div className="hb-login" data-testid="invite-screen">
      <main className="hb-login-column">
        <div className="hb-login-brand">
          <BrandMark size={56} />
          <BrandWordmark size="var(--text-2xl)" />
        </div>
        <div className="hb-login-card">
          {state.status === 'loading' ? <p className="hb-login-note" role="status">Opening your invite…</p> : null}
          {invite && state.status !== 'error' ? (
            <form className="hb-login-form" onSubmit={join}>
              <p className="hb-login-note">
                <strong>{invite.byName}</strong> invited you to <strong>{invite.boardName}</strong>.
                Type your name and you are in. You will see each other on the board live.
              </p>
              {state.message ? <div className="hb-login-error" role="alert">{state.message}</div> : null}
              <label className="hb-login-field">
                <span>Your name</span>
                <input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Sam" required autoFocus />
              </label>
              <button type="submit" className="hb-login-primary" disabled={state.status === 'joining' || !name.trim()}>
                {state.status === 'joining' ? 'Joining…' : 'Join the board'}
              </button>
            </form>
          ) : null}
          {state.status === 'error' ? (
            <>
              <div className="hb-login-error" role="alert">{state.message}</div>
              <button type="button" className="hb-login-primary" onClick={() => window.location.replace('/')}>
                Go to sign-in
              </button>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
