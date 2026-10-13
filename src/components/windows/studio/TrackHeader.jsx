/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Meter } from './Controls.jsx';

// The pinned header at the left of a lane: name, mute, solo, record arm and a level meter.

export function TrackHeader({ track, studio, ticker, selected, onSelect }) {
  const { edit } = studio;
  const [naming, setNaming] = React.useState(false);
  return (
    <div className="hb-studio-head" data-color={track.color} data-selected={selected ? 'true' : undefined} onPointerDown={onSelect} data-no-drag>
      <span className="hb-studio-swatch" aria-hidden="true" />
      <div className="hb-studio-head-main">
        {naming ? (
          <input className="hb-studio-rename" autoFocus defaultValue={track.name} aria-label="Track name"
            onBlur={(e) => { edit('track', track.id, { name: e.target.value }); setNaming(false); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
        ) : (
          <span className="hb-studio-head-name" onDoubleClick={() => setNaming(true)} title="Double-click to rename">{track.name}</span>
        )}
        <span className="hb-studio-head-kind">{track.kind === 'synth' ? `Synth · ${track.synth.preset}` : 'Audio'}</span>
      </div>
      <div className="hb-studio-head-btns">
        <button type="button" className="hb-studio-ms" aria-pressed={track.mute} onClick={() => edit('track', track.id, { mute: !track.mute })} title="Mute">M</button>
        <button type="button" className="hb-studio-ms" data-solo="true" aria-pressed={track.solo} onClick={() => edit('solo', track.id)} title="Solo">S</button>
        {track.kind === 'audio' && (
          <button type="button" className="hb-studio-ms" data-arm="true" aria-pressed={track.arm} onClick={() => edit('track', track.id, { arm: !track.arm })} title="Arm for recording">R</button>
        )}
      </div>
      <Meter ticker={ticker} pick={m => m.tracks[track.id]} />
    </div>
  );
}
