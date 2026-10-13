/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { EFFECTS, EFFECT_TYPES } from '../../../lib/studio/effects.js';
import { Knob } from './Controls.jsx';
import { EqEditor } from './EqEditor.jsx';
import { SynthPanel } from './SynthPanel.jsx';
import { useTick } from './ticker.js';

// The insert chain of the selected track (or the master): effects run top
// to bottom; each can be bypassed, moved or removed while the song plays.

function Reduction({ ticker, id }) {
  const db = useTick(ticker, s => s.meters.fx[id] || 0);
  return <span className="hb-studio-gr" title="Gain reduction">GR {db > 0.05 ? `-${db.toFixed(1)}` : '0.0'} dB</span>;
}

function Param({ spec, value, onChange, params }) {
  if (spec.kind === 'choice') {
    return (
      <label className="hb-studio-param">
        <span className="hb-studio-knob-label">{spec.label}</span>
        <select className="hb-studio-select" value={value} onChange={e => onChange(e.target.value)}>
          {spec.options.map(o => <option key={o} value={o}>{o[0].toUpperCase() + o.slice(1)}</option>)}
        </select>
      </label>
    );
  }
  if (spec.kind === 'flag') {
    return <button type="button" className="hb-studio-chip" aria-pressed={value} onClick={() => onChange(!value)}>{spec.label}</button>;
  }
  if (spec.key === 'ms' && params.sync !== false) return null; // free time only matters when not synced
  if (spec.key === 'division' && params.sync === false) return null;
  return <Knob spec={spec} value={value} onChange={v => onChange(Math.round(v * 100) / 100)} />;
}

function EffectCard({ fx, index, count, trackId, studio, ticker, sampleRate }) {
  const { edit } = studio;
  const spec = EFFECTS[fx.type];
  const set = patch => edit('fx', trackId, fx.id, { params: patch });
  return (
    <div className="hb-studio-fx" data-on={fx.on ? 'true' : undefined} data-testid="studio-fx">
      <div className="hb-studio-fx-head">
        <button type="button" className="hb-studio-power" aria-pressed={fx.on} onClick={() => edit('fx', trackId, fx.id, { on: !fx.on })} title={fx.on ? 'Bypass' : 'Turn on'} />
        <span className="hb-studio-fx-name">{spec.label}</span>
        {spec.meter && <Reduction ticker={ticker} id={fx.id} />}
        <span className="hb-studio-fx-tools">
          <button type="button" className="hb-studio-link" disabled={index === 0} onClick={() => edit('moveFx', trackId, fx.id, -1)} aria-label="Move up">Up</button>
          <button type="button" className="hb-studio-link" disabled={index === count - 1} onClick={() => edit('moveFx', trackId, fx.id, 1)} aria-label="Move down">Down</button>
          <button type="button" className="hb-studio-link" onClick={() => edit('removeFx', trackId, fx.id)} aria-label="Remove">Remove</button>
        </span>
      </div>
      {fx.type === 'eq' && <EqEditor params={fx.params} onChange={set} sampleRate={sampleRate} />}
      <div className="hb-studio-fx-params">
        {spec.params.map(p => <Param key={p.key} spec={p} value={fx.params[p.key]} params={fx.params} onChange={v => set({ [p.key]: v })} />)}
      </div>
    </div>
  );
}

export function FxPanel({ studio, trackId, ticker, sampleRate }) {
  const { project, edit } = studio;
  const track = trackId === 'master' ? null : project.tracks.find(t => t.id === trackId);
  const chain = trackId === 'master' ? project.master.fx : track?.fx;
  if (!chain) return <div className="hb-studio-empty">Pick a track to see its effects.</div>;
  return (
    <div className="hb-studio-fxpanel" data-no-drag>
      <div className="hb-studio-fx-bar">
        <span className="hb-studio-panel-title">{track ? track.name : 'Master'}</span>
        <select className="hb-studio-select" value="" onChange={(e) => { if (e.target.value) edit('addFx', trackId, e.target.value); }} aria-label="Add an effect" data-testid="studio-add-fx">
          <option value="">Add effect</option>
          {EFFECT_TYPES.map(t => <option key={t} value={t}>{EFFECTS[t].label}</option>)}
        </select>
        <span className="hb-studio-hint">{chain.length ? 'Signal runs top to bottom.' : 'No effects yet.'}</span>
      </div>
      <div className="hb-studio-fx-list">
        {track?.kind === 'synth' && <SynthPanel track={track} studio={studio} />}
        {chain.map((fx, i) => <EffectCard key={fx.id} fx={fx} index={i} count={chain.length} trackId={trackId} studio={studio} ticker={ticker} sampleRate={sampleRate} />)}
        {trackId === 'master' && (
          <div className="hb-studio-fx" data-on={project.master.limiter.on ? 'true' : undefined}>
            <div className="hb-studio-fx-head">
              <button type="button" className="hb-studio-power" aria-pressed={project.master.limiter.on} onClick={() => edit('limiter', { on: !project.master.limiter.on })} />
              <span className="hb-studio-fx-name">Master limiter</span>
              <Reduction ticker={ticker} id="limiter" />
            </div>
            <div className="hb-studio-fx-params">
              <Knob spec={EFFECTS.limiter.params[1]} value={project.master.limiter.ceiling} onChange={v => edit('limiter', { ceiling: Math.round(v * 10) / 10 })} />
              <Knob spec={EFFECTS.limiter.params[2]} value={project.master.limiter.release} onChange={v => edit('limiter', { release: Math.round(v) })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
