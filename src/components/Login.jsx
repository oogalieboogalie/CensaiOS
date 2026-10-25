/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { api } from '../lib/api.js';
import { changeDesktopServer, getDesktopServer } from '../lib/desktopServer.js';
import { BrandMark, BrandWordmark } from './brand/BrandMark.jsx';
import { PairSignIn } from './login/PairSignIn.jsx';
import { HelpDialog, PrivacyDialog, TermsDialog } from './login/LoginDialogs.jsx';

// Sign-in screen. Styles live in src/styles/login.css and use only theme
// tokens, so it follows the active look (the censaiOS brand by default,
// Paper for visitors who browse light).

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

// censaiOS on this computer (the laptop install): one button, no Google, no
// email. The first use makes this computer's owner account.
function LocalSignIn({ onLoginSuccess }) {
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [waiting, setWaiting] = React.useState(false);

  const open = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.localSignIn({ name, onWaiting: () => setWaiting(true) });
      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'Could not open censaiOS');
      setLoading(false);
      setWaiting(false);
    }
  };

  return (
    <form className="hb-login-form" onSubmit={open} data-testid="local-sign-in">
      {error && <div className="hb-login-error" role="alert">{error}</div>}
      <label className="hb-login-field">
        <span>Your name (optional)</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alma" autoFocus />
      </label>
      <button type="submit" className="hb-login-primary" disabled={loading}>
        {loading ? 'Opening…' : 'Open censaiOS'}
      </button>
      <span className="hb-login-note">
        {waiting
          ? 'Getting censaiOS ready on this computer. The first start can take a few minutes; it opens by itself.'
          : 'Your account and boards stay on this computer.'}
      </span>
    </form>
  );
}

// In the laptop app, when it opens another computer's censaiOS: a way back
// to "This computer" right from the sign-in screen.
function DesktopServerNote() {
  const [server, setServer] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    getDesktopServer().then((info) => { if (live) setServer(info); });
    return () => { live = false; };
  }, []);
  if (server?.mode !== 'remote') return null;
  return (
    <p className="hb-login-note" data-testid="desktop-server-note">
      This app opens censaiOS on {server.url.replace(/^https?:\/\//, '')}.{' '}
      <button type="button" className="hb-login-link" onClick={() => changeDesktopServer().catch(() => {})}>
        Open it on this computer instead
      </button>
    </p>
  );
}

export function Login({ onLoginSuccess, oauthConfigured, localSignIn = false, fromAnotherComputer = false }) {
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [showDevForm, setShowDevForm] = React.useState(!oauthConfigured);
  const [dialog, setDialog] = React.useState(null);
  const closeDialog = React.useCallback(() => setDialog(null), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Email is required');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.developerLogin({ email, name });
      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hb-login">
      <main className="hb-login-column">
        <div className="hb-login-brand">
          <BrandMark size={56} />
          <BrandWordmark size="var(--text-2xl)" />
          <p className="hb-login-tagline">The canvas for <em>everyone</em> and <em>everything</em>.</p>
        </div>

        {fromAnotherComputer ? (
          <div className="hb-login-card"><PairSignIn onLoginSuccess={onLoginSuccess} /></div>
        ) : localSignIn ? (
          <div className="hb-login-card">
            {oauthConfigured && (
              <a className="hb-login-provider" href="/api/auth/google"><GoogleIcon />Continue with Google</a>
            )}
            <LocalSignIn onLoginSuccess={onLoginSuccess} />
          </div>
        ) : (
        <div className="hb-login-card">
          {/* Only real ways in: Google when this install has it set up, then email. */}
          {oauthConfigured && (
            <>
              <a className="hb-login-provider" href="/api/auth/google"><GoogleIcon />Continue with Google</a>
              <button type="button" className="hb-login-provider" aria-expanded={showDevForm} data-active={showDevForm || undefined} onClick={() => setShowDevForm((v) => !v)}>
                <MailIcon />Continue with email
              </button>
            </>
          )}

          {showDevForm && (
            <form className="hb-login-form" onSubmit={handleSubmit}>
              {oauthConfigured && <div className="hb-login-divider"><span>Email</span></div>}
              {error && <div className="hb-login-error" role="alert">{error}</div>}
              <label className="hb-login-field">
                <span>Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus />
              </label>
              <label className="hb-login-field">
                <span>Name (optional)</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alma" />
              </label>
              <button type="submit" className="hb-login-primary" disabled={loading}>
                {loading ? 'Entering…' : 'Enter Canvas'}
              </button>
              <span className="hb-login-note">Signs in to this install of censaiOS.</span>
            </form>
          )}
        </div>
        )}

        <DesktopServerNote />

        <footer className="hb-login-footer">
          <button type="button" onClick={() => setDialog('privacy')}>Privacy</button>
          <button type="button" onClick={() => setDialog('terms')}>Terms</button>
          <button type="button" onClick={() => setDialog('help')}>Help</button>
        </footer>
      </main>
      {dialog === 'privacy' && <PrivacyDialog onClose={closeDialog} />}
      {dialog === 'terms' && <TermsDialog onClose={closeDialog} />}
      {dialog === 'help' && <HelpDialog onClose={closeDialog} />}
    </div>
  );
}
