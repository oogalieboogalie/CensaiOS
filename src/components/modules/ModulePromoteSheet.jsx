/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { promoteModule } from '../../lib/marketplace/moduleListingsApi.js';

function friendly(err) {
  if (err?.code && String(err.code).startsWith('PROMOTE_')) return err.message;
  if (err?.code === 'MODULE_TOO_LARGE' || err?.code === 'MODULE_SOURCE_REQUIRED') return err.message;
  if (err?.status === 403 || err?.status === 404) {
    return err.code === 'CAPABILITY_DENIED'
      ? err.message
      : 'Built-in windows can only be added where censaiOS runs from its own folder, like your PC.';
  }
  return err?.message || 'The window could not be added.';
}

/**
 * Promote to built-in window (spec 6). Writes the module into the app's own
 * windows folder with the same conventions as every other window, so it
 * shows in the Add menu for everyone using this censaiOS.
 */
export function ModulePromoteSheet({ win, onClose }) {
  const [label, setLabel] = React.useState(win.manifest?.name || win.title || 'Module');
  const [kind, setKind] = React.useState('');
  const [hint, setHint] = React.useState(win.manifest?.description || '');
  const [plan, setPlan] = React.useState(null);
  const [state, setState] = React.useState('previewing'); // previewing | ready | promoting | done
  const [error, setError] = React.useState(null);
  const [result, setResult] = React.useState(null);

  // Preview the files on open and after each edit, so mistakes show before anything is written.
  React.useEffect(() => {
    let cancelled = false;
    setState('previewing');
    const timer = setTimeout(async () => {
      try {
        const next = await promoteModule(win, { kind: kind.trim(), label, hint, dryRun: true });
        if (cancelled) return;
        setPlan(next);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setPlan(null);
        setError(friendly(err));
      }
      if (!cancelled) setState('ready');
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [win.source, win.manifest, kind, label, hint]);

  const promote = async () => {
    setState('promoting');
    setError(null);
    try {
      setResult(await promoteModule(win, { kind: plan?.kind || kind.trim(), label, hint }));
      setState('done');
    } catch (err) {
      setError(friendly(err));
      setState('ready');
    }
  };

  return (
    <div className="hb-module-sheet" role="dialog" aria-label="Promote to built-in window" data-module-sheet="promote" data-no-drag onPointerDown={e => e.stopPropagation()}>
      <div className="hb-module-sheet-head">
        <span className="hb-module-sheet-title">Promote to built-in window</span>
        <button type="button" className="hb-btn" data-variant="ghost" onClick={onClose} aria-label="Close"><Icon.Close size={13} /></button>
      </div>
      {state === 'done' && result ? (
        <div className="hb-module-sheet-body" data-module-promoted-done>
          <p className="hb-module-sheet-lead">{result.label} is now a built-in window. It shows in the Add menu next to the others once the app reloads.</p>
          <span className="hb-module-kicker">Written to this censaiOS</span>
          <ul className="hb-module-files">
            {result.files.map(f => <li key={f.path} className="hb-module-mono">{f.edit ? 'edited ' : ''}{f.path}</li>)}
          </ul>
          <p className="hb-module-sheet-note">Commit these files to keep the window in the codebase.{result.syncOk === false ? ' The window list did not refresh; run npm run window:sync.' : ''}</p>
          <div className="hb-module-row">
            <button type="button" className="hb-btn" data-primary="true" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <div className="hb-module-sheet-body">
          <p className="hb-module-sheet-note">The code moves into the app&apos;s windows folder and keeps running in the module sandbox. This canvas copy stays as it is.</p>
          <label className="hb-module-field">
            <span className="hb-module-kicker">Name in the Add menu</span>
            <input value={label} onChange={e => setLabel(e.target.value)} maxLength={48} aria-label="Window name" />
          </label>
          <label className="hb-module-field">
            <span className="hb-module-kicker">Window id</span>
            <input value={kind} onChange={e => setKind(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))} maxLength={40}
              placeholder={plan?.kind || 'from the name'} aria-label="Window id" className="hb-module-mono" />
          </label>
          <label className="hb-module-field">
            <span className="hb-module-kicker">Hint under the name</span>
            <input value={hint} onChange={e => setHint(e.target.value)} maxLength={120} aria-label="Add menu hint" />
          </label>
          {plan && (
            <div className="hb-module-field">
              <span className="hb-module-kicker">Files</span>
              <ul className="hb-module-files" data-module-plan>
                {plan.files.map(f => <li key={f.path} className="hb-module-mono">{f.edit ? 'edit ' : 'new '}{f.path}</li>)}
              </ul>
            </div>
          )}
          {error && <p className="hb-module-error" role="alert">{error}</p>}
          <div className="hb-module-row">
            <button type="button" className="hb-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="hb-btn" data-primary="true" onClick={promote} disabled={!plan || state !== 'ready'}>
              {state === 'promoting' ? 'Adding…' : 'Add to the Add menu'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
