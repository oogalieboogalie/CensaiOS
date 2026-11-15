import React from 'react';
import { enterParty, partyHello } from '../../lib/friends/index.js';

/**
 * Sign-in when this page was opened through a friend's party code. The
 * person's own censaiOS made the connection, and the friend's censaiOS only
 * answers on it for this one person, so there is nothing to type: they come
 * in as themselves, on the board that was shared. Any other page gets the
 * usual sign-in (`children`).
 */
const ENTERED_KEY = 'homebase.friends.entered.v1';
const TOKEN_KEY = 'homebase.friends.party.v1';

// Set once this tab has been let in. If the sign-in screen shows again in the
// same tab, the person signed out on purpose: offer a button instead of
// signing them straight back in.
function enteredBefore() {
  try { return globalThis.sessionStorage?.getItem(ENTERED_KEY) === '1'; } catch { return false; }
}
function rememberEntered() {
  try { globalThis.sessionStorage?.setItem(ENTERED_KEY, '1'); } catch { /* private mode */ }
}

/**
 * The party's password. The person's own censaiOS put it in the address
 * (?party=…) when it opened this page. It is kept for this tab only and
 * taken out of the address, so a copied link or a screenshot does not carry it.
 */
function partyPassword(win = globalThis) {
  let token = '';
  try {
    const url = new URL(win.location.href);
    token = url.searchParams.get('party') || '';
    if (token) {
      url.searchParams.delete('party');
      win.history.replaceState(null, '', url);
      win.sessionStorage?.setItem(TOKEN_KEY, token);
    } else {
      token = win.sessionStorage?.getItem(TOKEN_KEY) || '';
    }
  } catch {
    // No address or no storage: whatever was read so far is used.
  }
  return /^[A-Za-z0-9_-]{20,64}$/.test(token) ? token : '';
}

/** Puts the shared board in the address, so it is the board that opens. */
function pointAtBoard(boardId, win = globalThis) {
  try {
    const url = new URL(win.location.href);
    url.searchParams.set('workspace', boardId);
    win.history.replaceState(null, '', url);
  } catch {
    // The friend still lands in the copy; the shared board is in their list.
  }
}

export function FriendEntry({ onLoginSuccess, children }) {
  const [state, setState] = React.useState({ step: 'checking', hello: null, error: '' });
  const token = React.useRef('');

  const enter = React.useCallback(async (hello) => {
    setState({ step: 'entering', hello, error: '' });
    try {
      const entered = await enterParty(token.current);
      rememberEntered();
      pointAtBoard(entered.boardId || hello.boardId);
      onLoginSuccess();
    } catch (error) {
      setState({ step: 'closed', hello, error: error.message });
    }
  }, [onLoginSuccess]);

  React.useEffect(() => {
    let live = true;
    (async () => {
      token.current = partyPassword();
      const hello = await partyHello(token.current).catch(() => null);
      if (!live) return;
      if (hello?.app !== 'censaiOS') return setState({ step: 'usual', hello: null, error: '' });
      // A shared board, but this page was not opened with its party code.
      if (hello.needsCode || !hello.boardId) return setState({ step: 'needs-code', hello: null, error: '' });
      if (enteredBefore()) return setState({ step: 'ask', hello, error: '' });
      return enter(hello);
    })();
    return () => { live = false; };
    // Runs once: the answer does not change while this screen is open.
  }, []);

  if (state.step === 'usual') return children;
  if (state.step === 'checking') {
    return <p className="hb-login-note" role="status" data-testid="friend-entry">Checking who shared this…</p>;
  }
  if (state.step === 'needs-code') {
    return (
      <div className="hb-login-form" data-testid="friend-entry">
        <p className="hb-login-note" role="alert">This board is shared with one friend, and it opens from their party code.</p>
        <p className="hb-login-note">In your own censaiOS open Settings, Sharing, Friends, and paste the party code there. It opens the board for you.</p>
      </div>
    );
  }
  const { hello } = state;
  if (state.step === 'entering') {
    return <p className="hb-login-note" role="status" data-testid="friend-entry">Opening {hello.host}'s board "{hello.boardName}"…</p>;
  }
  if (state.step === 'closed') {
    return (
      <div className="hb-login-form" data-testid="friend-entry">
        <p className="hb-login-note" role="alert">{state.error || `${hello.host} is not sharing this board with you right now.`}</p>
        <p className="hb-login-note">Ask {hello.host} to share it again and send you the new party code.</p>
      </div>
    );
  }
  return (
    <div className="hb-login-form" data-testid="friend-entry">
      <p className="hb-login-note">
        You left <strong>{hello.host}</strong>'s board "{hello.boardName}". It is still shared with you, {hello.friend}.
      </p>
      <button type="button" className="hb-login-primary" onClick={() => enter(hello)}>Go back in</button>
    </div>
  );
}
