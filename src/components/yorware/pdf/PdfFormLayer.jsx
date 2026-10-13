/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { shownRotation } from '../../../lib/yorware/pdfModel.js';
import { shownValue } from '../../../lib/yorware/pdfForm.js';
import { rectToShown } from '../../../lib/yorware/pdfText.js';
import { boxesOnPage } from './usePdfForm.js';

/**
 * The PDF's own fill-in boxes, tick boxes and choices, laid over the page
 * where the file puts them. Answers save to the board as you type, so a
 * teammate sees them fill in. Signature boxes take your signature in one click.
 */
export function PdfFormLayer({ p, scale, byFile }) {
  const { doc, page } = p;
  const boxes = boxesOnPage(byFile, page);
  if (!boxes.length) return null;
  const rot = shownRotation(page);
  const values = doc.values[page.file] || {};
  return (
    <div className="hb-yp-form" data-tool={p.tool}>
      {boxes.map(({ field, widget, n }) => {
        const box = rectToShown(widget, page.w, page.h, rot);
        const style = { left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale };
        const key = `${field.name}:${n}`;
        const value = shownValue(field, values);
        const set = (v) => p.fillField(page.file, field, v);
        const font = { fontSize: Math.max(7, Math.min(box.h * 0.68, 13)) * scale };
        const label = field.name.replace(/[._]+/g, ' ');
        if (field.type === 'signature') {
          return (
            <button key={key} type="button" className="hb-yp-field hb-yp-field-sign" style={style} aria-label={`Sign: ${label}`}
              onPointerDown={(e) => e.stopPropagation()} onClick={() => p.signInto(box)}>
              <span style={font}>Sign here</span>
            </button>
          );
        }
        const common = { className: 'hb-yp-field', 'data-type': field.type, style, 'aria-label': label, title: label, disabled: field.readOnly, onPointerDown: (e) => e.stopPropagation() };
        if (field.type === 'check') {
          return <input key={key} {...common} type="checkbox" checked={Boolean(value)} onChange={(e) => set(e.target.checked)} />;
        }
        if (field.type === 'radio') {
          const option = field.options[n] ?? String(n);
          return <input key={key} {...common} type="radio" name={`${page.file}:${field.name}`} checked={value === option} onChange={() => set(option)} aria-label={`${label}: ${option}`} />;
        }
        if (field.type === 'choice') {
          return (
            <select key={key} {...common} style={{ ...style, ...font }} value={value || ''} onChange={(e) => set(e.target.value)}>
              <option value="">—</option>
              {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          );
        }
        const Tag = field.multiline ? 'textarea' : 'input';
        return <Tag key={key} {...common} style={{ ...style, ...font }} value={value ?? ''} onChange={(e) => set(e.target.value)} />;
      })}
    </div>
  );
}
