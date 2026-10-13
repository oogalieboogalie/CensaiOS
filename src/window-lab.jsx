import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { ThemeProvider } from './components/Theme.jsx';
import { WindowFrame, WINDOW_TYPES } from './components/windows/windowRuntime.js';
import { WindowLabClosedPreview } from './components/windows/WindowLabClosedPreview.jsx';
import {
  WINDOW_MANIFESTS,
  buildWindowLabObject,
  getDefaultWindowSize,
  getWindowManifest,
} from './lib/windowManifest.js';
const query = new URLSearchParams(window.location.search);
const initialKind = query.get('kind') || WINDOW_MANIFESTS[0]?.kind || 'chat';
function safeJson(value, fallback) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}
function toComponentName(kind) {
  const normalized = String(kind || '')
    .replace(/[^A-Za-z0-9_ -]/g, '')
    .replace(/[_ -]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
  if (!normalized) return '';
  return normalized.endsWith('Window') ? normalized : `${normalized}Window`;
}
function toKind(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_ -]/g, '')
    .replace(/[_ -]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toLowerCase());
}
function WindowLab() {
  const [kind, setKind] = React.useState(initialKind);
  const [win, setWin] = React.useState(() => buildWindowLabObject(initialKind, { x: 24, y: 24 }));
  const [previewOpen, setPreviewOpen] = React.useState(true);
  const [propsText, setPropsText] = React.useState(() => {
    const manifest = getWindowManifest(initialKind);
    return safeJson(manifest?.lab?.props || {}, '{}');
  });
  const [error, setError] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createStatus, setCreateStatus] = React.useState('');
  const [createForm, setCreateForm] = React.useState({
    name: '',
    kind: '',
    button: 'Run',
    text: '',
    width: 520,
    height: 360,
  });
  const [creating, setCreating] = React.useState(false);
  const manifest = getWindowManifest(kind);
  const Renderer = WINDOW_TYPES[win.kind] || WINDOW_TYPES[win.type];
  const previewSize = getDefaultWindowSize(kind);

  const loadKind = React.useCallback((nextKind) => {
    const nextManifest = getWindowManifest(nextKind);
    const nextWin = buildWindowLabObject(nextKind, { x: 24, y: 24 });
    setKind(nextKind);
    setWin(nextWin);
    setPreviewOpen(true);
    setPropsText(safeJson(nextManifest?.lab?.props || {}, '{}'));
    setError('');
    const url = new URL(window.location.href);
    url.searchParams.set('kind', nextKind);
    window.history.replaceState(null, '', url);
  }, []);

  const applyProps = React.useCallback(() => {
    try {
      const parsed = propsText.trim() ? JSON.parse(propsText) : {};
      setWin((current) => ({ ...buildWindowLabObject(kind, { x: current.x, y: current.y }), ...parsed }));
      setPreviewOpen(true);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [kind, propsText]);

  const updateSize = (patch) => {
    setWin((current) => ({ ...current, ...patch, width: patch.w || current.width, height: patch.h || current.height }));
  };

  const updateCreateField = (field, value) => {
    setCreateForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'name') {
        const cleanKind = toKind(value);
        next.kind = cleanKind;
        if (!current.text) next.text = `${value} is ready for implementation.`;
      } else if (field === 'kind') {
        const cleanKind = toKind(value);
        next.kind = cleanKind;
      }
      return next;
    });
  };

  const createWindowType = async () => {
    setCreating(true);
    setCreateStatus('');
    setError('');
    try {
      const payload = {
        name: createForm.name,
        kind: createForm.kind,
        width: Number(createForm.width) || 520,
        height: Number(createForm.height) || 360,
        button: createForm.button || 'Run',
        text: createForm.text,
      };
      const response = await fetch('/api/window-sdk/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || data?.stderr || `HTTP ${response.status}`);
      }
      setCreateStatus(data?.stdout || `Created ${payload.kind}. Reloading lab...`);
      const url = new URL(window.location.href);
      url.searchParams.set('kind', payload.kind);
      url.searchParams.set('created', String(Date.now()));
      window.location.href = url.toString();
    } catch (err) {
      setError(`${err.message}\n\nIf the API server is not running, start it with npm run dev:server or npm run dev.`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: '320px minmax(0, 1fr)',
      background: 'var(--canvas)',
      color: 'var(--ink)',
      fontFamily: 'var(--font-ui)',
    }}>
      <aside style={{
        borderRight: '1px solid var(--hairline)',
        background: 'var(--surface)',
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minHeight: 0,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Window SDK</div>
          <h1 style={{ margin: '6px 0 0', fontSize: 22, lineHeight: 1.15 }}>Window Lab</h1>
        </div>

        <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--ink-soft)' }}>
          Registered window
          <select
            value={kind}
            onChange={(event) => loadKind(event.target.value)}
            style={{
              width: '100%',
              padding: '9px 10px',
              border: '1px solid var(--hairline)',
              borderRadius: 8,
              background: 'var(--surface-2)',
              color: 'var(--ink)',
            }}
          >
            {WINDOW_MANIFESTS.map((item) => (
              <option key={item.kind} value={item.kind}>{item.label} ({item.kind})</option>
            ))}
          </select>
        </label>

        <button
          onClick={() => setCreateOpen((value) => !value)}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            minHeight: 38,
            borderRadius: 8,
            background: 'var(--surface-2)',
            border: '1px solid var(--hairline)',
            color: 'var(--ink)',
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          Add New Window Type
        </button>

        {createOpen && (
          <div style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid var(--hairline)', borderRadius: 8, background: 'color-mix(in oklab, var(--surface-2) 88%, transparent)' }}>
            <input
              value={createForm.name}
              onChange={(event) => updateCreateField('name', event.target.value)}
              placeholder="Window name, e.g. Repo Tools"
              style={{ minWidth: 0, padding: 8, border: '1px solid var(--hairline)', borderRadius: 7, background: 'var(--surface)', color: 'var(--ink)' }}
            />
            <input
              value={createForm.kind}
              onChange={(event) => updateCreateField('kind', event.target.value)}
              placeholder="kind auto-filled from name"
              style={{ minWidth: 0, padding: 8, border: '1px solid var(--hairline)', borderRadius: 7, background: 'var(--surface)', color: 'var(--ink)' }}
            />
            <input
              value={createForm.button}
              onChange={(event) => updateCreateField('button', event.target.value)}
              placeholder="Button label"
              style={{ minWidth: 0, padding: 8, border: '1px solid var(--hairline)', borderRadius: 7, background: 'var(--surface)', color: 'var(--ink)' }}
            />
            <textarea
              value={createForm.text}
              onChange={(event) => updateCreateField('text', event.target.value)}
              placeholder="Text inside the new window"
              rows={3}
              style={{ minWidth: 0, padding: 8, border: '1px solid var(--hairline)', borderRadius: 7, background: 'var(--surface)', color: 'var(--ink)', resize: 'vertical' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input
                type="number"
                value={createForm.width}
                onChange={(event) => updateCreateField('width', event.target.value)}
                aria-label="New window width"
                style={{ minWidth: 0, padding: 8, border: '1px solid var(--hairline)', borderRadius: 7, background: 'var(--surface)', color: 'var(--ink)' }}
              />
              <input
                type="number"
                value={createForm.height}
                onChange={(event) => updateCreateField('height', event.target.value)}
                aria-label="New window height"
                style={{ minWidth: 0, padding: 8, border: '1px solid var(--hairline)', borderRadius: 7, background: 'var(--surface)', color: 'var(--ink)' }}
              />
            </div>
            <button
              onClick={createWindowType}
              disabled={creating || !createForm.name}
              style={{
                all: 'unset',
                cursor: creating || !createForm.name ? 'not-allowed' : 'pointer',
                display: 'grid',
                placeItems: 'center',
                minHeight: 34,
                borderRadius: 7,
                background: creating || !createForm.name ? 'var(--surface-2)' : 'var(--accent)',
                color: creating || !createForm.name ? 'var(--ink-faint)' : 'var(--accent-contrast, white)',
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              {creating ? 'Creating...' : 'Create And Open'}
            </button>
            {createStatus && <pre style={{ margin: 0, maxHeight: 100, overflow: 'auto', whiteSpace: 'pre-wrap', color: 'var(--ink-soft)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{createStatus}</pre>}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--ink-soft)' }}>
            Width
            <input
              type="number"
              value={win.w || previewSize.w}
              onChange={(event) => updateSize({ w: Number(event.target.value), width: Number(event.target.value) })}
              style={{ minWidth: 0, padding: 8, border: '1px solid var(--hairline)', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--ink)' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--ink-soft)' }}>
            Height
            <input
              type="number"
              value={win.h || previewSize.h}
              onChange={(event) => updateSize({ h: Number(event.target.value), height: Number(event.target.value) })}
              style={{ minWidth: 0, padding: 8, border: '1px solid var(--hairline)', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--ink)' }}
            />
          </label>
        </div>

        <label style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 6, fontSize: 12, color: 'var(--ink-soft)' }}>
          Lab props JSON
          <textarea
            value={propsText}
            onChange={(event) => setPropsText(event.target.value)}
            spellCheck={false}
            style={{
              resize: 'none',
              minHeight: 180,
              padding: 10,
              border: '1px solid var(--hairline)',
              borderRadius: 8,
              background: 'var(--surface-2)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          />
        </label>

        {error && <div style={{ color: 'var(--ps-red)', fontSize: 12, lineHeight: 1.4 }}>{error}</div>}

        <button
          onClick={applyProps}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            minHeight: 38,
            borderRadius: 8,
            background: 'var(--accent)',
            color: 'var(--accent-contrast, white)',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          Apply Props
        </button>
      </aside>

      <main style={{ minWidth: 0, minHeight: 0, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
        <header style={{
          minHeight: 58,
          padding: '12px 18px',
          borderBottom: '1px solid var(--hairline)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'color-mix(in oklab, var(--surface) 86%, transparent)',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, lineHeight: 1.2 }}>{manifest?.label || kind}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>
              {manifest?.componentName || 'Unknown component'} · {manifest?.componentPath || 'unregistered'}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>
            {win.w} x {win.h}
          </div>
        </header>

        <section style={{ position: 'relative', minHeight: 0, overflow: 'auto', padding: 28 }}>
          <div style={{
            position: 'relative',
            width: Math.max(Number(win.w) + 72, 560),
            height: Math.max(Number(win.h) + 72, 420),
            background: 'var(--canvas)',
            backgroundImage: 'linear-gradient(var(--hairline) 1px, transparent 1px), linear-gradient(90deg, var(--hairline) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            border: '1px solid var(--hairline)',
            borderRadius: 8,
          }}>
            {Renderer && previewOpen ? (
              <WindowFrame
                win={win}
                onUpdate={(patch) => setWin((current) => ({ ...current, ...patch }))}
                onClose={() => setPreviewOpen(false)}
                onSelect={() => {}}
                isActive
                allWins={[]}
              >
                <React.Suspense fallback={null}>
                  <Renderer win={win} canvasObject={win} type={win.type}
                    onUpdate={(patch) => setWin((current) => ({ ...current, ...patch }))}
                    onSpawn={(spawnKind, props = {}) => loadKind(spawnKind || kind, props)}
                    onAssign={() => {}} onCreateAgent={() => {}}
                  />
                </React.Suspense>
              </WindowFrame>
            ) : Renderer ? (
              <WindowLabClosedPreview onReopen={() => setPreviewOpen(true)} />
            ) : (
              <div style={{ padding: 24, color: 'var(--ps-red)' }}>No renderer registered for {kind}</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(
  <ThemeProvider>
    <WindowLab />
  </ThemeProvider>
);
