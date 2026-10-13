import React from 'react';
import { YouTubeSearch } from '../YouTubeSearch.jsx';
import { SPOTIFY_DEMO_PRESETS } from '../spotify/spotifyEmbed.js';
import { skinFor, SOURCE_TAGS } from './musicSkins.js';
import { CloseIcon, NoteIcon, PlayIcon, UsbIcon } from './MusicComponents.jsx';
import { LcdLine } from './MusicDevice.jsx';

// The device's MENU screen: three lists on the LCD (stations, the board's
// shared queue, and this person's USB files) plus a panel for adding more.

export const STATIONS = [
  { title: 'Lofi Girl', url: 'https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1', source: 'youtube' },
  { title: 'Synthwave Radio', url: 'https://www.youtube.com/embed/4xDzrJKXOOY?autoplay=1', source: 'youtube' },
  { title: 'Chillhop', url: 'https://www.youtube.com/embed/5yx6BWlEVcY?autoplay=1', source: 'youtube' },
  ...SPOTIFY_DEMO_PRESETS.map(p => ({ title: p.name, url: p.url, source: 'spotify' })),
];

const TABS = [
  { id: 'stations', label: 'Stations' },
  { id: 'queue', label: 'Queue' },
  { id: 'usb', label: 'USB' },
];

export function LibraryScreen({ music, tab, setTab }) {
  const counts = { queue: music.queue.length, usb: music.usb.tracks.length };
  return (
    <div className="hb-music-library">
      {music.mode && (
        <button type="button" className="hb-music-row hb-music-now" onClick={() => music.setView('player')}>
          <PlayIcon size={8} />
          <LcdLine size="xs" className="hb-music-row-title">Now playing: {music.title}</LcdLine>
        </button>
      )}
      <div className="hb-music-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className="hb-music-tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}{counts[t.id] ? ` ${counts[t.id]}` : ''}
          </button>
        ))}
      </div>
      <div role="list" className="hb-music-list">
        {tab === 'stations' && STATIONS.map(item => (
          <TrackRow
            key={item.url}
            title={item.title}
            tag={SOURCE_TAGS[item.source]}
            source={item.source}
            onPlay={() => music.loadTrack(item.url, item.title, item.source)}
          />
        ))}
        {tab === 'queue' && (music.queue.length === 0
          ? <Empty>Search or paste a link below. Everyone on the board shares this queue.</Empty>
          : music.queue.map((item, i) => (
            <TrackRow
              key={item.url}
              title={item.title}
              tag={SOURCE_TAGS[item.source] || 'MP3'}
              source={item.source}
              current={music.mode === 'stream' && i === music.queueIndex}
              onPlay={() => music.playQueueItem(i)}
              onRemove={() => music.removeQueueItem(item.url)}
            />
          )))}
        {tab === 'usb' && (music.usb.tracks.length === 0
          ? <Empty>Load audio files from your computer, or drop them on the player.</Empty>
          : music.usb.tracks.map(track => (
            <TrackRow
              key={track.id}
              title={track.title}
              tag="USB"
              source="local"
              current={track.id === music.usbId}
              onPlay={() => music.playUsb(track.id)}
              onRemove={() => music.usb.removeTrack(track.id)}
            />
          )))}
      </div>
    </div>
  );
}

function Empty({ children }) {
  return <LcdLine size="xs" dim className="hb-music-empty">{children}</LcdLine>;
}

function TrackRow({ title, tag, source, current, onPlay, onRemove }) {
  return (
    <div role="listitem" className="hb-music-row-wrap" data-current={current ? 'true' : undefined}>
      <button type="button" className="hb-music-row" onClick={onPlay} title={`Play ${title}`}>
        <span className="hb-music-dot" style={{ background: skinFor(source).vis[0] }} aria-hidden="true" />
        <LcdLine size="sm" className="hb-music-row-title">{title}</LcdLine>
        <LcdLine size="xxs" dim>{current ? <NoteIcon size={9} /> : tag}</LcdLine>
      </button>
      {onRemove && (
        <button type="button" className="hb-music-row-remove" aria-label={`Remove ${title}`} title="Remove" onClick={onRemove}>
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

/** Below the LCD on the MENU screen: add tracks to the list on show. */
export function AddPanel({ music, tab, onPickFiles }) {
  if (tab === 'usb') {
    return (
      <div className="hb-music-panel">
        <button type="button" className="hb-music-btn" onClick={onPickFiles}>
          <UsbIcon /> Load audio files
        </button>
        <p className="hb-music-note">
          MP3, M4A, WAV, OGG or FLAC. Files stay on this computer and play only for you;
          the visualizer reads their real audio.
        </p>
      </div>
    );
  }
  const { inputUrl, setInputUrl, handleLoad, loadTrack } = music;
  return (
    <div className="hb-music-panel">
      <YouTubeSearch label="Search YouTube" onPick={(item) => loadTrack(item.embedUrl, item.title, 'youtube')} />
      <div className="hb-music-label">Or paste a link</div>
      <div className="hb-music-paste">
        <input
          type="text"
          className="hb-music-input"
          placeholder="YouTube, YT Music, Spotify or SoundCloud URL"
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleLoad(); }}
        />
        <button type="button" className="hb-music-btn" data-primary="true" onClick={handleLoad} disabled={!inputUrl.trim()}>
          Load
        </button>
      </div>
    </div>
  );
}
