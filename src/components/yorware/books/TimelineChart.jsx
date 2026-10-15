/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// Income and expenses over time, with events and tracked numbers on the
// same axis. Hover a column to see that period; click it (or press Enter)
// to see every transaction, event and number behind it. Ported from Open
// Books' TimelineExplorer (MIT).
import React from 'react';
import { money, num } from './BooksBits.jsx';
import { PeriodPanel, TimelineTable } from './PeriodPanel.jsx';

const usdShort = (d) => (d >= 1e6 ? `$${+(d / 1e6).toFixed(1)}M` : d >= 1000 ? `$${+(d / 1000).toFixed(1)}k` : `$${d}`);
const PAD = { left: 64, right: 12 };
const MAIN_H = 260;
const EVENT_BAND = 22;
const AXIS_H = 24;
const SMALL_H = 64;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Bar({ x, w, y0, y1, fill }) {
  const h = y0 - y1;
  if (h <= 0) return null;
  const r = Math.min(4, h / 2, w / 2);
  return <path d={`M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`} fill={fill} pointerEvents="none" />;
}

function shortLabel(start, g) {
  const [y, m, d] = start.split('-').map(Number);
  if (g === 'month') return m === 1 ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1];
  return `${MONTHS[m - 1]} ${d}`;
}

function niceStep(raw) {
  const exp = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

export function TimelineChart({ b, data }) {
  const wrap = React.useRef(null);
  const [width, setWidth] = React.useState(760);
  const [hover, setHover] = React.useState(null);
  const [selected, setSelected] = React.useState(null);

  React.useLayoutEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(300, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = data.buckets.length;
  const plotW = width - PAD.left - PAD.right;
  const band = plotW / Math.max(1, n);
  const cx = (i) => PAD.left + band * i + band / 2;
  const barW = Math.max(1, Math.min(16, (band - 4) / 2));
  const max = Math.max(1, ...data.buckets.flatMap((x) => [x.incomeCents, x.expenseCents]));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const plotTop = EVENT_BAND + 6;
  const plotH = MAIN_H - plotTop - AXIS_H;
  const y = (v) => plotTop + plotH - (Math.max(0, v) / top) * plotH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = Math.ceil(n / Math.max(1, Math.floor(plotW / 64)));
  const eventsByBucket = new Map();
  for (const e of data.events) eventsByBucket.set(e.bucket, [...(eventsByBucket.get(e.bucket) ?? []), e]);

  const pick = (clientX) => {
    const rect = wrap.current.getBoundingClientRect();
    // The board may be zoomed; work in the chart's own units.
    const scale = rect.width / width || 1;
    const i = Math.floor(((clientX - rect.left) / scale - PAD.left) / band);
    return i >= 0 && i < n ? i : null;
  };
  const onKey = (e) => {
    const cur = hover ?? selected ?? n - 1;
    if (e.key === 'ArrowLeft') setHover(Math.max(0, cur - 1));
    else if (e.key === 'ArrowRight') setHover(Math.min(n - 1, cur + 1));
    else if (e.key === 'Enter' || e.key === ' ') setSelected(cur);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const cols = {
    onMouseMove: (e) => setHover(pick(e.clientX)),
    onMouseLeave: () => setHover(null),
    onClick: (e) => { const i = pick(e.clientX); if (i !== null) setSelected(i); },
  };
  const tip = hover !== null ? data.buckets[hover] : null;
  const tipLeft = hover !== null ? cx(hover) : 0;
  const flip = tipLeft > width - 240;
  const shade = (h) => <>
    {selected !== null && <rect className="hb-yb-col-selected" x={PAD.left + band * selected} y={0} width={band} height={h} />}
    {hover !== null && <rect className="hb-yb-col-hover" x={PAD.left + band * hover} y={0} width={band} height={h} />}
  </>;

  return (
    <div className="hb-yb-timeline">
      <div className="hb-yb-legend" aria-hidden="true">
        <span><i data-swatch="income" />Income</span>
        <span><i data-swatch="expense" />Expenses</span>
        <span><i className="hb-yb-event-key" />Event</span>
      </div>
      <div ref={wrap} className="hb-yb-plot" tabIndex={0} role="group" onKeyDown={onKey} onBlur={() => setHover(null)}
        aria-label="Timeline. Use left and right arrows to move between periods and Enter to see details.">
        <svg width={width} height={MAIN_H} {...cols} role="img" aria-label={`Income and expenses by ${data.granularity}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="hb-yb-grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="hb-yb-axis" x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{usdShort(t / 100)}</text>
            </g>
          ))}
          {shade(MAIN_H - AXIS_H)}
          {[...eventsByBucket.entries()].map(([i, evs]) => (
            <g key={`ev-${i}`} className="hb-yb-event">
              <line x1={cx(i)} x2={cx(i)} y1={EVENT_BAND - 2} y2={MAIN_H - AXIS_H} />
              <circle cx={cx(i)} cy={EVENT_BAND / 2} r={evs.length > 1 ? 8 : 5} />
              {evs.length > 1 && <text x={cx(i)} y={EVENT_BAND / 2 + 4} textAnchor="middle">{evs.length}</text>}
            </g>
          ))}
          {data.buckets.map((bk, i) => (
            <g key={bk.start}>
              <Bar x={cx(i) - barW - 1} w={barW} y0={y(0)} y1={y(bk.incomeCents)} fill="var(--yb-income)" />
              <Bar x={cx(i) + 1} w={barW} y0={y(0)} y1={y(bk.expenseCents)} fill="var(--yb-expense)" />
              {i % labelEvery === 0 && <text className="hb-yb-axis" x={cx(i)} y={MAIN_H - 7} textAnchor="middle">{shortLabel(bk.start, data.granularity)}</text>}
            </g>
          ))}
          <line className="hb-yb-baseline" x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} />
        </svg>
        {data.series.map((s) => {
          const smax = Math.max(1, ...s.values);
          const sy = (v) => 6 + (SMALL_H - 12) * (1 - v / smax);
          const w = Math.max(1, Math.min(14, band - 4));
          return (
            <div className="hb-yb-small" key={s.key}>
              <div className="hb-yb-small-title"><span>{s.name}</span><span className="hb-yb-muted">{num(s.values.reduce((a, v) => a + v, 0))} in range</span></div>
              <svg width={width} height={SMALL_H} {...cols} role="img" aria-label={`${s.name} by ${data.granularity}`}>
                {shade(SMALL_H)}
                {[...eventsByBucket.keys()].map((i) => <line key={i} className="hb-yb-event-guide" x1={cx(i)} x2={cx(i)} y1={0} y2={SMALL_H} />)}
                <text className="hb-yb-axis" x={PAD.left - 8} y={14} textAnchor="end">{num(smax)}</text>
                {s.values.map((v, i) => <Bar key={i} x={cx(i) - w / 2} w={w} y0={SMALL_H - 6} y1={sy(v)} fill="var(--yb-metric)" />)}
                <line className="hb-yb-baseline" x1={PAD.left} x2={width - PAD.right} y1={SMALL_H - 6} y2={SMALL_H - 6} />
              </svg>
            </div>
          );
        })}
        {tip && (
          <div className="hb-yb-tooltip" style={flip ? { right: width - tipLeft + 12 } : { left: tipLeft + 12 }} role="status">
            <strong>{tip.label}</strong>
            <div><i data-swatch="income" />Income <b>{money(tip.incomeCents)}</b></div>
            <div><i data-swatch="expense" />Expenses <b>{money(tip.expenseCents)}</b></div>
            {data.series.map((s) => (s.values[hover] ? <div key={s.key}><i data-swatch="metric" />{s.name} <b>{num(s.values[hover])}</b></div> : null))}
            {(eventsByBucket.get(hover) ?? []).map((e) => <div key={e.id} className="hb-yb-tip-event"><i className="hb-yb-event-key" />{e.title}</div>)}
            <div className="hb-yb-muted hb-yb-tip-hint">Click for details</div>
          </div>
        )}
      </div>
      {data.series.length === 0 && (
        <p className="hb-yb-muted hb-yb-small-print">Log events and daily numbers (contacts, appointments, leads) on the Timeline page and they&apos;ll appear here, lined up with your money.</p>
      )}
      <TimelineTable data={data} eventsByBucket={eventsByBucket} onSelect={setSelected} />
      {selected !== null && data.buckets[selected] && (
        <PeriodPanel b={b} bucket={data.buckets[selected]} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
