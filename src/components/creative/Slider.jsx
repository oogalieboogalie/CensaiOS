/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

/** A labelled range slider that commits when you let go, so a drag is one undo step. */
export function Slider({ label, min, max, step = 1, value, onChange, unit = '' }) {
  const [draft, setDraft] = React.useState(null);
  const shown = draft ?? value;
  const commit = () => { if (draft !== null && draft !== value) onChange(draft); setDraft(null); };
  return (
    <label className="hb-cr-slider">
      <span className="hb-cr-slider-top"><span>{label}</span><span className="hb-cr-num">{Math.round(shown * 100) / 100}{unit}</span></span>
      <input type="range" min={min} max={max} step={step} value={shown} aria-label={label}
        onChange={(e) => setDraft(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </label>
  );
}
