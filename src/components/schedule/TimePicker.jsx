import React from 'react';

const pad = (n) => String(n).padStart(2, '0');
const QUICK = [['09:00', '9 AM'], ['12:00', 'Noon'], ['17:00', '5 PM']];

/**
 * The one time picker every scheduling screen uses: hour, minute, AM or PM,
 * plus a few one-tap times. `value` and `onChange` use 24-hour "HH:MM".
 */
export function TimePicker({ value = '09:00', onChange, label = 'Time', quick = true }) {
  const [h24, minute] = String(value).split(':').map(Number);
  const pm = h24 >= 12;
  const hour12 = h24 % 12 || 12;
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
  if (!minutes.includes(minute)) minutes.push(minute);
  const set = (h12, m, isPm) => onChange?.(`${pad((h12 % 12) + (isPm ? 12 : 0))}:${pad(m)}`);

  return (
    <div className="hb-sched-field">
      <span className="hb-sched-label">{label}</span>
      <div className="hb-sched-time" role="group" aria-label={label}>
        <select aria-label="Hour" value={hour12} onChange={(e) => set(Number(e.target.value), minute, pm)}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <span className="hb-sched-colon">:</span>
        <select aria-label="Minute" value={minute} onChange={(e) => set(hour12, Number(e.target.value), pm)}>
          {minutes.sort((a, b) => a - b).map((m) => <option key={m} value={m}>{pad(m)}</option>)}
        </select>
        <div className="hb-sched-seg hb-sched-ampm">
          {['AM', 'PM'].map((half) => (
            <button key={half} type="button" aria-pressed={pm === (half === 'PM')} onClick={() => set(hour12, minute, half === 'PM')}>{half}</button>
          ))}
        </div>
      </div>
      {quick && (
        <div className="hb-sched-chips">
          {QUICK.map(([hhmm, words]) => (
            <button key={hhmm} type="button" className="hb-sched-chip" aria-pressed={value === hhmm} onClick={() => onChange?.(hhmm)}>{words}</button>
          ))}
        </div>
      )}
    </div>
  );
}
