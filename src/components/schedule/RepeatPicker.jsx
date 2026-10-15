import React from 'react';
import { DAY_SHORT, REPEAT_CHOICES } from '../../lib/schedule/plainWords.js';

/**
 * How often a timed schedule repeats, and from which day. `value` is the
 * shared shape { date, repeat, days } from lib/schedule/plainWords.js.
 */
export function RepeatPicker({ value, onChange }) {
  const patch = (fields) => onChange?.({ ...value, ...fields });
  const toggleDay = (d) => patch({ days: value.days?.includes(d) ? value.days.filter((x) => x !== d) : [...(value.days || []), d] });
  return (
    <>
      <div className="hb-sched-field">
        <span className="hb-sched-label">Repeat</span>
        <div className="hb-sched-seg hb-sched-repeat" role="group" aria-label="Repeat">
          {REPEAT_CHOICES.map(([id, words]) => (
            <button key={id} type="button" aria-pressed={value.repeat === id} onClick={() => patch({ repeat: id })}>{words}</button>
          ))}
        </div>
        {value.repeat === 'days' && (
          <div className="hb-sched-days" role="group" aria-label="Days">
            {DAY_SHORT.map((name, d) => (
              <button key={name} type="button" aria-pressed={!!value.days?.includes(d)} aria-label={name} onClick={() => toggleDay(d)}>{name.slice(0, 2)}</button>
            ))}
          </div>
        )}
      </div>
      <label className="hb-sched-field">
        <span className="hb-sched-label">{value.repeat === 'once' ? 'On' : 'Starting'}</span>
        <input className="hb-sched-input" type="date" value={value.date || ''} onChange={(e) => patch({ date: e.target.value })} />
      </label>
    </>
  );
}
