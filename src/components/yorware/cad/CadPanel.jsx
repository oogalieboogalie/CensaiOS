/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { paramValues } from '../../../lib/yorware/cadRun.js';
import { sizeText, volumeText } from '../../../lib/yorware/cadModel.js';

function Dial({ spec, value, disabled, onChange }) {
  if (spec.kind === 'toggle') {
    return (
      <label className="hb-cr-inline hb-yc-toggle">
        <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span>{spec.label}</span>
      </label>
    );
  }
  if (spec.kind === 'choice') {
    return (
      <label className="hb-yc-dial">
        <span className="hb-cr-slider-top"><span>{spec.label}</span></span>
        <select className="hb-of-select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {spec.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  const set = (raw) => { const n = Number(raw); if (Number.isFinite(n)) onChange(Math.min(spec.max, Math.max(spec.min, n))); };
  return (
    <div className="hb-cr-slider hb-yc-dial">
      <span className="hb-cr-slider-top">
        <label htmlFor={`yc-${spec.name}`}>{spec.label}</label>
        <span className="hb-yc-numwrap">
          <input className="hb-yc-num" type="number" aria-label={`${spec.label} value`} value={value} min={spec.min} max={spec.max} step={spec.step}
            disabled={disabled} onChange={(e) => set(e.target.value)} />
          <span className="hb-cr-num">{spec.unit}</span>
        </span>
      </span>
      <input id={`yc-${spec.name}`} type="range" min={spec.min} max={spec.max} step={spec.step} value={value} disabled={disabled}
        onChange={(e) => set(e.target.value)} />
    </div>
  );
}

/** Right panel: the part's sizes as dials, and what the build made. */
export function CadPanel({ cad }) {
  const { part, status, board, canEdit } = cad;
  const specs = part?.specs || [];
  const values = paramValues(specs, board.values);
  const changed = Object.keys(board.values).some((k) => specs.some((s) => s.name === k));
  return (
    <aside className="hb-cr-panel hb-yc-panel" aria-label="Part settings">
      <section className="hb-cr-section">
        <div className="hb-cr-section-head">
          <span>Sizes</span>
          {changed && canEdit && <button type="button" className="hb-of-mini" onClick={cad.resetValues} title="Put every size back to the recipe's own">Reset</button>}
        </div>
        {specs.length ? specs.map((s) => (
          <Dial key={s.name} spec={s} value={values[s.name]} disabled={!canEdit} onChange={(v) => cad.setValue(s.name, v)} />
        )) : <p className="hb-cr-hint">{status === 'building' ? 'Reading the recipe…' : 'This recipe has no sizes to change. Add some in its params list.'}</p>}
      </section>
      <section className="hb-cr-section">
        <div className="hb-cr-section-head"><span>Part</span></div>
        {part?.ok || part?.stale ? (
          <dl className="hb-yc-facts">
            <dt>Size</dt><dd>{sizeText(part.size) || '—'}</dd>
            <dt>Volume</dt><dd>{part.volume ? volumeText(part.volume) : '—'}</dd>
            <dt>Bodies</dt>
            <dd>
              <ul className="hb-yc-bodies">
                {(part.bodies || []).map((b) => <li key={b.name}><span className="hb-yc-swatch" style={{ background: b.color }} />{b.name}</li>)}
              </ul>
            </dd>
          </dl>
        ) : <p className="hb-cr-hint">{status === 'building' ? 'Building…' : 'Nothing built yet.'}</p>}
        <p className="hb-cr-hint">Sizes are in millimetres. Export STL for a 3D printer, STEP for other CAD apps and machine shops.</p>
      </section>
    </aside>
  );
}
