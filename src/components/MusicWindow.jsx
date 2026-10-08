import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { YouTubeSearch } from './YouTubeSearch.jsx';
import { SPOTIFY_DEMO_PRESETS } from './spotify/spotifyEmbed.js';
import { useMusic, MusicEmbed, titleFromUrl } from './music/index.js';
import { formatTime, seedFromString, skinFor, VISUALIZER_LABELS } from './music/musicSkins.js';
import { MusicVisualizer } from './music/MusicVisualizer.jsx';
import {
  ClickWheel, DeviceKey, DeviceScreen, DeviceShell, EjectIcon, ForwardIcon, LcdLine, Marquee,
  PauseIcon, PlayIcon, ProgressBar, RewindIcon, useElementHeight,
} from './music/MusicDevice.jsx';

// eslint-disable-next-line no-restricted-syntax -- LCD skin data: dark ink on the lit selection row
const LCD_SELECTED_INK = '#04121b';

const PRESETS = [
  { name: 'Lofi Girl', url: 'https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1', source: 'youtube' },
  { name: 'Synthwave Radio', url: 'https://www.youtube.com/embed/4xDzrJKXOOY?autoplay=1', source: 'youtube' },
  { name: 'Chillhop', url: 'https://www.youtube.com/embed/5yx6BWlEVcY?autoplay=1', source: 'youtube' },
  ...SPOTIFY_DEMO_PRESETS.map(p => ({ ...p, source: 'spotify' })),
];

const SOURCE_TAGS = { youtube: 'YT', ytmusic: 'YTM', spotify: 'SPOT', soundcloud: 'SC', generic: 'MP3' };

// Below this device height the click wheel folds into a row of keys.
const COMPACT_HEIGHT = 360;

export function MusicWindow({ win, onUpdate }) {
  const music = useMusic({ win, onUpdate });
  return (
    <>
      <WindowTitle
        icon={<Icon.Music size={14} />}
        label="Music Player"
        subtitle={win.src ? 'Now Playing' : 'Select a stream'}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--surface)' }}>
        {win.src ? <PlayerView win={win} music={music} /> : <LibraryView music={music} />}
      </div>
    </>
  );
}

