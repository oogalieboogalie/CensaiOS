/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { eqResponseDb } from '../../../lib/studio/dsp/eq.js';
import { FILTER_TYPES } from '../../../lib/studio/dsp/biquad.js';
import { Knob } from './Controls.jsx';

// The EQ's curve, drawn from the same filter maths the audio uses, with a
// draggable point per band (left/right = frequency, up/down = gain, wheel = Q).

const W = 360; const H = 120; const FMIN = 20; const FMAX = 20000; const RANGE = 18;
const xOf = f => (Math.log(f / FMIN) / Math.log(FMAX / FMIN)) * W;
const fOf = x => FMIN * Math.pow(FMAX / FMIN, x / W);
const yOf = db => H / 2 - (db / RANGE) * (H / 2 - 6);
const TYPE_LABEL = { lowcut: 'Low cut', lowshelf: 'Low shelf', peak: 'Bell', highshelf: 'High shelf', highcut: 'High cut' };

export function EqEditor({ params, onChange, sampleRate = 48000 }) {
  const bands = params.bands;
  const svgRef = React.useRef(null);
  const setBand = (i, patch) => onChange({ bands: bands.map((b, k) => (k === i ? { ...b, ...patch } : b)) });
  let d = '';
  for (let x = 0; x <= W; x += 3) d += `${x === 0 ? 'M' : 'L'}${x} ${yOf(Math.max(-RANGE, Math.min(RANGE, eqResponseDb(bands, fOf(x), sampleRate)))).toFixed(1)}`;

  const drag = (e, i) => {
    e.preventDefault(); e.stopPropagation();
    const r = svgRef.current.getBoundingClientRect();
    const move = (ev) => {
      const x = Math.max(0, Math.min(W, ((ev.clientX - r.left) / r.width) * W));
      const y = Math.max(0, Math.min(H, ((ev.clientY - r.top) / r.height) * H));
      const gain = Math.round(((H / 2 - y) / (H / 2 - 6)) * RANGE * 10) / 10;
      const cut = bands[i].type.endsWith('cut');
      setBand(i, { freq: Math.round(fOf(x)), on: true, ...(cut ? {} : { gain: Math.max(-24, Math.min(24, gain)) }) });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  return (
    <div className="hb-studio-eq" data-no-drag>
      <svg ref={svgRef} className="hb-studio-eq-graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" data-testid="studio-eq-curve">
        {[100, 1000, 10000].map(f => <line key={f} x1={xOf(f)} x2={xOf(f)} y1={0} y2={H} className="hb-studio-eq-grid" />)}
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="hb-studio-eq-grid" />
        <path d={d} className="hb-studio-eq-line" />
        {bands.map((b, i) => (
          <circle key={i} cx={xOf(b.freq)} cy={b.type.endsWith('cut') ? H / 2 : yOf(b.gain)} r={5} className="hb-studio-eq-dot" data-on={b.on ? 'true' : undefined}
            onPointerDown={e => drag(e, i)} onWheel={(e) => { e.stopPropagation(); setBand(i, { q: Math.max(0.1, Math.min(18, b.q * (e.deltaY < 0 ? 1.1 : 0.9))) }); }}>
            <title>{`Band ${i + 1}: ${TYPE_LABEL[b.type]}. Drag to move, wheel for width.`}</title>
          </circle>
        ))}
      </svg>
      <div className="hb-studio-eq-bands">
        {bands.map((b, i) => (
          <div key={i} className="hb-studio-eq-band" data-on={b.on ? 'true' : undefined}>
            <div className="hb-studio-eq-band-head">
              <button type="button" className="hb-studio-ms" aria-pressed={b.on} onClick={() => setBand(i, { on: !b.on })} title="Band on or off">{i + 1}</button>
              <select className="hb-studio-select" value={b.type} onChange={e => setBand(i, { type: e.target.value })} aria-label={`Band ${i + 1} shape`}>
                {FILTER_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <Knob spec={{ label: 'Freq', min: 20, max: 20000, def: 1000, unit: 'Hz', curve: 'log' }} value={b.freq} onChange={v => setBand(i, { freq: Math.round(v) })} size={30} />
            {!b.type.endsWith('cut') && <Knob spec={{ label: 'Gain', min: -24, max: 24, def: 0, unit: 'dB' }} value={b.gain} onChange={v => setBand(i, { gain: Math.round(v * 10) / 10 })} size={30} />}
            <Knob spec={{ label: 'Q', min: 0.1, max: 18, def: 0.71, unit: '', curve: 'log' }} value={b.q} onChange={v => setBand(i, { q: Math.round(v * 100) / 100 })} size={30} />
          </div>
        ))}
      </div>
    </div>
  );
}
