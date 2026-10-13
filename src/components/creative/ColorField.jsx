/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { SWATCHES } from '../../lib/creative/creativeColors.js';

/** A color picker plus a few swatches. `allowNone` adds a "no color" chip. */
export function ColorField({ label, value, onChange, allowNone = false, swatches = true }) {
  const none = !value || value === 'none';
  return (
    <span className="hb-cr-colorfield" role="group" aria-label={label}>
      <input type="color" className="hb-cr-color" aria-label={label} title={label} value={none ? SWATCHES[0] : value}
        onChange={(e) => onChange(e.target.value)} />
      {allowNone && (
        <button type="button" className="hb-cr-none" aria-label={`No ${label.toLowerCase()}`} aria-pressed={none}
          title={`No ${label.toLowerCase()}`} onClick={() => onChange(none ? SWATCHES[0] : 'none')} />
      )}
      {swatches && SWATCHES.map((c) => (
        <button key={c} type="button" className="hb-cr-swatch" aria-label={`${label} ${c}`} aria-pressed={value === c}
          style={{ background: c }} onClick={() => onChange(c)} />
      ))}
    </span>
  );
}
