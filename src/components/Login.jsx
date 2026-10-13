/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { api } from '../lib/api.js';
import { changeDesktopServer, getDesktopServer } from '../lib/desktopServer.js';
import { BrandMark, BrandWordmark } from './brand/BrandMark.jsx';
import { PairSignIn } from './login/PairSignIn.jsx';

// Sign-in screen. Styles live in src/styles/login.css and use only theme
// tokens, so it follows the active look (the censaiOS brand by default,
// Paper for visitors who browse light).

const AI_PROVIDERS = [
  { name: 'Ollama (local)', tag: 'Fully private', body: 'Runs entirely on your own hardware. No prompt data, code or agent personalities leave your machine.' },
  { name: 'Google Gemini', tag: 'Cloud API', body: 'Prompts, code context and tool payloads go to Google Gemini endpoints under the Google Cloud API terms (inputs are generally not used for training).' },
  { name: 'OpenRouter', tag: 'Cloud proxy', body: "Routes your requests to the model you pick. Prompts and tool parameters pass through OpenRouter's gateway." },
  { name: 'Cohere', tag: 'Cloud API', body: "Used for embeddings and some chat requests under Cohere's production privacy policies." },
  { name: 'Moonshot / Kimi', tag: 'Cloud API', body: 'Prompts and context go to Moonshot endpoints under Moonshot AI policies.' },
];

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

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
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

function KeyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="15" r="4" />
      <path d="m10.85 12.15 8.65-8.65M17 6l2 2M14 9l2 2" />
    </svg>
  );
}

function PrivacyDialog({ onClose }) {
  return (
    <div className="hb-login-scrim" role="presentation" onClick={onClose}>
      <div className="hb-login-dialog" role="dialog" aria-modal="true" aria-labelledby="hb-privacy-title" onClick={(e) => e.stopPropagation()}>
        <header className="hb-login-dialog-head">
          <div>
            <h3 id="hb-privacy-title">Privacy and data flow</h3>
            <p>For self-hosted and cloud workspaces.</p>
          </div>
          <button type="button" className="hb-login-ghost" onClick={onClose}>Close</button>
        </header>
        <div className="hb-login-dialog-body">
          <section className="hb-login-callout">
            <h4>Where your boards live</h4>
            <p>
              Depending on how censaiOS is installed, boards, layouts and settings are kept in your browser
              (under <code>homebase.workspace.v1</code>) or in your own database. There is no telemetry,
              usage analytics or keystroke tracking.
            </p>
          </section>
          <section>
            <h4>Journal encryption</h4>
            <p>
              Agent journals are encrypted at rest with AES-256-GCM. Keys come from environment variables on
              self-hosted installs, or an isolated key vault in the cloud.
            </p>
          </section>
          <section>
            <h4>Sign-in providers</h4>
            <p>OAuth sign-in requests go straight to the provider. Their policies:</p>
            <div className="hb-login-links">
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google privacy policy</a>
              <a href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement" target="_blank" rel="noopener noreferrer">GitHub privacy statement</a>
            </div>
          </section>
          <section>
            <h4>AI providers</h4>
            <p>Agent prompts go to the model you choose in settings:</p>
            <ul className="hb-login-providers">
              {AI_PROVIDERS.map((p) => (
                <li key={p.name}>
                  <div><strong>{p.name}</strong><span className="hb-login-tag">{p.tag}</span></div>
                  <p>{p.body}</p>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h4>Storage boundaries</h4>
            <p>
              On a self-hosted install, PostgreSQL and Qdrant run on your machine. Cloud workspaces keep data in
              isolated database clusters behind firewalls and authentication.
            </p>
          </section>
        </div>
        <footer className="hb-login-dialog-foot">
          <button type="button" className="hb-login-primary" onClick={onClose}>Got it</button>
        </footer>
      </div>
    </div>
  );
}

// censaiOS on this computer (the laptop install): one button, no Google, no
// email. The first use makes this computer's owner account.
function LocalSignIn({ onLoginSuccess }) {
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const open = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.localSignIn({ name });
      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'Could not open censaiOS');
      setLoading(false);
    }
  };

  return (
    <form className="hb-login-form" onSubmit={open} data-testid="local-sign-in">
      {error && <div className="hb-login-error" role="alert">{error}</div>}
      <label className="hb-login-field">
        <span>Your name (optional)</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" autoFocus />
      </label>
      <button type="submit" className="hb-login-primary" disabled={loading}>
        {loading ? 'Opening…' : 'Open censaiOS'}
      </button>
      <span className="hb-login-note">Your account and boards stay on this computer.</span>
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
  const [showPrivacy, setShowPrivacy] = React.useState(false);

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
          <p className="hb-login-tagline">The canvas for everyone and everything.</p>
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
          {oauthConfigured ? (
            <a className="hb-login-provider" href="/api/auth/google"><GoogleIcon />Continue with Google</a>
          ) : (
            <button type="button" className="hb-login-provider" onClick={() => alert('Google sign-in is not configured here. Use email below.')}>
              <GoogleIcon />Continue with Google
            </button>
          )}
          <button type="button" className="hb-login-provider" onClick={() => alert('GitHub sign-in is not configured here. Use Google or email.')}>
            <GitHubIcon />Continue with GitHub
          </button>
          <button type="button" className="hb-login-provider" aria-expanded={showDevForm} data-active={showDevForm || undefined} onClick={() => setShowDevForm((v) => !v)}>
            <MailIcon />Continue with email
          </button>
          <button type="button" className="hb-login-provider" onClick={() => alert('Passkey sign-in is not configured in this environment.')}>
            <KeyIcon />Use a passkey
          </button>

          {showDevForm && (
            <form className="hb-login-form" onSubmit={handleSubmit}>
              <div className="hb-login-divider"><span>Email</span></div>
              {error && <div className="hb-login-error" role="alert">{error}</div>}
              <label className="hb-login-field">
                <span>Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus />
              </label>
              <label className="hb-login-field">
                <span>Name (optional)</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" />
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
          <button type="button" onClick={() => setShowPrivacy(true)}>Privacy</button>
          <a href="#" onClick={(e) => e.preventDefault()}>Terms</a>
          <a href="#" onClick={(e) => e.preventDefault()}>Help</a>
        </footer>
      </main>
      {showPrivacy && <PrivacyDialog onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}
