import React from 'react';
import { logToApp } from '../../lib/appLog/browserLog.js';
import { fetchGrokStatus, grokSignOut, isGrokChat, sendGrokSigninMessage, startGrokSignIn } from '../../lib/chat/grokSignin.js';

const POLL_MS = 3000;

/**
 * Where a Grok chat's replies come from: the person's own Grok sign-in
 * (their SuperGrok or Grok Heavy plan, through xAI's Grok CLI) or their xAI
 * API key. The choice is kept on the window (win.grokVia); until it is made,
 * a signed-in person gets their sign-in, everyone else their key.
 *
 * `sendVia` is set only while the sign-in is in use; useChat sends through
 * it instead of /api/chat.
 */
export function useGrokSource({ win, onUpdate, provider }) {
  const active = isGrokChat(provider) && !win.demoMode;
  const [status, setStatus] = React.useState(null);
  const [login, setLogin] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const refresh = React.useCallback(async () => {
    try {
      const next = await fetchGrokStatus();
      setStatus(next);
      if (next.login) setLogin(next.login);
      return next;
    } catch (err) {
      // Cloud servers have no Grok CLI: the key stays the only way.
      setStatus({ installed: false, signedIn: false, unavailable: true });
      logToApp('warn', 'Grok sign-in status could not be read', { detail: err?.message });
      return null;
    }
  }, []);

  React.useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);

  // While x.ai waits for the person to approve, check every few seconds.
  const waiting = Boolean(login?.running && !status?.signedIn);
  React.useEffect(() => {
    if (!active || !waiting) return undefined;
    const timer = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, waiting, refresh]);

  const source = win.grokVia || (status?.signedIn ? 'signin' : 'key');
  const setSource = (next) => onUpdate({ grokVia: next, grokSessionId: null });

  const signIn = async () => {
    setBusy(true);
    setError('');
    try {
      const { login: started } = await startGrokSignIn();
      setLogin(started);
      if (!started?.url) logToApp('warn', 'Grok sign-in printed no link yet', { detail: (started?.lines || []).join(' | ') });
    } catch (err) {
      setError(err?.message || 'Grok sign-in could not start.');
      logToApp('warn', 'Grok sign-in could not start', { detail: err?.message });
    }
    setBusy(false);
  };

  const signOut = async () => {
    setBusy(true);
    await grokSignOut().catch((err) => logToApp('warn', 'Grok sign-out failed', { detail: err?.message }));
    setLogin(null);
    onUpdate({ grokSessionId: null });
    await refresh();
    setBusy(false);
  };

  const sendVia = active && source === 'signin'
    ? (_agentId, messages, opts) => sendGrokSigninMessage(messages, { ...opts, sessionId: win.grokSessionId || null })
      .then((reply) => {
        onUpdate({ grokSessionId: reply.grokSessionId });
        return reply;
      })
      .catch((err) => {
        if (err?.code === 'GROK_SIGNIN_REQUIRED' || err?.code === 'GROK_NOT_INSTALLED') refresh();
        throw err;
      })
    : null;

  return { active, status, login, busy, error, source, setSource, signIn, signOut, sendVia };
}
