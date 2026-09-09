import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { FIGMA_PRESETS, parseFigmaEmbedUrl, figmaTitleFromUrl } from './figma/figmaEmbed.js';

// Cache to hold iframes keyed by window.id to prevent reloading on React remounts
const iframeCache = new Map();

function getParkingLot() {
  if (typeof document === 'undefined') return null;
  let parkingLot = document.getElementById('figma-parking-lot');
  if (parkingLot) return parkingLot;
  parkingLot = document.createElement('div');
  parkingLot.id = 'figma-parking-lot';
  parkingLot.style.display = 'none';
  document.body.appendChild(parkingLot);
  return parkingLot;
}

export function FigmaWindow({ win, onUpdate }) {
  const [inputUrl, setInputUrl] = React.useState('');
  const [error, setError] = React.useState(false);
  const containerRef = React.useRef(null);

  const currentUrl = win.url || '';

  React.useLayoutEffect(() => {
    if (!currentUrl) return;

    if (!iframeCache.has(win.id)) {
      const iframe = document.createElement('iframe');
      iframe.src = currentUrl;
      iframe.width = '100%';
      iframe.height = '100%';
      iframe.frameBorder = '0';
      iframe.allowFullscreen = true;
      iframe.style.borderRadius = '12px';
      iframe.style.border = 'none';
      iframeCache.set(win.id, iframe);
    }

    const iframe = iframeCache.get(win.id);
    if (iframe && iframe.getAttribute('src') !== currentUrl) {
      iframe.src = currentUrl;
    }
    iframe.title = win.figmaTitle || figmaTitleFromUrl(currentUrl);
    const container = containerRef.current;
    if (container && iframe) {
      if (iframe.parentNode !== container) {
        container.appendChild(iframe);
      }
    }

    return () => {
      const activeIframe = iframeCache.get(win.id);
      const parkingLot = getParkingLot();
      if (activeIframe && parkingLot) {
        // Park it in the hidden container so it stays alive and doesn't reload!
        parkingLot.appendChild(activeIframe);
      }
    };
  }, [currentUrl, win.id, win.figmaTitle]);

  const loadFile = (url, title) => {
    const embedUrl = parseFigmaEmbedUrl(url);
    if (embedUrl) {
      setError(false);
      onUpdate({ url: embedUrl, figmaTitle: title || figmaTitleFromUrl(embedUrl) });
      setInputUrl('');
    } else {
      setError(true);
    }
  };

  const handleLoad = () => loadFile(inputUrl);

  const clearFile = () => {
    if (iframeCache.has(win.id)) {
      const iframe = iframeCache.get(win.id);
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      iframeCache.delete(win.id);
    }
    onUpdate({ url: '', figmaTitle: '' });
  };

  return (
    <>
      <WindowTitle
        icon={<Icon.Edit size={14} />}
        label="Figma"
        subtitle={currentUrl ? (win.figmaTitle || 'Design File') : 'Select File'}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--surface)' }}>
        {!currentUrl ? (
          <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--ink)' }}>
              Paste a Figma design file or prototype URL to embed. Make sure the file is link-shared (public or "anyone with the link").
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {FIGMA_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => loadFile(preset.url, preset.name)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '10px 14px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--hairline)',
                    borderRadius: 8,
                    fontSize: 13,
                    color: 'var(--ink)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'var(--surface-3)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon.Edit size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontWeight: 500 }}>{preset.name}</span>
                  </div>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="text"
                placeholder="https://www.figma.com/design/..."
                value={inputUrl}
                onChange={e => { setInputUrl(e.target.value); setError(false); }}
                onKeyDown={e => { if (e.key === 'Enter') handleLoad(); }}
                style={{
                  width: '100%',
                  background: 'var(--surface-2)',
                  border: error ? '1px solid var(--ps-red)' : '1px solid var(--hairline)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  font: '13px var(--font-sans)',
                  color: 'var(--ink)',
                  outline: 'none'
                }}
              />
              {error && (
                <div style={{ fontSize: 11, color: 'var(--ps-red)' }}>Invalid Figma URL</div>
              )}
              <button
                onClick={handleLoad}
                disabled={!inputUrl.trim()}
                style={{
                  all: 'unset',
                  cursor: inputUrl.trim() ? 'pointer' : 'not-allowed',
                  padding: '10px',
                  borderRadius: 8,
                  background: 'var(--accent)',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'center',
                  opacity: inputUrl.trim() ? 1 : 0.5
                }}
              >
                Embed File
              </button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, padding: 8 }} ref={containerRef} />
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '8px 12px',
              borderTop: '1px solid var(--hairline)',
              background: 'var(--surface-2)'
            }}>
              <button onClick={clearFile} style={{
                all: 'unset',
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--ink-soft)'
              }}>
                Change File
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
