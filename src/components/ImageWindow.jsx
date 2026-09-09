import React from 'react';
import { ImageIcon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';

function imageSrcFor(win) {
  if (!win?.filePath) return null;
  if (win.isGithub && win.githubRepo) {
    const cleanPath = String(win.filePath).replace(/^\/+/, '');
    return `https://github.com/${win.githubRepo}/raw/HEAD/${cleanPath}`;
  }
  return `/api/files/image?path=${encodeURIComponent(win.filePath)}`;
}

export function ImageWindow({ win, onUpdate }) {
  const [mode, setMode] = React.useState(win.fitMode || 'fit');
  const [failed, setFailed] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const src = imageSrcFor(win);

  React.useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  const setFitMode = (next) => {
    setMode(next);
    if (win.fitMode !== next) onUpdate?.({ fitMode: next });
  };

  return (
    <>
      <WindowTitle
        accent="var(--ps-teal)"
        icon={<ImageIcon size={14} />}
        label={win.fileName || win.title || 'Image'}
        subtitle={win.isGithub ? 'github image' : 'local image'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
      />
      <div style={{ display: 'flex', gap: 6, padding: '6px 10px', alignItems: 'center', borderBottom: '1px solid var(--hairline)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={win.filePath}>
          {win.filePath || 'No file'}
        </span>
        <button
          onClick={() => setFitMode(mode === 'fit' ? 'fill' : 'fit')}
          title={mode === 'fit' ? 'Switch to fill (cover)' : 'Switch to fit (contain)'}
          style={{ all: 'unset', cursor: 'pointer', padding: '2px 8px', borderRadius: 6, background: 'var(--surface-2)', color: 'var(--ink-soft)' }}
        >
          {mode === 'fit' ? 'fit' : 'fill'}
        </button>
        {src && (
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            title="Open original in a new tab"
            style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--surface-2)', color: 'var(--ink-soft)', textDecoration: 'none' }}
          >
            open
          </a>
        )}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'grid',
          placeItems: 'center',
          padding: mode === 'fill' ? 0 : 12,
          background: 'repeating-conic-gradient(var(--surface-2) 0% 25%, transparent 0% 50%) 50% / 20px 20px, var(--surface)',
        }}
      >
        {!src && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>
            No image file attached.
          </div>
        )}
        {src && !failed && (
          <img
            src={src}
            alt={win.fileName || 'canvas image'}
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            style={
              mode === 'fill'
                ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
                : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', borderRadius: 8, boxShadow: '0 8px 24px oklch(0 0 0 / 0.18)' }
            }
          />
        )}
        {src && !failed && !loaded && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>
            Loading image…
          </div>
        )}
        {src && failed && (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--ps-red)', maxWidth: 320, textAlign: 'center' }}>
            Couldn&apos;t load this image.
            {win.isGithub
              ? ' Private GitHub repos need a token on the server — try downloading it locally first.'
              : ' The file may have moved or be unreadable.'}
          </div>
        )}
      </div>
    </>
  );
}
