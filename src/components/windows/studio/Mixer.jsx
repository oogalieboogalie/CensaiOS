/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Knob, Fader, Meter, formatValue } from './Controls.jsx';
import { EFFECTS } from '../../../lib/studio/effects.js';

// Mixer: a channel strip per track (inserts, pan, fader, meter, mute and
// solo) and the master strip. Clicking a strip opens its effects.

const PAN = { label: 'Pan', min: -1, max: 1, def: 0, unit: '' };
const dbText = v => (v <= -60 ? '-inf' : formatValue(v, 'dB'));

function Strip({ name, color, fx, gain, pan, onGain, onPan, mute, solo, onMute, onSolo, ticker, pick, selected, onSelect, master }) {
  return (
    <div className="hb-studio-strip" data-color={color} data-selected={selected ? 'true' : undefined} data-master={master ? 'true' : undefined} onPointerDown={onSelect} data-testid="studio-strip">
      <span className="hb-studio-strip-name" title={name}>{name}</span>
      <div className="hb-studio-inserts">
        {fx.length ? fx.slice(0, 4).map(f => <span key={f.id} className="hb-studio-insert" data-on={f.on ? 'true' : undefined}>{EFFECTS[f.type].label}</span>)
          : <span className="hb-studio-insert" data-empty="true">No inserts</span>}
        {fx.length > 4 && <span className="hb-studio-insert">+{fx.length - 4} more</span>}
      </div>
      {onPan ? <Knob spec={PAN} value={pan} onChange={v => onPan(Math.round(v * 100) / 100)} size={30} /> : <div className="hb-studio-knob-spacer" />}
      <div className="hb-studio-strip-fader">
        <Fader value={gain} onChange={onGain} label={`${name} volume`} />
        <Meter ticker={ticker} pick={pick} />
      </div>
      <span className="hb-studio-strip-db">{dbText(gain)}</span>
      <div className="hb-studio-head-btns">
        {onMute && <button type="button" className="hb-studio-ms" aria-pressed={mute} onClick={onMute} title="Mute">M</button>}
        {onSolo && <button type="button" className="hb-studio-ms" data-solo="true" aria-pressed={solo} onClick={onSolo} title="Solo">S</button>}
      </div>
    </div>
  );
}

export function Mixer({ studio, ticker, selection, setSelection }) {
  const { project, edit } = studio;
  return (
    <div className="hb-studio-mixer" data-no-drag data-testid="studio-mixer">
      {project.tracks.map(t => (
        <Strip key={t.id} name={t.name} color={t.color} fx={t.fx} gain={t.gain} pan={t.pan} mute={t.mute} solo={t.solo}
          onGain={v => edit('track', t.id, { gain: v })} onPan={v => edit('track', t.id, { pan: v })}
          onMute={() => edit('track', t.id, { mute: !t.mute })} onSolo={() => edit('solo', t.id)}
          ticker={ticker} pick={m => m.tracks[t.id]} selected={selection.trackId === t.id}
          onSelect={() => setSelection({ trackId: t.id, clipId: null })} />
      ))}
      <Strip master name="Master" fx={project.master.fx} gain={project.master.gain}
        onGain={v => edit('master', { gain: v })} ticker={ticker} pick={m => m.master}
        selected={selection.trackId === 'master'} onSelect={() => setSelection({ trackId: 'master', clipId: null })} />
    </div>
  );
}
