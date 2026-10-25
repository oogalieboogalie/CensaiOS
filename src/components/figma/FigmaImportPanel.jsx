import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { logToApp } from '../../lib/appLog/browserLog.js';
import { designBlockFromImport, figmaApi, layoutImportedFrames, resyncPatch } from './figmaApi.js';
import { inputStyle, linkButton, primaryButton } from './figmaStyles.js';
import { FigmaPlaceOptions, FigmaPageTabs } from './FigmaPlaceOptions.jsx';
import { FigmaFrameList } from './FigmaFrameList.jsx';
import { selectionForLink } from './figmaLink.js';

export function FigmaImportPanel({ win, onUpdate, connection }) {
  const spawnAt = useWorkspaceStore(state => state.spawnAt);
  const updateWindow = useWorkspaceStore(state => state.onUpdate);
  const allWins = useWorkspaceStore(state => state.wins);
  const [url, setUrl] = React.useState(win.figmaFileUrl || '');
  const [file, setFile] = React.useState(null);
  const [selected, setSelected] = React.useState([]);
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');
  const [page, setPage] = React.useState('');
  const placeAs = win.figmaPlaceAs === 'image' ? 'image' : 'code';
  const autoLoaded = React.useRef(false);

  const loadFrames = React.useCallback(async (link) => {
    setBusy('Reading the file…');
    setError('');
    try {
      const data = await figmaApi.frames(link);
      const frames = Array.isArray(data.frames) ? data.frames : [];
      setFile({ ...data, frames });
      const picked = selectionForLink(frames, link);
      const ids = data.linkFrameId ? [data.linkFrameId] : picked.ids;
      const reason = data.linkError || picked.error;
      const frame = frames.find((item) => item.id === ids[0]);
      setPage(frame?.page || picked.page || '');
      setSelected(ids);
      if (reason) {
        setError(reason);
        logToApp('warn', 'figma-import: a share link did not match a frame', { where: 'figma' });
      } else if (ids.length) {
        logToApp('info', 'figma-import: selected a frame from a share link', { where: 'figma' });
      }
      onUpdate?.({ figmaFileUrl: link, figmaTitle: data.name });
    } catch (err) {
      setError(err.message);
      logToApp('warn', 'figma-import: the file could not be read', { where: 'figma' });
    } finally {
      setBusy('');
    }
  }, [onUpdate]);

  // A Figma link pasted on the canvas lands here pre-filled: load it once.
  React.useEffect(() => {
    if (autoLoaded.current || !win.figmaFileUrl || file) return;
    autoLoaded.current = true;
    loadFrames(win.figmaFileUrl);
  }, [win.figmaFileUrl, file, loadFrames]);

  const place = async () => {
    const frames = file.frames.filter(f => selected.includes(f.id));
    const slots = layoutImportedFrames(win, frames);
    setError('');
    logToApp('info', `figma-import: placing ${frames.length} frame(s) on the board`, { where: 'figma' });
    for (let i = 0; i < frames.length; i += 1) {
      setBusy(`Bringing in ${frames[i].name} (${i + 1} of ${frames.length})…`);
      try {
        const result = await figmaApi.importFrame(url, frames[i].id);
        spawnAt('designBlock', designBlockFromImport(result, url, { placeAs }), slots[i].pos, slots[i].size);
      } catch (err) {
        setError(`${frames[i].name}: ${err.message}`);
        logToApp('warn', 'figma-import: a frame could not be placed', { where: 'figma' });
        break;
      }
    }
    setBusy('');
  };

  const pages = file ? [...new Set(file.frames.map(f => f.page).filter(Boolean))] : [];
  const visible = file ? file.frames.filter(f => !page || f.page === page) : [];

  // Frames from this file already on the canvas, for "Sync all".
  const placed = file ? allWins.filter(w => w.kind === 'designBlock' && w.figma?.fileKey === file.fileKey && w.figma?.nodeId) : [];

  const syncPlaced = async () => {
    setError('');
    for (let i = 0; i < placed.length; i += 1) {
      const block = placed[i];
      setBusy(`Syncing ${block.title || 'frame'} (${i + 1} of ${placed.length})…`);
      try {
        const result = await figmaApi.refreshFrame(block.figma.url || url, block.figma.nodeId);
        updateWindow(block.id, resyncPatch(block, result));
      } catch (err) {
        setError(`${block.title || 'Frame'}: ${err.message}`);
        break;
      }
    }
    setBusy('');
  };

  const toggle = (id) => setSelected(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 18px', minHeight: 0, flex: 1 }}>
      <form onSubmit={(e) => { e.preventDefault(); if (url.trim()) loadFrames(url.trim()); }} style={{ display: 'flex', gap: 8 }}>
        <input
          aria-label="Figma file link"
          placeholder="https://www.figma.com/design/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={inputStyle}
        />
        <button type="submit" disabled={!url.trim() || Boolean(busy)} style={{ ...primaryButton(Boolean(url.trim()) && !busy), whiteSpace: 'nowrap' }}>
          Show frames
        </button>
      </form>

      {busy && <div role="status" style={{ font: '12px var(--font-sans)', color: 'var(--ink-soft)' }}>{busy}</div>}
      {error && <div role="alert" style={{ font: '12px var(--font-sans)', color: 'var(--ps-red)' }}>{error}</div>}

      {file && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ font: '600 13px var(--font-sans)', color: 'var(--ink)' }}>{file.name}</div>
            <div style={{ font: '12px var(--font-sans)', color: 'var(--ink-faint)' }}>
              {pages.length} {pages.length === 1 ? 'page' : 'pages'} · {file.frames.length} frames
            </div>
          </div>
          {pages.length > 1 && <FigmaPageTabs pages={pages} value={page} onChange={setPage} />}
          <FigmaFrameList frames={visible} selected={selected} onToggle={toggle} />
          <FigmaPlaceOptions value={placeAs} onChange={(next) => onUpdate?.({ figmaPlaceAs: next })} />
          <button type="button" disabled={!selected.length || Boolean(busy)} onClick={place} style={primaryButton(selected.length > 0 && !busy)}>
            {selected.length ? `Place ${selected.length} on canvas` : 'Pick frames to place on the canvas'}
          </button>
          {placed.length > 0 && (
            <button type="button" disabled={Boolean(busy)} onClick={syncPlaced} style={{ ...linkButton, alignSelf: 'center' }} title="Pull every frame from this file that is on the canvas again">
              Sync {placed.length} on the canvas from Figma
            </button>
          )}
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', font: '11px var(--font-sans)', color: 'var(--ink-faint)' }}>
        <span>Connected{connection.user ? ` as ${connection.user}` : ''}{connection.source === 'server' ? ' (server token)' : ''}</span>
        {connection.source === 'byok' && <button type="button" onClick={connection.disconnect} style={linkButton}>Disconnect</button>}
      </div>
    </div>
  );
}
