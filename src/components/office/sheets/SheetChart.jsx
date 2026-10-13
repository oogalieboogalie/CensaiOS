/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { chartData } from '../../../lib/office/sheetChart.js';

const W = 360;
const H = 200;
const PAD = { l: 40, r: 12, t: 12, b: 34 };
// Series colours: the accent first, then quiet neutrals (one accent rule).
const SERIES = ['var(--accent)', 'var(--ink-soft)', 'var(--ink-faint)', 'color-mix(in oklab, var(--accent) 45%, var(--ink-faint))'];

/** A bar or line chart drawn from a range of the sheet. */
export function SheetChart({ chart, calc, sheetId, onChange, onRemove }) {
  const data = chartData(chart.range, (address) => calc.value(sheetId, address));
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const max = Math.max(0, ...data.series.flatMap((s) => s.values));
  const min = Math.min(0, ...data.series.flatMap((s) => s.values));
  const span = max - min || 1;
  const y = (v) => PAD.t + plotH - ((v - min) / span) * plotH;
  const n = Math.max(1, data.labels.length);
  const slot = plotW / n;
  const barW = Math.max(2, (slot * 0.7) / Math.max(1, data.series.length));

  return (
    <figure className="hb-of-chart">
      <figcaption>
        <input value={chart.title || ''} placeholder={data.series.map((s) => s.name).join(', ') || 'Chart'} aria-label="Chart title"
          onChange={(e) => onChange({ title: e.target.value })} />
        <span className="hb-of-chart-range">{chart.range}</span>
        <button type="button" className="hb-of-mini" aria-pressed={chart.type === 'bar'} onClick={() => onChange({ type: 'bar' })}>Bar</button>
        <button type="button" className="hb-of-mini" aria-pressed={chart.type === 'line'} onClick={() => onChange({ type: 'line' })}>Line</button>
        <button type="button" className="hb-of-mini" aria-label="Remove chart" onClick={onRemove}><Icon.Close size={9} /></button>
      </figcaption>
      {data.series.length === 0 ? <div className="hb-of-chart-empty">Select numbers with labels, then add a chart.</div> : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chart.title || 'Chart'}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="hb-of-axis" />
          {[max, (max + min) / 2, min].map((v, i) => (
            <text key={i} x={PAD.l - 6} y={y(v) + 3} textAnchor="end" className="hb-of-tick">{Number(v.toPrecision(3)).toLocaleString()}</text>
          ))}
          {data.labels.map((label, i) => (
            <text key={i} x={PAD.l + slot * i + slot / 2} y={H - PAD.b + 14} textAnchor="middle" className="hb-of-tick">{String(label).slice(0, 10)}</text>
          ))}
          {data.series.map((s, k) => (chart.type === 'line' ? (
            <polyline key={s.name} fill="none" strokeWidth="2" stroke={SERIES[k % SERIES.length]}
              points={s.values.map((v, i) => `${PAD.l + slot * i + slot / 2},${y(v)}`).join(' ')} />
          ) : s.values.map((v, i) => (
            <rect key={`${s.name}-${i}`} fill={SERIES[k % SERIES.length]} rx="1"
              x={PAD.l + slot * i + (slot - barW * data.series.length) / 2 + barW * k} width={barW - 1}
              y={Math.min(y(v), y(0))} height={Math.abs(y(v) - y(0))} />
          ))))}
        </svg>
      )}
      {data.series.length > 1 && (
        <div className="hb-of-legend">{data.series.map((s, k) => <span key={s.name}><i style={{ background: SERIES[k % SERIES.length] }} />{s.name}</span>)}</div>
      )}
    </figure>
  );
}
