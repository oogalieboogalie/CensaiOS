import React from 'react';
import { EVERY_CHOICES, everyChip } from '../../lib/schedule/plainWords.js';

const UNITS = [['1', 'minutes'], ['60', 'hours'], ['1440', 'days']];

/** "Every so often" starts: one-tap gaps, or your own number. `value` is minutes. */
export function EveryPicker({ value = 60, onChange, min = 5, max = 10080 }) {
  const preset = EVERY_CHOICES.includes(Number(value));
  const [custom, setCustom] = React.useState(!preset);
  const unit = Number(value) % 1440 === 0 ? 1440 : Number(value) % 60 === 0 ? 60 : 1;
  const clamp = (n) => Math.min(max, Math.max(min, Math.round(n)));
  return (
    <div className="hb-sched-field">
      <span className="hb-sched-label">Every</span>
      <div className="hb-sched-chips">
        {EVERY_CHOICES.map((m) => (
          <button key={m} type="button" className="hb-sched-chip" aria-pressed={!custom && Number(value) === m}
            onClick={() => { setCustom(false); onChange?.(m); }}>{everyChip(m)}</button>
        ))}
        <button type="button" className="hb-sched-chip" aria-pressed={custom} onClick={() => setCustom(true)}>Other</button>
      </div>
      {custom && (
        <div className="hb-sched-every">
          <input className="hb-sched-input" type="number" aria-label="How many" min={1} value={Math.round(Number(value) / unit)}
            onChange={(e) => onChange?.(clamp(Number(e.target.value || 1) * unit))} />
          <select className="hb-sched-input" aria-label="Unit" value={String(unit)}
            onChange={(e) => onChange?.(clamp(Math.round(Number(value) / unit) * Number(e.target.value)))}>
            {UNITS.map(([n, words]) => <option key={n} value={n}>{words}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
