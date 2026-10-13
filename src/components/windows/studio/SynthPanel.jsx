/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { SYNTH_PRESETS } from '../../../lib/studio/dsp/synth.js';
import { Knob } from './Controls.jsx';

// The synth's sound, shown above its track's effects.

const WAVES = ['saw', 'square', 'tri', 'sine'];
const KNOBS = [
  { key: 'mix', label: 'Osc 2', min: 0, max: 1, def: 0.3, unit: '' },
  { key: 'detune', label: 'Detune', min: 0, max: 50, def: 6, unit: ' ct' },
  { key: 'cutoff', label: 'Cutoff', min: 40, max: 16000, def: 2000, unit: 'Hz', curve: 'log' },
  { key: 'res', label: 'Resonance', min: 0, max: 0.95, def: 0.2, unit: '' },
  { key: 'envAmt', label: 'Filter env', min: 0, max: 8000, def: 2000, unit: 'Hz' },
  { key: 'a', label: 'Attack', min: 0.001, max: 4, def: 0.01, unit: 's', curve: 'log' },
  { key: 'd', label: 'Decay', min: 0.01, max: 4, def: 0.4, unit: 's', curve: 'log' },
  { key: 's', label: 'Sustain', min: 0, max: 1, def: 0.6, unit: '' },
  { key: 'r', label: 'Release', min: 0.01, max: 5, def: 0.3, unit: 's', curve: 'log' },
  { key: 'level', label: 'Level', min: -36, max: 0, def: -8, unit: 'dB' },
];

export function SynthPanel({ track, studio }) {
  const { edit } = studio;
  const s = track.synth;
  const set = patch => edit('synth', track.id, patch);
  return (
    <div className="hb-studio-fx" data-on="true" data-testid="studio-synth">
      <div className="hb-studio-fx-head">
        <span className="hb-studio-fx-name">Synth</span>
        <select className="hb-studio-select" value={s.preset} aria-label="Preset"
          onChange={e => edit('track', track.id, { synth: { preset: e.target.value } })}>
          {Object.entries(SYNTH_PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
        </select>
        {['osc1', 'osc2'].map(k => (
          <select key={k} className="hb-studio-select" value={s[k]} aria-label={k === 'osc1' ? 'Oscillator 1' : 'Oscillator 2'} onChange={e => set({ [k]: e.target.value })}>
            {WAVES.map(w => <option key={w} value={w}>{w[0].toUpperCase() + w.slice(1)}</option>)}
          </select>
        ))}
      </div>
      <div className="hb-studio-fx-params">
        {KNOBS.map(k => <Knob key={k.key} spec={k} value={s[k.key]} onChange={v => set({ [k.key]: Math.round(v * 1000) / 1000 })} />)}
      </div>
    </div>
  );
}
