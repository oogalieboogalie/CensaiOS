/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

// The three footer dialogs on the sign-in screen: Privacy, Terms and Help.
// Styles live in src/styles/login.css (hb-login-dialog*).

const DISCORD_URL = 'https://discord.gg/A8rPkBJDyP';
const SOURCE_URL = 'https://github.com/oogalieboogalie/CensaiOS';
const LICENSE_URL = 'https://www.apache.org/licenses/LICENSE-2.0';

const AI_PROVIDERS = [
  { name: 'Ollama (local)', tag: 'Fully private', body: 'Runs entirely on your own hardware. No prompt data, code or agent personalities leave your machine.' },
  { name: 'Google Gemini', tag: 'Cloud API', body: 'Prompts, code context and tool payloads go to Google Gemini endpoints under the Google Cloud API terms (inputs are generally not used for training).' },
  { name: 'OpenRouter', tag: 'Cloud proxy', body: "Routes your requests to the model you pick. Prompts and tool parameters pass through OpenRouter's gateway." },
  { name: 'Cohere', tag: 'Cloud API', body: "Used for embeddings and some chat requests under Cohere's production privacy policies." },
  { name: 'Moonshot / Kimi', tag: 'Cloud API', body: 'Prompts and context go to Moonshot endpoints under Moonshot AI policies.' },
];

function LoginDialog({ id, title, subtitle, onClose, children }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="hb-login-scrim" role="presentation" onClick={onClose}>
      <div className="hb-login-dialog" role="dialog" aria-modal="true" aria-labelledby={id} onClick={(e) => e.stopPropagation()}>
        <header className="hb-login-dialog-head">
          <div>
            <h3 id={id}>{title}</h3>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="hb-login-ghost" onClick={onClose}>Close</button>
        </header>
        <div className="hb-login-dialog-body">{children}</div>
        <footer className="hb-login-dialog-foot">
          <button type="button" className="hb-login-primary" onClick={onClose}>Got it</button>
        </footer>
      </div>
    </div>
  );
}

export function PrivacyDialog({ onClose }) {
  return (
    <LoginDialog id="hb-privacy-title" title="Privacy and data flow" subtitle="For self-hosted and cloud workspaces." onClose={onClose}>
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
        <p>Google sign-in requests go straight to Google. Their policy:</p>
        <div className="hb-login-links">
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google privacy policy</a>
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
    </LoginDialog>
  );
}

export function TermsDialog({ onClose }) {
  return (
    <LoginDialog id="hb-terms-title" title="Terms" subtitle="The short version, in plain words." onClose={onClose}>
      <section className="hb-login-callout">
        <h4>Open source</h4>
        <p>
          censaiOS is open source under the Apache License 2.0. You can use it, change it and share it,
          for free, including for work.
        </p>
        <div className="hb-login-links">
          <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">Read the license</a>
          <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">See the source</a>
        </div>
      </section>
      <section>
        <h4>Your keys, your bill</h4>
        <p>
          You bring your own AI keys. What you send to an AI provider is covered by that provider's terms,
          and any cost is between you and them.
        </p>
      </section>
      <section>
        <h4>As is</h4>
        <p>
          censaiOS is a beta and comes as is, without warranty. Keep copies of anything important, and check
          what an agent wrote before you send it to someone.
        </p>
      </section>
    </LoginDialog>
  );
}

export function HelpDialog({ onClose }) {
  return (
    <LoginDialog id="hb-help-title" title="Help" subtitle="Getting in, and where to ask." onClose={onClose}>
      <section className="hb-login-callout">
        <h4>Signing in</h4>
        <p>
          On your own computer, press <strong>Open censaiOS</strong>. Your name is optional. On a shared
          install, sign in with Google or your email.
        </p>
      </section>
      <section>
        <h4>Your boards</h4>
        <p>
          Boards are saved on the computer that runs censaiOS. Signing in again on the same install brings
          everything back where you left it.
        </p>
      </section>
      <section>
        <h4>Stuck?</h4>
        <p>Ask in the Discord, or report a problem on GitHub.</p>
        <div className="hb-login-links">
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">Join the Discord</a>
          <a href={`${SOURCE_URL}/issues`} target="_blank" rel="noopener noreferrer">Report a problem</a>
        </div>
      </section>
    </LoginDialog>
  );
}
