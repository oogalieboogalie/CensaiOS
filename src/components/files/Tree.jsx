import React from 'react';
import { createPortal } from 'react-dom';
import { fileWindowKind, fileWindowProps, isImageFile } from './fileRouting.js';
import { useWorkspaceStore } from '../../lib/store.js';

export function Tree({ node, depth, pan = { x: 0, y: 0 }, zoom = 1, onSpawn, githubRepo, mode, rootDirPath, wins = [], onSelect, onSetRoot }) {
  const onUpdateWindow = useWorkspaceStore(s => s.onUpdate);
  const [open, setOpen] = React.useState(node.open ?? false);
  const [children, setChildren] = React.useState(node.children || null);
  const [loading, setLoading] = React.useState(false);
  const isDir = node.isDir !== false && (!node.children || node.isDir);
  const dragState = React.useRef(null);
  const [drag, setDrag] = React.useState(null);
  const [dropTarget, setDropTarget] = React.useState(false);
  const [dropping, setDropping] = React.useState(false);

  React.useEffect(() => {
    if (open && isDir && !children && !loading && mode) {
      setLoading(true);
      if (mode === 'local') {
        fetch(`/api/files/browse?path=${encodeURIComponent(node.path === rootDirPath ? rootDirPath : node.path)}`)
          .then(res => res.json())
          .then(data => { setChildren(data.children || []); setLoading(false); })
          .catch(() => { setChildren([]); setLoading(false); });
      } else if (mode === 'github' && githubRepo) {
        fetch(`/api/github/browse?repo=${encodeURIComponent(githubRepo)}&path=${encodeURIComponent(node.path === '/' ? '' : node.path)}`)
          .then(res => res.json())
          .then(data => { setChildren(data.children || []); setLoading(false); })
          .catch(() => { setChildren([]); setLoading(false); });
      } else {
        setLoading(false);
      }
    }
  }, [open, isDir, children, loading, mode, node.path, rootDirPath, githubRepo]);

  const onClick = () => {
    if (isDir) {
      setOpen(!open);
    } else {
      const kind = fileWindowKind(node.name);
      const existingWin = (wins || []).find(
        (w) => w.filePath === node.path && w.kind === kind && (githubRepo ? w.githubRepo === githubRepo : !w.isGithub)
      );
      if (existingWin) {
        onSelect?.(existingWin.id);
        if (existingWin.kind === 'doc' && !existingWin.isEditing) {
          onUpdateWindow?.(existingWin.id, { isEditing: true });
        }
      } else {
        onSpawn?.(fileWindowKind(node.name), {
          ...fileWindowProps(node, githubRepo),
          isEditing: true
        });
      }
    }
  };

  const handleDragOver = React.useCallback((e) => {
    if (!isDir) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropTarget(true);
  }, [isDir]);

  const handleDragLeave = React.useCallback((e) => {
    if (!isDir) return;
    setDropTarget(false);
  }, [isDir]);

  const handleDrop = React.useCallback(async (e) => {
    if (!isDir || !githubRepo) return;
    e.preventDefault();
    setDropTarget(false);
    setDropping(true);

    const imageData = e.dataTransfer.getData('application/x-homebase-image');
    if (!imageData) {
      setDropping(false);
      return;
    }

    try {
      const base64Match = imageData.match(/^data:image\/\w+;base64,(.+)$/);
      if (!base64Match) {
        alert('Invalid image data');
        setDropping(false);
        return;
      }
      const base64Content = base64Match[1];
      const fileName = `image_${Date.now()}.png`;
      const fullPath = node.path === '/' ? fileName : `${node.path}/${fileName}`;

      const res = await fetch('/api/github/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: githubRepo,
          path: fullPath,
          content: base64Content,
          message: `Add ${fileName} via Censai canvas`
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to write file');
      }

      alert(`✅ Saved ${fileName} to ${node.path || '/'}`);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setDropping(false);
    }
  }, [isDir, githubRepo, node.path]);

  const onPointerDown = (e) => {
    if (isDir) return;
    e.preventDefault(); e.stopPropagation();
    dragState.current = { startX: e.clientX, startY: e.clientY, started: false };
    const move = (ev) => {
      const ds = dragState.current; if (!ds) return;
      if (!ds.started && Math.hypot(ev.clientX - ds.startX, ev.clientY - ds.startY) > 6) { ds.started = true; setDrag({ x: ev.clientX, y: ev.clientY }); }
      else if (ds.started) setDrag({ x: ev.clientX, y: ev.clientY });
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const ds = dragState.current; dragState.current = null; setDrag(null);
      if (ds && ds.started) {
        const rect = document.getElementById('canvas-root')?.getBoundingClientRect() || { left: 0, top: 0 };
        const cx = (ev.clientX - rect.left - pan.x) / zoom - 180;
        const cy = (ev.clientY - rect.top - pan.y) / zoom - 60;
        onSpawn?.(fileWindowKind(node.name), {
          ...fileWindowProps(node, githubRepo),
          isEditing: true
        }, { x: cx, y: cy });
      }
      else onClick();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  return (
    <div>
      <div onClick={isDir ? onClick : undefined} onPointerDown={isDir ? undefined : onPointerDown}
        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        title={isDir ? (githubRepo ? 'Drop image to save here · click to expand' : 'click to expand') : 'Click to open · drag to canvas'}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `2px 6px 2px ${10 + depth * 14}px`, borderRadius: 4, cursor: isDir ? (dropTarget ? 'copy' : 'pointer') : 'grab', color: isDir ? 'var(--ink)' : 'var(--ink-soft)', userSelect: 'none', background: dropTarget ? 'var(--accent-soft)' : 'transparent', transition: 'background 0.15s' }}
        onMouseEnter={(e) => !dropTarget && (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={(e) => !dropTarget && (e.currentTarget.style.background = 'transparent')}>
        {isDir ? <svg width="10" height="10" viewBox="0 0 10 10" style={{ transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}><path d="M3 2 L7 5 L3 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg> : <span style={{ width: 10 }} />}
        <span>{dropping ? '⏳' : isDir ? (open ? '📂' : '📁') : (isImageFile(node.name) ? '🖼️' : '📄')} {node.name}</span>
        {isDir && mode === 'local' && onSetRoot && node.path !== rootDirPath && (
          <button
            onClick={(e) => { e.stopPropagation(); onSetRoot(node.path); }}
            title="Work out of this folder (set as window root)"
            style={{ all: 'unset', cursor: 'pointer', marginLeft: 'auto', fontSize: 9, color: 'var(--ink-faint)', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-ink)'; e.currentTarget.style.background = 'var(--accent-soft)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-faint)'; e.currentTarget.style.background = 'transparent'; }}
          >
            set root
          </button>
        )}
      </div>
      {isDir && open && loading && <div style={{ paddingLeft: 10 + (depth+1) * 14, color: 'var(--ink-faint)', fontSize: 10, fontStyle: 'italic', padding: '4px 0 4px ' + (10 + (depth+1) * 14) + 'px' }}>Loading...</div>}
      {isDir && open && children && children.map((c, i) => <Tree key={i} node={c} depth={depth + 1} pan={pan} zoom={zoom} onSpawn={onSpawn} githubRepo={githubRepo} mode={mode} rootDirPath={rootDirPath} wins={wins} onSelect={onSelect} onSetRoot={onSetRoot} />)}
      {drag && createPortal(
        <div style={{ position: 'fixed', left: drag.x + 8, top: drag.y + 8, zIndex: 1000, pointerEvents: 'none', background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink)', boxShadow: '0 8px 20px oklch(0 0 0 / 0.18)' }}>{node.name}</div>,
        document.body
      )}
    </div>
  );
}
