import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { YouTubeSearch } from './YouTubeSearch.jsx';

const PRESETS = [
  { name: 'Twitch: KaiCenat', url: 'https://player.twitch.tv/?channel=kaicenat&parent=localhost' },
  { name: 'Twitch: xQc', url: 'https://player.twitch.tv/?channel=xqc&parent=localhost' },
  { name: 'YouTube: Lofi Girl', url: 'https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1' }
];

function parseStreamUrl(url) {
  if (!url) return '';
  // Twitch Channel
  if (url.includes('twitch.tv/')) {
    const channel = url.split('twitch.tv/')[1]?.split('?')[0];
    if (channel) return `https://player.twitch.tv/?channel=${channel}&parent=localhost`;
  }
  // YouTube
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    if (url.includes('/embed/')) return url;
    let videoId = '';
    if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1]?.split('?')[0];
    else if (url.includes('v=')) videoId = url.split('v=')[1]?.split('&')[0];
    if (videoId) return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
  }
  return url;
}

export function StreamWindow({ win, onUpdate }) {
  const [inputUrl, setInputUrl] = React.useState('');
  
  const handleLoad = () => {
    if (inputUrl.trim()) {
      onUpdate({ src: parseStreamUrl(inputUrl.trim()) });
      setInputUrl('');
    }
  };

  return (
    <>
      <WindowTitle 
        icon={<Icon.Video size={14} />} 
        label="Stream Viewer" 
        subtitle={win.src ? 'Watching' : 'Select a stream'} 
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--surface)' }}>
        
        {!win.src ? (
          <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-faint)' }}>Presets</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {PRESETS.map((p, i) => (
                  <button 
                    key={i} 
                    onClick={() => onUpdate({ src: p.url })}
                    style={{ all: 'unset', cursor: 'pointer', padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 8, fontSize: 13, color: 'var(--ink)', transition: 'background 0.15s, transform 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'oklch(var(--accent-l) calc(var(--accent-c) * 0.1) var(--accent-h) / 0.15)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-2)'}
                    onPointerDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                    onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon.Video size={14} style={{ color: 'var(--accent-ink)' }} />
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-faint)' }}>OR SEARCH</div>
              <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
            </div>

            <YouTubeSearch label="YouTube" onPick={(item) => onUpdate({ src: item.embedUrl })} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-faint)' }}>OR PASTE URL</div>
              <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input 
                type="text" 
                placeholder="Twitch or YouTube URL..." 
                value={inputUrl}
                onChange={e => setInputUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleLoad(); }}
                style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '10px 12px', font: '13px var(--font-sans)', color: 'var(--ink)', outline: 'none' }}
              />
              <button 
                onClick={handleLoad}
                disabled={!inputUrl.trim()}
                style={{ all: 'unset', cursor: inputUrl.trim() ? 'pointer' : 'not-allowed', padding: '10px', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 600, textAlign: 'center', opacity: inputUrl.trim() ? 1 : 0.5 }}
              >
                Load Stream
              </button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-2)' }}>
              <button 
                onClick={() => onUpdate({ src: '' })}
                style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-soft)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--ink)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--ink-soft)'}
              >
                <Icon.Close size={12} /> Close Stream
              </button>
            </div>
            <iframe 
              src={win.src} 
              style={{ flex: 1, width: '100%', height: '100%', border: 'none' }} 
              allow="autoplay; fullscreen"
              loading="lazy"
            />
          </div>
        )}
      </div>
    </>
  );
}
