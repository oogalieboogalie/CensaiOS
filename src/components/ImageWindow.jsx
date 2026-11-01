import React from 'react';
import { ImageIcon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';

// Image window: one picture from Files, GitHub or a chat. Depth and the
// empty state come from src/styles/depth.css; the rest is image-window.css.

function imageSrcFor(win) {
  // An image sent from a chat (spec 3) carries its own data or https URL.
  if (typeof win?.src === 'string' && /^(data:image\/|https?:\/\/|blob:)/.test(win.src)) return win.src;
  if (!win?.filePath) return null;
  if (win.isGithub && win.githubRepo) {
    const cleanPath = String(win.filePath).replace(/^\/+/, '');
    return `https://github.com/${win.githubRepo}/raw/HEAD/${cleanPath}`;
  }
  return `/api/files/image?path=${encodeURIComponent(win.filePath)}`;
}

function ImageEmpty({ title, text, tone, children }) {
  return (
    <div className="hb-empty" data-tone={tone}>
      <span className="hb-empty-icon" aria-hidden="true"><ImageIcon size={18} /></span>
      <span className="hb-empty-title">{title}</span>
      <span className="hb-empty-text">{text}</span>
      {children && <div className="hb-empty-actions">{children}</div>}
    </div>
  );
}

export function ImageWindow({ win, onUpdate, onSpawn }) {
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
        subtitle={win.src ? 'from chat' : win.isGithub ? 'github image' : 'local image'}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
      />
      <div className="hb-img-bar hb-bar">
        <span className="hb-img-path" title={win.filePath}>
          {win.filePath || (win.src ? 'Image from chat' : 'No file')}
        </span>
        <button
          type="button"
          className="hb-img-btn"
          onClick={() => setFitMode(mode === 'fit' ? 'fill' : 'fit')}
          title={mode === 'fit' ? 'Switch to fill (cover)' : 'Switch to fit (contain)'}
        >
          {mode === 'fit' ? 'fit' : 'fill'}
        </button>
        {src && (
          <a className="hb-img-btn" href={src} target="_blank" rel="noreferrer" title="Open original in a new tab">
            open
          </a>
        )}
      </div>
      <div className="hb-img-stage" data-mode={mode}>
        {!src && (
          <ImageEmpty title="No picture yet" text="Open a picture from Files, or send one here from a chat.">
            {onSpawn && <button type="button" className="hb-img-btn hb-img-btn-primary" onClick={() => onSpawn('files')}>Open Files</button>}
          </ImageEmpty>
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
                : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--panel-shadow)' }
            }
          />
        )}
        {src && !failed && !loaded && (
          <div className="hb-img-note">Loading image…</div>
        )}
        {src && failed && (
          <ImageEmpty
            tone="danger"
            title="Couldn't load this image"
            text={win.isGithub
              ? 'Private GitHub repos need a token on the server. Try downloading it locally first.'
              : 'The file may have moved or be unreadable.'}
          />
        )}
      </div>
    </>
  );
}
