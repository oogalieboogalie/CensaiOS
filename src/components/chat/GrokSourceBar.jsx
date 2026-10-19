/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

/**
 * Above a Grok chat's message box: run Grok on "My Grok sign-in" (the
 * person's own SuperGrok or Grok Heavy plan, through xAI's Grok CLI) or on
 * their "xAI key" (API credits). State comes from useGrokSource.
 */
export function GrokSourceBar({ grok }) {
  if (!grok?.active || grok.status?.unavailable) return null;
  const { status, source, setSource, signOut, busy } = grok;
  const choices = [['signin', 'My Grok sign-in'], ['key', 'xAI key']];
  return (
    <div className="hb-grok-source" data-testid="grok-source">
      <div className="hb-grok-source-row">
        <span className="hb-grok-source-label">Grok runs on</span>
        <div className="hb-grok-source-choices" role="radiogroup" aria-label="Where Grok runs">
          {choices.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={source === id}
              className="hb-grok-source-choice" data-on={source === id ? 'true' : undefined}
              onClick={() => source !== id && setSource(id)}>
              {label}
            </button>
          ))}
        </div>
        {source === 'signin' && status?.signedIn && (
          <span className="hb-grok-source-note">
            Your own Grok plan, no API cost.
            <button type="button" className="hb-grok-source-link" disabled={busy} onClick={signOut}>Sign out</button>
          </span>
        )}
        {source === 'key' && <span className="hb-grok-source-note">Uses your xAI key from Settings (billed per message by xAI).</span>}
      </div>
      {source === 'signin' && status && !status.signedIn && <GrokSignInCard grok={grok} />}
    </div>
  );
}

function GrokSignInCard({ grok }) {
  const { status, login, busy, error, signIn } = grok;
  if (!status.installed) {
    return (
      <div className="hb-grok-card" data-testid="grok-not-installed">
        <div className="hb-grok-card-title">Grok is not installed in censaiOS yet</div>
        <p className="hb-grok-card-text">
          It installs with censaiOS itself. Close censaiOS and open it again from the desktop shortcut, then come back to this chat.
          Until then, pick &quot;xAI key&quot; above.
        </p>
      </div>
    );
  }
  if (login?.running) {
    return (
      <div className="hb-grok-card" data-testid="grok-signin-waiting">
        <div className="hb-grok-card-title">Approve censaiOS on x.ai</div>
        {login.url ? (
          <ol className="hb-grok-card-steps">
            <li>Open <a href={login.url} target="_blank" rel="noopener noreferrer">{login.url}</a></li>
            {login.code && <li>Enter this code: <code className="hb-grok-card-code">{login.code}</code></li>}
            <li>Approve with your Grok account. This box changes by itself when you are in.</li>
          </ol>
        ) : (
          <pre className="hb-grok-card-lines">{(login.lines || []).join('\n') || 'Starting Grok…'}</pre>
        )}
      </div>
    );
  }
  return (
    <div className="hb-grok-card" data-testid="grok-signin">
      <div className="hb-grok-card-title">Sign in with your own Grok account</div>
      <p className="hb-grok-card-text">
        One time only. Grok in this chat then runs on your SuperGrok or Grok Heavy plan instead of API credits.
        Your sign-in is yours alone; teammates sign in with their own.
      </p>
      {(error || login?.error) && <div className="hb-grok-card-error">{error || login.error}</div>}
      <button type="button" className="hb-grok-card-button" disabled={busy} onClick={signIn}>
        {busy ? 'Starting…' : 'Sign in to Grok'}
      </button>
    </div>
  );
}
