/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { noteName } from '../../../lib/hum/melody.js';
import { useTick } from '../studio/ticker.js';

// The hummed melody drawn as a piano roll, stretched to fit the window:
// one row per pitch, bars marked, each note labelled with its name. The
// drum hits sit in a thin lane underneath so the groove is visible too.

function Playhead({ ticker, len }) {
  const beat = useTick(ticker, s => s.beat);
  const playing = useTick(ticker, s => s.playing);
  if (!playing) return null;
  return <div className="hb-hum-playhead" style={{ left: `${((beat % len) / len) * 100}%` }} />;
}

const DRUM_ROW = { 36: 'kick', 38: 'snare', 39: 'snare', 42: 'hat', 46: 'hat' };

export function NotesView({ song, ticker }) {
  const melody = song.tracks.find(t => t.id === 'hum-melody')?.clips[0];
  const drums = song.tracks.find(t => t.id === 'hum-drums')?.clips[0];
  const notes = melody?.notes || [];
  const len = melody?.len || 8;
  const bars = Math.round(len / 4);
  const lo = notes.length ? Math.min(...notes.map(n => n.p)) - 2 : 57;
  const hi = notes.length ? Math.max(...notes.map(n => n.p)) + 2 : 76;
  const rows = hi - lo + 1;
  const pct = (b) => `${(b / len) * 100}%`;

  return (
    <div className="hb-hum-roll" data-testid="hum-notes">
      <div className="hb-hum-lane" style={{ '--rows': rows }}>
        {Array.from({ length: rows }, (_, i) => {
          const p = hi - i;
          return <div key={p} className="hb-hum-row" data-black={[1, 3, 6, 8, 10].includes(p % 12) ? 'true' : undefined} />;
        })}
        {Array.from({ length: bars * 4 }, (_, b) => (
          <div key={b} className="hb-hum-beatline" data-bar={b % 4 === 0 ? 'true' : undefined} style={{ left: pct(b) }}>
            {b % 4 === 0 && <span className="hb-hum-barnum">{b / 4 + 1}</span>}
          </div>
        ))}
        {notes.map((n, i) => (
          <div key={i} className="hb-hum-note" title={noteName(n.p)}
            style={{ left: pct(n.t), width: pct(n.d), top: `${((hi - n.p) / rows) * 100}%`, height: `${100 / rows}%`, opacity: 0.55 + n.v * 0.45 }}>
            <span>{noteName(n.p)}</span>
          </div>
        ))}
        <Playhead ticker={ticker} len={len} />
      </div>
      {drums && (
        <div className="hb-hum-drumlane" aria-label="Drum hits">
          {drums.notes.filter(n => DRUM_ROW[n.p]).map((n, i) => (
            <span key={i} className="hb-hum-hit" data-drum={DRUM_ROW[n.p]} style={{ left: pct(n.t) }} />
          ))}
          <Playhead ticker={ticker} len={len} />
        </div>
      )}
    </div>
  );
}
