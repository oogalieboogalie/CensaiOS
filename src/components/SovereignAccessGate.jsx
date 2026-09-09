import React from 'react';
import { api } from '../lib/api.js';
import { BYOK_PROVIDERS } from '../lib/byokProviders.js';

export function SovereignAccessGate({ onConfigured }) {
  const [provider, setProvider] = React.useState(BYOK_PROVIDERS[0].id);
  const [apiKey, setApiKey] = React.useState('');
  const [status, setStatus] = React.useState('checking');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    api.getUserKeys()
      .then((keys) => {
        if (cancelled) return;
        const supportedIds = new Set(BYOK_PROVIDERS.map((item) => item.id));
        if (keys.some((key) => key.hasKey && supportedIds.has(key.provider))) onConfigured();
        else setStatus('ready');
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setStatus('ready');
        }
      });
    return () => { cancelled = true; };
  }, [onConfigured]);

  const selectedProvider = BYOK_PROVIDERS.find((item) => item.id === provider);

  const saveKey = async (event) => {
    event.preventDefault();
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) return;

    setStatus('saving');
    setError('');
    try {
      await api.setUserKey(provider, trimmedKey);
      setApiKey('');
      onConfigured();
    } catch (err) {
      setError(err.message);
      setStatus('ready');
    }
  };

  const signOut = async () => {
    await api.logout();
    window.location.reload();
  };

  return (
    <main style={{
      position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
      padding: 24, background: 'var(--canvas)', color: 'var(--ink)',
      fontFamily: 'var(--font-sans)',
    }}>
      <form onSubmit={saveKey} style={{
        width: 'min(440px, 100%)', display: 'grid', gap: 18, padding: 28,
        border: '1px solid var(--hairline)', borderRadius: 12,
        background: 'var(--surface)', boxShadow: 'var(--shadow-card)',
      }}>
        <div>
          <div style={{
            color: 'var(--accent-ink)', fontFamily: 'var(--font-mono)',
            fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Sovereign Alpha
          </div>
          <h1 style={{ margin: '7px 0 8px', fontSize: 24 }}>Connect your AI provider</h1>
          <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 13, lineHeight: 1.55 }}>
            Add one personal provider key to unlock the canvas. The key is encrypted before it is stored and is only used for your requests.
          </p>
        </div>

        <label style={{ display: 'grid', gap: 7, fontSize: 12, fontWeight: 700 }}>
          Provider
          <select
            aria-label="Provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            disabled={status !== 'ready'}
            style={fieldStyle}
          >
            {BYOK_PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 7, fontSize: 12, fontWeight: 700 }}>
          API key
          <input
            aria-label="API key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={selectedProvider?.placeholder}
            disabled={status !== 'ready'}
            style={fieldStyle}
          />
        </label>

        {error && (
          <div role="alert" style={{
            padding: 10, borderRadius: 7, background: 'var(--surface-2)',
            color: 'var(--ps-red)', fontSize: 12,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={status !== 'ready' || !apiKey.trim()}
          style={{
            border: 0, borderRadius: 8, padding: '11px 16px',
            background: 'var(--accent)', color: 'white', fontWeight: 800,
            cursor: status === 'ready' ? 'pointer' : 'wait',
            opacity: status === 'ready' && apiKey.trim() ? 1 : 0.55,
          }}
        >
          {status === 'checking' ? 'Checking vault…' : status === 'saving' ? 'Encrypting…' : 'Save key and open canvas'}
        </button>

        <button
          type="button"
          onClick={signOut}
          style={{
            border: 0, background: 'transparent', color: 'var(--ink-faint)',
            cursor: 'pointer', fontSize: 12,
          }}
        >
          Sign out
        </button>
      </form>
    </main>
  );
}

const fieldStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  border: '1px solid var(--hairline)', borderRadius: 7,
  background: 'var(--surface-2)', color: 'var(--ink)',
  fontFamily: 'var(--font-mono)', fontSize: 13,
};
