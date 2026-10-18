import React from 'react';
import { Icon } from '../Icons.jsx';
import { api } from '../../lib/api.js';

/**
 * "Mount to": browse to a folder and pick it. It lists only folders
 * censaiOS can reach (in Docker: the folder it was started from and the
 * projects folder), so whatever is picked works for a terminal or file tree.
 */
export function FolderPicker({ startPath = '', onPick, onClose, className = '' }) {
  const [view, setView] = React.useState(null);
  const [places, setPlaces] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const wrapRef = React.useRef(null);

  const load = React.useCallback(async (path, fallBack = false) => {
    setLoading(true);
    setError('');
    try {
      let data = await api.listFolders(path);
      // No folder asked for (or the current one is out of reach): start in the first place.
      if (!data.path && data.places?.[0]) data = await api.listFolders(data.places[0].path);
      setPlaces(data.places || []);
      setView(data.path ? data : null);
    } catch (err) {
      setPlaces(err.places || []);
      if (fallBack && err.places?.[0]) return load(err.places[0].path);
      setError(err.message || 'Could not list folders');
    } finally {
      setLoading(false);
    }
    return undefined;
  }, []);

  React.useEffect(() => { load(startPath, true); }, [load, startPath]);

  React.useEffect(() => {
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) onClose?.(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const mountHere = async () => {
    if (!view?.mountPath || busy) return;
    setBusy(true);
    setError('');
    const path = view.mountPath;
    try {
      // Put the folder on the board too, so file trees and chats can open it.
      const opened = await api.openProject({ path }).catch(() => null);
      onPick?.({ name: opened?.name || view.name, path: opened?.path || path, projectId: opened?.id });
    } catch (err) {
      setError(err.message || 'Could not mount that folder');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={wrapRef} className={`hb-folder-picker ${className}`} role="dialog" aria-label="Mount to a folder"
      data-no-drag onPointerDown={(e) => e.stopPropagation()}>
      <div className="hb-folder-picker-head">
        <span className="hb-folder-picker-title">Mount to a folder</span>
        <button type="button" className="hb-folder-picker-icon" title="Close (Esc)" onClick={onClose}>
          <Icon.Close size={12} />
        </button>
      </div>
      {places.length > 0 && (
        <div className="hb-folder-picker-places" aria-label="Places">
          {places.map((p) => (
            <button key={p.path} type="button" className="hb-folder-picker-place"
              aria-pressed={Boolean(view && view.path === p.path)} title={p.mountPath}
              onClick={() => load(p.path)}>
              {p.name}
            </button>
          ))}
        </div>
      )}
      {view && (
        <div className="hb-folder-picker-here">
          <button type="button" className="hb-folder-picker-icon" title="Up one folder"
            disabled={!view.parent || loading} onClick={() => load(view.parent)}>
            <Icon.Up size={12} />
          </button>
          <span className="hb-folder-picker-current">
            <span className="hb-folder-picker-name">{view.name}</span>
            <span className="hb-folder-picker-path">{view.mountPath}</span>
          </span>
        </div>
      )}
      <div className="hb-folder-picker-list" role="listbox" aria-label="Folders">
        {loading && <span className="hb-folder-picker-note">Loading…</span>}
        {!loading && view && view.folders.length === 0 && <span className="hb-folder-picker-note">No folders inside.</span>}
        {!loading && view?.folders.map((f) => (
          <button key={f.path} type="button" role="option" aria-selected={false} className="hb-folder-picker-row"
            title={f.mountPath} onClick={() => load(f.path)}>
            <Icon.Folder size={12} />
            <span>{f.name}</span>
          </button>
        ))}
      </div>
      {error && <span className="hb-folder-picker-error">{error}</span>}
      <div className="hb-folder-picker-foot">
        <span className="hb-folder-picker-note">Only folders censaiOS can reach are shown.</span>
        <button type="button" className="hb-folder-picker-mount" disabled={!view || busy || loading} onClick={mountHere}>
          {busy ? 'Mounting…' : 'Mount here'}
        </button>
      </div>
    </div>
  );
}
