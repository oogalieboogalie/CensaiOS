import { useState, useRef } from 'react';
import './WindowImporterWindow.css';

const STEPS = ['paste', 'importing', 'done', 'error'];

const PLACEHOLDER_JSX = `// Paste your AI Studio JSX here.
// e.g. the contents of App.tsx or your main component file.
// The AI will strip the Vite wrapper, fix exports, and adapt colors automatically.

export default function App() {
  return (
    <div style={{ padding: 24, color: '#fff', background: '#1a1a2e' }}>
      <h1>My Window</h1>
      <p>Replace this with your AI Studio output.</p>
    </div>
  );
}`;

export function WindowImporterWindow() {
  const [step, setStep]           = useState('paste');    // 'paste' | 'importing' | 'done' | 'error'
  const [jsx, setJsx]             = useState('');
  const [css, setCss]             = useState('');
  const [hint, setHint]           = useState('');
  const [addLauncher, setAddLauncher] = useState(true);
  const [result, setResult]       = useState(null);       // server response
  const [error, setError]         = useState(null);
  const [activeTab, setActiveTab] = useState('jsx');      // 'jsx' | 'css' | 'options'
  const jsxRef = useRef(null);

  async function handleImport() {
    if (!jsx.trim()) return;
    setStep('importing');
    setError(null);
    setResult(null);

    try {
      const body = {
        rawJsx: jsx,
        rawCss: css,
        hint,
        ...(addLauncher ? {
          launcher: { show: true, order: 200, icon: 'Tools', label: '', hint: '' },
        } : {}),
      };

      const res = await fetch('/api/windows/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setResult(data);
      setStep('done');
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  }

  function handleReset() {
    setStep('paste');
    setJsx('');
    setCss('');
    setHint('');
    setResult(null);
    setError(null);
  }

  // ── Paste state ──────────────────────────────────────────────────────────
  if (step === 'paste') {
    return (
      <div className="wi-root">
        <div className="wi-header">
          <span className="wi-icon">📦</span>
          <div>
            <h2 className="wi-title">Window Importer</h2>
            <p className="wi-subtitle">Paste AI Studio output → AI adapts it → drops it on your canvas</p>
          </div>
        </div>

        <div className="wi-tabs">
          {['jsx', 'css', 'options'].map(t => (
            <button
              key={t}
              className={`wi-tab ${activeTab === t ? 'wi-tab--active' : ''}`}
              onClick={() => setActiveTab(t)}
            >
              {t === 'jsx' ? '⚛ JSX / TSX' : t === 'css' ? '🎨 CSS' : '⚙ Options'}
              {t === 'jsx' && jsx.trim() && <span className="wi-tab-dot" />}
              {t === 'css' && css.trim() && <span className="wi-tab-dot" />}
            </button>
          ))}
        </div>

        <div className="wi-editor-wrap">
          {activeTab === 'jsx' && (
            <textarea
              ref={jsxRef}
              className="wi-editor"
              value={jsx}
              onChange={e => setJsx(e.target.value)}
              placeholder={PLACEHOLDER_JSX}
              spellCheck={false}
              id="wi-jsx-input"
            />
          )}
          {activeTab === 'css' && (
            <textarea
              className="wi-editor"
              value={css}
              onChange={e => setCss(e.target.value)}
              placeholder="/* Paste your CSS here (optional) */\n/* Hardcoded colors will be replaced with CSS variables */"
              spellCheck={false}
              id="wi-css-input"
            />
          )}
          {activeTab === 'options' && (
            <div className="wi-options">
              <label className="wi-opt-label">
                Hint for the AI
                <span className="wi-opt-hint">Tell it what this window does, or any special requirements</span>
              </label>
              <textarea
                className="wi-editor wi-editor--short"
                value={hint}
                onChange={e => setHint(e.target.value)}
                placeholder="e.g. 'This is a Docker container manager. Keep the connection config panel.'"
                spellCheck={false}
                id="wi-hint-input"
              />

              <label className="wi-opt-toggle" id="wi-launcher-toggle">
                <input
                  type="checkbox"
                  checked={addLauncher}
                  onChange={e => setAddLauncher(e.target.checked)}
                />
                <span>Add to canvas launcher tiles</span>
              </label>
            </div>
          )}
        </div>

        <div className="wi-footer">
          <span className="wi-footer-hint">
            {jsx.trim()
              ? `${jsx.trim().split('\n').length} lines of JSX ready${css.trim() ? ' + CSS' : ''}`
              : 'Paste your JSX to get started'}
          </span>
          <button
            className="wi-import-btn"
            onClick={handleImport}
            disabled={!jsx.trim()}
            id="wi-import-btn"
          >
            Adapt &amp; Import →
          </button>
        </div>
      </div>
    );
  }

  // ── Importing state ──────────────────────────────────────────────────────
  if (step === 'importing') {
    return (
      <div className="wi-root wi-root--centered">
        <div className="wi-spinner" />
        <p className="wi-loading-text">AI is adapting your code…</p>
        <p className="wi-loading-sub">Stripping Vite wrapper · fixing exports · replacing colors</p>
      </div>
    );
  }

  // ── Done state ───────────────────────────────────────────────────────────
  if (step === 'done' && result) {
    return (
      <div className="wi-root wi-root--centered">
        <div className="wi-success-icon">✓</div>
        <h3 className="wi-success-title">{result.label} imported!</h3>
        <p className="wi-success-sub">
          Kind: <code>{result.kind}</code> · Component: <code>{result.componentName}</code>
        </p>
        {result.syncOk ? (
          <div className="wi-sync-badge wi-sync-badge--ok">
            ✓ window:sync passed — hidden until it is proven and published
          </div>
        ) : (
          <div className="wi-sync-badge wi-sync-badge--warn">
            ⚠ Files written but sync had an issue — run <code>npm run window:sync</code>
          </div>
        )}
        {result.syncOutput && (
          <pre className="wi-sync-log">{result.syncOutput.slice(0, 600)}</pre>
        )}
        <button className="wi-import-btn" onClick={handleReset} style={{ marginTop: 16 }}>
          Import Another
        </button>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div className="wi-root wi-root--centered">
        <div className="wi-error-icon">✗</div>
        <h3 className="wi-error-title">Import failed</h3>
        <p className="wi-error-msg">{error}</p>
        <button className="wi-import-btn" onClick={() => setStep('paste')} style={{ marginTop: 12 }}>
          ← Go back
        </button>
      </div>
    );
  }

  return null;
}

export default WindowImporterWindow;
