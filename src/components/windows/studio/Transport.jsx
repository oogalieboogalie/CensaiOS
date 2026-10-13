/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { SNAPS } from '../../../lib/studio/project.js';
import { useTick } from './ticker.js';

// Transport bar: play, stop, record, the position readout, tempo, metronome,
// loop, snap and zoom.

export function formatPosition(beat, beatsPerBar) {
  const b = Math.max(0, beat);
  const bar = Math.floor(b / beatsPerBar) + 1;
  const inBar = Math.floor(b % beatsPerBar) + 1;
  const tick = Math.floor((b % 1) * 100);
  return `${String(bar).padStart(3, '0')}.${inBar}.${String(tick).padStart(2, '0')}`;
}

function Position({ ticker, beatsPerBar }) {
  const beat = useTick(ticker, s => s.beat);
  return <span className="hb-studio-pos" data-testid="studio-position">{formatPosition(beat, beatsPerBar)}</span>;
}

function Tempo({ bpm, onChange }) {
  const [draft, setDraft] = React.useState(null);
  const commit = () => { if (draft !== null) { const v = Number(draft); if (Number.isFinite(v)) onChange(v); setDraft(null); } };
  return (
    <label className="hb-studio-field" title="Tempo in beats per minute">
      <input className="hb-studio-num" inputMode="decimal" value={draft ?? String(bpm)} aria-label="Tempo"
        onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'ArrowUp') onChange(bpm + 1); if (e.key === 'ArrowDown') onChange(bpm - 1); }} />
      <span>BPM</span>
    </label>
  );
}

export function Transport({ project, ticker, playing, recording, onPlay, onStop, onRecord, edit, setZoom, canRecord }) {
  return (
    <div className="hb-studio-transport" data-no-drag>
      <div className="hb-studio-group">
        <button type="button" className="hb-studio-tbtn" data-on={playing ? 'true' : undefined} onClick={playing ? onStop : onPlay}
          aria-label={playing ? 'Pause' : 'Play'} title="Play or stop (Space)" data-testid="studio-play">
          {playing ? <Icon.Stop size={14} /> : <Icon.Play size={14} />}
        </button>
        <button type="button" className="hb-studio-tbtn" onClick={onStop} aria-label="Back to start" title="Stop and go back to the start (Enter)">
          <span className="hb-studio-home" aria-hidden="true" />
        </button>
        <button type="button" className="hb-studio-tbtn" data-rec="true" data-on={recording ? 'true' : undefined} onClick={onRecord} disabled={!canRecord && !recording}
          aria-label={recording ? 'Stop recording' : 'Record'} title={canRecord ? 'Record from the microphone onto the armed track (R)' : 'Arm an audio track to record'}>
          <span className="hb-studio-recdot" aria-hidden="true" />
        </button>
      </div>
      <Position ticker={ticker} beatsPerBar={project.beatsPerBar} />
      <div className="hb-studio-group">
        <Tempo bpm={project.bpm} onChange={bpm => edit('set', { bpm })} />
        <span className="hb-studio-sig" title="Beats per bar">{project.beatsPerBar}/4</span>
      </div>
      <div className="hb-studio-group">
        <button type="button" className="hb-studio-chip" aria-pressed={project.metronome} onClick={() => edit('set', { metronome: !project.metronome })} title="Metronome (K)">Click</button>
        <button type="button" className="hb-studio-chip" aria-pressed={project.loop.on} onClick={() => edit('set', { loop: { ...project.loop, on: !project.loop.on } })} title="Loop the marked bars (L)">Loop</button>
        <label className="hb-studio-field" title="Snap clips and notes to the grid">
          <span>Snap</span>
          <select className="hb-studio-select" value={project.snap} onChange={e => edit('set', { snap: e.target.value })} aria-label="Snap">
            {SNAPS.map(s => <option key={s} value={s}>{s === 'off' ? 'Off' : s}</option>)}
          </select>
        </label>
      </div>
      <div className="hb-studio-group hb-studio-push">
        <button type="button" className="hb-studio-tbtn" onClick={() => setZoom(z => Math.max(8, z / 1.25))} aria-label="Zoom out" title="Zoom out">-</button>
        <button type="button" className="hb-studio-tbtn" onClick={() => setZoom(z => Math.min(160, z * 1.25))} aria-label="Zoom in" title="Zoom in">+</button>
      </div>
    </div>
  );
}
