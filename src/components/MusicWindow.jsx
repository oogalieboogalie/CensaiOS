import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { YouTubeSearch } from './YouTubeSearch.jsx';
import { 
  useMusic, MusicEmbed, MiniBtn, PauseIcon, PlayIcon, 
  parseMusicUrl, isYouTubeEmbed, titleFromUrl 
} from './music/index.js';

const PRESETS = [
  { name: 'Lofi Girl', url: 'https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1' },
  { name: 'Synthwave Radio', url: 'https://www.youtube.com/embed/4xDzrJKXOOY?autoplay=1' },
  { name: 'Chillhop', url: 'https://www.youtube.com/embed/5yx6BWlEVcY?autoplay=1' }
];

export function MusicWindow({ win, onUpdate }) {
  const {
    inputUrl, setInputUrl,
    hovered, setHovered,
    paused,
    frameRef,
    loadTrack,
    handleLoad,
    togglePlayback,
    clearTrack,
  } = useMusic({ win, onUpdate });

  return (
    <>
      <WindowTitle 
        icon={<Icon.Music size={14} />} 
        label="Music Player" 
        subtitle={win.src ? 'Now Playing' : 'Select a stream'} 
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
                    onClick={() => loadTrack(p.url, p.name)}
                    style={{ all: 'unset', cursor: 'pointer', padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 8, fontSize: 13, color: 'var(--ink)', transition: 'background 0.15s, transform 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'oklch(var(--accent-l) calc(var(--accent-c) * 0.1) var(--accent-h) / 0.15)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-2)'}
                    onPointerDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                    onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon.Music size={14} style={{ color: 'var(--accent-ink)' }} />
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

            <YouTubeSearch label="YouTube" onPick={(item) => loadTrack(item.embedUrl, item.title)} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-faint)' }}>OR PASTE URL</div>
              <div style={{ flex: 1, height: 1, background: 'var(--hairline)' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input 
                type="text" 
                placeholder="Spotify, SoundCloud, or YouTube URL..." 
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
          <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', padding: '5px 8px 7px', background: 'var(--surface)' }}
          >
            <MusicEmbed ref={frameRef} src={win.src} title={win.trackTitle || 'Music stream'} />
            <div style={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0, 1fr) auto',
              alignItems: 'center',
              gap: 10,
              padding: '5px 8px',
              borderRadius: 8,
              background: 'var(--surface-2)',
              border: '1px solid var(--hairline)',
              minHeight: 42,
            }}>
              <button
                onClick={togglePlayback}
                disabled={!isYouTubeEmbed(win.src)}
                title={isYouTubeEmbed(win.src) ? (paused ? 'Play' : 'Pause') : 'Use embedded player controls for this source'}
                style={{
                  all: 'unset',
                  cursor: isYouTubeEmbed(win.src) ? 'pointer' : 'not-allowed',
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: 'var(--accent)',
                  color: 'white',
                  display: 'grid',
                  placeItems: 'center',
                  opacity: isYouTubeEmbed(win.src) ? 1 : 0.45,
                }}
              >
                {paused ? <PlayIcon /> : <PauseIcon />}
              </button>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.1 }}>
                  {win.trackTitle || titleFromUrl(win.src)}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.1 }}>
                  {paused ? 'paused' : 'playing'}
                </div>
              </div>
              <div style={{
                display: 'flex',
                gap: 6,
                opacity: hovered ? 1 : 0,
                transform: hovered ? 'translateX(0)' : 'translateX(6px)',
                transition: 'opacity 0.15s, transform 0.15s',
                pointerEvents: hovered ? 'auto' : 'none',
              }}>
                <MiniBtn title="Open picker" onClick={() => onUpdate({ src: '', trackTitle: '', musicCompact: false, musicPaused: false, h: 380 })}>
                  <Icon.Search size={12} />
                </MiniBtn>
                <MiniBtn title="Clear" onClick={clearTrack}>
                  <Icon.Close size={12} />
                </MiniBtn>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
