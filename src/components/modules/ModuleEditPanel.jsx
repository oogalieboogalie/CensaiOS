/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { MODULE_PERMISSION_LABELS } from '../../lib/modules/moduleFormat.js';

function when(at) {
  const t = Date.parse(at || '');
  if (!t) return '';
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Iterate in place (spec 6): ask for a change in plain language, see every
 * version, step back with Undo, and keep the module.
 */
export function ModuleEditPanel({ win, build, grants, onRestore, onSave, onExport, saveState }) {
  const [draft, setDraft] = React.useState('');
  const versions = Array.isArray(win.versions) ? win.versions : [];
  const current = Number.isInteger(win.versionIndex) ? win.versionIndex : versions.length - 1;
  const busy = Boolean(build.editing);

  const submit = async (e) => {
    e?.preventDefault?.();
    const text = draft.trim();
    if (!text || busy) return;
    const ok = await build.edit(text);
    if (ok) setDraft('');
  };

  return (
    <aside className="hb-module-panel" data-module-panel data-no-drag onPointerDown={e => e.stopPropagation()}>
      <form className="hb-module-panel-section" onSubmit={submit}>
        <span className="hb-module-kicker">Ask for a change</span>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) submit(e); }}
          placeholder="Make the buttons bigger, add a notes field…"
          aria-label="Change request"
          disabled={busy}
        />
        {busy && <span className="hb-module-elapsed">Applying “{build.editing.instruction}”…</span>}
        {build.editError && <p className="hb-module-error">{build.editError}</p>}
        <div className="hb-module-row">
          {busy
            ? <button type="button" className="hb-btn" onClick={build.cancel}>Stop</button>
            : <button type="submit" className="hb-btn" data-primary="true" disabled={!draft.trim()}>Apply change</button>}
          <button type="button" className="hb-btn" disabled={busy || current <= 0} onClick={() => onRestore(current - 1)}>Undo</button>
          <button type="button" className="hb-btn" disabled={busy || current >= versions.length - 1} onClick={() => onRestore(current + 1)}>Redo</button>
        </div>
      </form>
      <div className="hb-module-panel-section">
        <span className="hb-module-kicker">Keep it</span>
        <div className="hb-module-row">
          <button type="button" className="hb-btn" onClick={onSave} disabled={saveState === 'saving'}>
            {saveState === 'saved' ? 'Saved to My modules' : win.libraryId ? 'Update in My modules' : 'Save to My modules'}
          </button>
          <button type="button" className="hb-btn" onClick={onExport}>Export file</button>
        </div>
        {saveState && saveState !== 'saving' && saveState !== 'saved' && <p className="hb-module-error">{saveState}</p>}
        {win.manifest?.permissions?.length > 0 && (
          <div className="hb-module-perms" aria-label="Permissions">
            {win.manifest.permissions.map(p => (
              <span key={p} className="hb-module-chip" title={MODULE_PERMISSION_LABELS[p]}>
                {p === 'agent' ? 'Agents' : 'Internet'}: {grants[p] === true ? 'allowed' : grants[p] === false ? 'blocked' : 'asks first'}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="hb-module-panel-section">
        <span className="hb-module-kicker">Versions</span>
        <ol className="hb-module-versions">
          {versions.map((v, i) => ({ v, i })).reverse().map(({ v, i }) => (
            <li key={`${i}-${v.at}`} className="hb-module-version" aria-current={i === current ? 'true' : undefined}
              onClick={() => !busy && onRestore(i)} title={v.note || ''}>
              <span className="hb-module-version-n">{i + 1}</span>
              <span className="hb-module-version-note">{v.note || 'Version'}</span>
              <span className="hb-module-elapsed">{when(v.at)}</span>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
