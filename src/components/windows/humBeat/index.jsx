/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { windowMeta } from './meta.js';
import { useHum } from './useHum.js';
import { useTick } from '../studio/ticker.js';
import { NotesView } from './NotesView.jsx';
import { BEATS, INSTRUMENTS } from '../../../lib/hum/beat.js';
import { claimKeyboard } from '../../../lib/keyboardClaim.js';

export { windowMeta };

const GRIDS = [[0, 'As hummed'], [0.25, '1/16'], [0.5, '1/8'], [1, '1/4']];

/**
 * Hum a beat: hum or open a recording, and the window writes down the real
 * notes (Spotify's Basic Pitch, running in this browser), then plays them on
 * an instrument over a drum beat and a bassline. Not a filter on your voice:
 * the notes are the result, so they export as MIDI or open in Studio.
 */
export function HumBeatWindow({ win = {}, onUpdate }) {
  const hum = useHum({ win, onUpdate });
  const { settings, set, actions, phase, song } = hum;
  const playing = useTick(hum.audio.ticker, s => s.playing);
  const hasNotes = hum.melody.length > 0;
  const busy = phase !== 'idle';
  const [tempo, setTempo] = React.useState(null);
  const commitTempo = () => { if (tempo !== null && Number(tempo) > 0) set({ bpm: Number(tempo) }); setTempo(null); };

  const release = React.useRef(null);
  React.useEffect(() => () => release.current?.(), []);
  const onKeyDown = (e) => {
    if (e.key !== ' ' || e.target.closest?.('input, select, textarea, button')) return;
    e.preventDefault(); e.stopPropagation();
    if (playing) actions.stop(); else if (hasNotes) actions.play();
  };

  // Saving and handing off only make sense once there are notes.
  const header = hasNotes ? [
    { id: 'studio', label: 'Open in Studio', icon: <Icon.Music size={14} />, onSelect: actions.openInStudio },
    { id: 'midi', label: 'Save MIDI', icon: <Icon.Download size={14} />, onSelect: actions.exportMidi },
  ] : [];
  const menu = [
    hasNotes && { id: 'wav', label: hum.exporting ? `Rendering ${Math.round(hum.exporting * 100)}%` : 'Save as WAV', onSelect: actions.exportMix },
    { id: 'file', label: 'Open a sound file', onSelect: actions.openFile },
    { id: 'example', label: 'Try the example hum', onSelect: actions.tryExample },
    hasNotes && { id: 'clear', label: 'Clear the notes', onSelect: actions.clear },
  ];

  return (
    <>
      <WindowTitle icon={<Icon.Mic size={14} />} label={win.title || windowMeta.label}
        subtitle={hasNotes ? `${hum.melody.length} notes · ${settings.bpm} BPM` : 'Hum it, hear it as a beat'} actions={header} menu={menu} />
      <div className="hb-hum" tabIndex={-1} data-testid="hum-beat" onKeyDown={onKeyDown}
        onFocus={() => { release.current = release.current || claimKeyboard('humBeat'); }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { release.current?.(); release.current = null; } }}>
        <div className="hb-hum-top" data-no-drag>
          <button type="button" className="hb-hum-rec" data-on={phase === 'recording' ? 'true' : undefined} disabled={phase === 'listening'}
            onClick={phase === 'recording' ? actions.stopRecording : actions.startRecording} data-testid="hum-record"
            aria-label={phase === 'recording' ? 'Stop and find the notes' : 'Record a hum'}>
            <span className="hb-hum-recdot" />
          </button>
          <div className="hb-hum-say">
            <strong>{phase === 'recording' ? `Listening… ${hum.elapsed.toFixed(0)}s` : phase === 'listening' ? `Finding your notes ${Math.round(hum.progress * 100)}%` : hasNotes ? 'Your melody' : 'Hum a melody'}</strong>
            <span>{phase === 'recording' ? 'Press again when you are done.' : phase === 'listening' ? 'Working on this computer. Nothing is uploaded.' : 'One clear note at a time works best. "Da da da" or whistling is fine.'}</span>
          </div>
          <div className="hb-hum-push">
            {!busy && <button type="button" className="hb-studio-chip" onClick={actions.openFile} data-testid="hum-open">Open a sound file</button>}
            {hum.take && !busy && <audio className="hb-hum-take" src={hum.take} controls aria-label="Your recording" />}
          </div>
        </div>
        {hum.notice && <div className="hb-studio-notice" role="status" data-testid="hum-notice">{hum.notice}</div>}
        {hasNotes ? <NotesView song={song} ticker={hum.audio.ticker} /> : (
          <div className="hb-hum-empty">
            <p>Press the red button and hum. The window writes down each note you hummed, then plays it on a real instrument with drums and a bassline.</p>
            <button type="button" className="hb-studio-chip" onClick={actions.tryExample} data-testid="hum-example">Try the example hum</button>
          </div>
        )}
        <div className="hb-hum-controls" data-no-drag>
          <button type="button" className="hb-studio-tbtn hb-hum-play" disabled={!hasNotes} data-on={playing ? 'true' : undefined}
            onClick={playing ? actions.stop : actions.play} aria-label={playing ? 'Stop' : 'Play'} data-testid="hum-play">
            {playing ? <span className="hb-hum-stopsq" /> : <span className="hb-hum-tri" />}
          </button>
          <div className="hb-hum-field">
            <span>Beat</span>
            <div className="hb-hum-chips" role="group" aria-label="Beat">
              {Object.entries(BEATS).map(([id, b]) => (
                <button key={id} type="button" className="hb-studio-chip" aria-pressed={settings.style === id}
                  onClick={() => set({ style: id, bpm: b.bpm })} data-testid={`hum-beat-${id}`}>{b.label}</button>
              ))}
            </div>
          </div>
          <label className="hb-hum-field">
            <span>Instrument</span>
            <select className="hb-studio-select" value={settings.instrument} onChange={e => set({ instrument: e.target.value })} data-testid="hum-instrument">
              {Object.entries(INSTRUMENTS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="hb-hum-field">
            <span>Tempo</span>
            <input className="hb-studio-num" inputMode="numeric" value={tempo ?? String(settings.bpm)} aria-label="Tempo"
              onChange={e => setTempo(e.target.value)} onBlur={commitTempo}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); }} />
          </label>
          <label className="hb-hum-field">
            <span>Line up notes</span>
            <select className="hb-studio-select" value={settings.grid} onChange={e => set({ grid: Number(e.target.value) })}>
              {GRIDS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </label>
          <div className="hb-hum-field">
            <span>Octave</span>
            <div className="hb-hum-chips">
              <button type="button" className="hb-studio-chip" onClick={() => set({ octave: settings.octave - 1 })} disabled={settings.octave <= -2} aria-label="Octave down">−</button>
              <span className="hb-hum-oct">{settings.octave > 0 ? `+${settings.octave}` : settings.octave}</span>
              <button type="button" className="hb-studio-chip" onClick={() => set({ octave: settings.octave + 1 })} disabled={settings.octave >= 2} aria-label="Octave up">+</button>
            </div>
          </div>
          <button type="button" className="hb-studio-chip" aria-pressed={settings.bass} onClick={() => set({ bass: !settings.bass })} data-testid="hum-bass">Bassline</button>
        </div>
      </div>
    </>
  );
}
