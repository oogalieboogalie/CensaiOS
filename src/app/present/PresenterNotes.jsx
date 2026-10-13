import React from 'react';
import { createPortal } from 'react-dom';
import { usePresentStore } from '../../lib/presentStore.js';
import { sceneLabel } from '../../lib/presentScenes.js';
import { handlePresentKey } from './usePresentKeys.js';

// Presenter notes live in their own small window so only the presenter sees
// them: share the board's screen or tab, keep this window on your own
// monitor. The same keys work in it (arrows, Esc, N closes it). If the
// browser blocks the window, the notes show in a corner card instead,
// labelled as visible on this screen.

// The notes window borrows the app's own stylesheets and theme, so it
// matches the board (light or dark) and can use the same tokens.
function adoptAppStyles(doc) {
  for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
    doc.head.appendChild(node.cloneNode(true));
  }
  for (const { name, value } of Array.from(document.documentElement.attributes)) {
    if (name !== 'data-presenting') doc.documentElement.setAttribute(name, value);
  }
  doc.body.className = 'hb-notes-page';
}

function useElapsed(startedAt) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!startedAt) return '0:00';
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function NotesBody({ run, at, entry }) {
  const presenting = usePresentStore((s) => s.presenting);
  const startedAt = usePresentStore((s) => s.startedAt);
  const step = usePresentStore((s) => s.step);
  const stop = usePresentStore((s) => s.stop);
  const start = usePresentStore((s) => s.start);
  const elapsed = useElapsed(startedAt);
  const next = run[at + 1];
  if (!presenting || !entry) {
    return (
      <div data-testid="presenter-notes">
        <div className="hb-notes-meta"><span>Presenter notes</span><span>Not presenting</span></div>
        <p className="hb-notes-text">Press Present or an F-key on the board. This window follows along.</p>
        {run.length > 0 && <div className="hb-present-row hb-notes-actions"><button type="button" className="hb-present-btn" onClick={() => start()}>Start from scene one</button></div>}
      </div>
    );
  }
  return (
    <div data-testid="presenter-notes">
      <div className="hb-notes-meta"><span>F{entry.scene.key} · scene {at + 1} of {run.length}</span><span>{elapsed}</span></div>
      <div className="hb-present-track hb-notes-track"><div className="hb-present-fill" style={{ width: `${((at + 1) / run.length) * 100}%` }} /></div>
      <div className="hb-notes-name">{sceneLabel(entry)}</div>
      <p className="hb-notes-text">{entry.scene.notes || 'No notes for this scene.'}</p>
      <div className="hb-notes-next">{next ? `Next: ${sceneLabel(next)}` : 'Last scene. Esc returns to the board.'}</div>
      <div className="hb-present-row hb-notes-actions">
        <button type="button" className="hb-present-btn" onClick={() => step(-1)}>Previous</button>
        <button type="button" className="hb-present-btn" onClick={() => step(1)}>Next</button>
        <button type="button" className="hb-present-btn" onClick={() => stop()}>End</button>
      </div>
    </div>
  );
}

export function PresenterNotes(props) {
  const setNotesOpen = usePresentStore((s) => s.setNotesOpen);
  const [popup, setPopup] = React.useState(null);
  const [blocked, setBlocked] = React.useState(false);

  React.useEffect(() => {
    let w = null;
    try { w = window.open('', 'censai-presenter-notes', 'popup,width=520,height=640'); } catch { w = null; }
    if (!w || !w.document) { setBlocked(true); return undefined; }
    w.document.body.innerHTML = '';
    w.document.head.innerHTML = '<title>Presenter notes</title>';
    adoptAppStyles(w.document);
    const host = w.document.createElement('div');
    w.document.body.appendChild(host);
    const onKey = (e) => handlePresentKey(e);
    w.addEventListener('keydown', onKey, true);
    const watch = setInterval(() => { if (w.closed) setNotesOpen(false); }, 800);
    setPopup(host);
    return () => {
      clearInterval(watch);
      try { w.removeEventListener('keydown', onKey, true); w.close(); } catch { /* already gone */ }
    };
  }, [setNotesOpen]);

  if (popup) return createPortal(<NotesBody {...props} />, popup);
  if (!blocked) return null;
  return (
    <div className="hb-present-notes-card" role="note">
      <div className="hb-present-row">
        <span className="hb-present-hint">Notes window was blocked, so these show on this screen</span>
        <button type="button" className="hb-present-icon" title="Hide notes (N)" onClick={() => setNotesOpen(false)}>×</button>
      </div>
      <div className="hb-notes-inline"><NotesBody {...props} /></div>
    </div>
  );
}