function PlayerView({ win, music }) {
  const {
    paused, progress, embedVisible, setEmbedVisible, frameRef, source, kind, controllable, visMode,
    handleFrameLoad, togglePlayback, seekBy, cycleVisualizer, clearTrack,
  } = music;
  const skin = skinFor(source);
  const deviceRef = React.useRef(null);
  const height = useElementHeight(deviceRef);
  const compact = height > 0 && height < COMPACT_HEIGHT;
  const playing = !paused;
  const title = win.trackTitle || titleFromUrl(win.src);
  const seed = React.useMemo(() => seedFromString(win.src), [win.src]);
  const hint = kind === 'spotify' && paused && !embedVisible ? 'Press SCREEN for Spotify controls' : null;

  return (
    <DeviceShell ref={deviceRef} skin={skin} source={source} playing={playing}>
      <DeviceScreen skin={skin} style={{ flex: 1, minHeight: compact ? 120 : 150 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative', zIndex: 4 }}>
          <LcdLine skin={skin} size={9}>{playing ? '▶ PLAYING' : '❚❚ PAUSED'}</LcdLine>
          <LcdLine skin={skin} size={9} style={{ color: skin.lcdDim }}>· {SOURCE_TAGS[source] || 'MP3'}</LcdLine>
          <span style={{ flex: 1 }} />
          <LcdLine skin={skin} size={8} style={{ color: skin.lcdDim }}>
            {embedVisible ? 'SCREEN' : VISUALIZER_LABELS[visMode]}
          </LcdLine>
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: compact ? 36 : 70, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <MusicEmbed ref={frameRef} src={win.src} title={title} visible={embedVisible} onLoad={handleFrameLoad} />
          {!embedVisible && (
            <MusicVisualizer mode={visMode} skin={skin} playing={playing} seed={seed} onClick={cycleVisualizer} />
          )}
          {hint && (
            <LcdLine skin={skin} size={8} style={{ position: 'absolute', left: 0, right: 0, bottom: 4, textAlign: 'center', zIndex: 1, pointerEvents: 'none' }}>
              {hint}
            </LcdLine>
          )}
        </div>
        <div style={{ position: 'relative', zIndex: 4, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Marquee skin={skin} text={title} />
          <ProgressBar skin={skin} position={progress.position} duration={progress.duration} onSeek={controllable ? seekBy : null} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <LcdLine skin={skin} size={9}>{formatTime(progress.position)}</LcdLine>
            <LcdLine skin={skin} size={9} style={{ color: skin.lcdDim }}>
              {progress.duration ? `-${formatTime(progress.duration - progress.position)}` : 'LIVE'}
            </LcdLine>
          </div>
        </div>
      </DeviceScreen>

      {!compact && (
        <ClickWheel
          skin={skin}
          paused={paused}
          disabled={!controllable}
          onMenu={clearTrack}
          onBack={() => seekBy(-10)}
          onForward={() => seekBy(10)}
          onVis={cycleVisualizer}
          onToggle={togglePlayback}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
        {compact && (
          <>
            <DeviceKey skin={skin} title="Back 10s" onClick={() => seekBy(-10)} disabled={!controllable}><RewindIcon size={10} /></DeviceKey>
            <DeviceKey skin={skin} title={paused ? 'Play' : 'Pause'} onClick={togglePlayback} disabled={!controllable} active>
              {paused ? <PlayIcon size={10} /> : <PauseIcon size={10} />}
            </DeviceKey>
            <DeviceKey skin={skin} title="Forward 10s" onClick={() => seekBy(10)} disabled={!controllable}><ForwardIcon size={10} /></DeviceKey>
          </>
        )}
        <DeviceKey skin={skin} title="Show the source player on the screen" active={embedVisible} onClick={() => setEmbedVisible(v => !v)}>
          SCREEN
        </DeviceKey>
        <DeviceKey skin={skin} title="Eject" onClick={clearTrack}><EjectIcon /></DeviceKey>
      </div>
    </DeviceShell>
  );
}

function LibraryView({ music }) {
  const { inputUrl, setInputUrl, handleLoad, loadTrack } = music;
  const skin = skinFor('generic');
  const [hover, setHover] = React.useState(-1);

  return (
    <DeviceShell skin={skin} source="library" playing={false}>
      <DeviceScreen skin={skin} style={{ flexShrink: 0, padding: '8px 4px' }}>
        <LcdLine skin={skin} size={9} style={{ padding: '0 6px 4px', borderBottom: `1px solid ${skin.lcdDim}` }}>♫ Library</LcdLine>
        <div role="list" style={{ display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 4 }}>
          {PRESETS.map((p, i) => {
            const selected = hover === i;
            const tone = skinFor(p.source);
            return (
              <button
                key={p.url}
                role="listitem"
                type="button"
                onClick={() => loadTrack(p.url, p.name, p.source)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(-1)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(-1)}
                style={{
                  all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 8px', borderRadius: 'var(--radius-xs)',
                  background: selected ? skin.lcdInk : 'transparent',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-xs)', background: tone.vis[0], boxShadow: `0 0 5px ${tone.vis[0]}`, flexShrink: 0 }} />
                <LcdLine skin={skin} size={11} style={{
                  flex: 1, textTransform: 'none', letterSpacing: '0.03em',
                  color: selected ? LCD_SELECTED_INK : skin.lcdInk, textShadow: selected ? 'none' : undefined,
                }}>
                  {p.name}
                </LcdLine>
                <LcdLine skin={skin} size={8} style={{ color: selected ? LCD_SELECTED_INK : skin.lcdDim, textShadow: 'none' }}>
                  {SOURCE_TAGS[p.source]} ▸
                </LcdLine>
              </button>
            );
          })}
        </div>
      </DeviceScreen>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 'var(--radius-xl)', position: 'relative',
        background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'var(--elevation-1)',
      }}>
        <YouTubeSearch label="Search YouTube" onPick={(item) => loadTrack(item.embedUrl, item.title, 'youtube')} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-label)', textTransform: 'var(--label-case)', letterSpacing: 'var(--label-tracking)', color: 'var(--ink-faint)' }}>
            Or paste a link
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 6 }}>
            <input
              type="text"
              placeholder="YouTube, YT Music, Spotify or SoundCloud URL"
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLoad(); }}
              style={{ minWidth: 0, background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', padding: '9px 11px', font: '12px var(--font-sans)', color: 'var(--ink)', outline: 'none' }}
            />
            <button
              type="button"
              onClick={handleLoad}
              disabled={!inputUrl.trim()}
              style={{ all: 'unset', cursor: inputUrl.trim() ? 'pointer' : 'not-allowed', padding: '0 12px', borderRadius: 'var(--radius-lg)', background: 'var(--accent)', color: 'var(--on-fill)', fontSize: 'var(--text-sm)', fontWeight: 600, display: 'grid', placeItems: 'center', opacity: inputUrl.trim() ? 1 : 0.5 }}
            >
              Load
            </button>
          </div>
        </div>
      </div>
    </DeviceShell>
  );
}
