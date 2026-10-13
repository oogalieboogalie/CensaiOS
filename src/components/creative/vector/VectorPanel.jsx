/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { ColorField } from '../ColorField.jsx';
import { Slider } from '../Slider.jsx';

const NAMES = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', path: 'Path', text: 'Text' };

function shapeName(s) {
  if (s.type === 'text') return `Text: ${String(s.text || '').split('\n')[0].slice(0, 24)}`;
  return s.name || NAMES[s.type] || 'Shape';
}

/** Fill, stroke and the selected shape's own settings, then the shape list. */
export function VectorPanel({ v }) {
  const { doc, one, style, selected } = v;
  const src = selected.length ? doc.shapes[selected[0]] : style;
  const text = one?.type === 'text' ? one : null;
  const top = [...doc.order].reverse();
  return (
    <aside className="hb-cr-panel" aria-label="Shape settings">
      <section className="hb-cr-section">
        <header className="hb-cr-section-head"><span>{selected.length ? `${selected.length} selected` : 'New shapes'}</span></header>
        <div className="hb-cr-field"><span>Fill</span><ColorField label="Fill" value={src.fill} allowNone onChange={(c) => v.setStyleField('fill', c)} swatches={false} /></div>
        <div className="hb-cr-field"><span>Stroke</span><ColorField label="Stroke" value={src.stroke} allowNone onChange={(c) => v.setStyleField('stroke', c)} swatches={false} /></div>
        <div className="hb-cr-swatchrow" role="group" aria-label="Quick fill">
          <ColorField label="Quick fill" value={src.fill} onChange={(c) => v.setStyleField('fill', c)} />
        </div>
        <Slider label="Stroke width" min={0} max={40} step={0.5} unit="px" value={src.sw ?? 0} onChange={(n) => v.setStyleField('sw', n)} />
        <Slider label="Opacity" min={0} max={100} unit="%" value={Math.round((src.opacity ?? 1) * 100)} onChange={(n) => v.setStyleField('opacity', n / 100)} />
        {one?.type === 'rect' && <Slider label="Corner radius" min={0} max={Math.round(Math.min(one.w, one.h) / 2)} unit="px" value={one.rx || 0} onChange={(n) => v.setStyleField('rx', n)} />}
        {text && (
          <>
            <textarea className="hb-cr-input hb-cr-textarea" aria-label="Text" value={text.text} onChange={(e) => v.setStyleField('text', e.target.value)} />
            <Slider label="Text size" min={6} max={300} unit="px" value={text.size || 48} onChange={(n) => v.setStyleField('size', n)} />
          </>
        )}
        {one?.type === 'path' && <p className="hb-cr-hint">Double-click a shape to edit its points. Alt-drag a handle to make a corner.</p>}
      </section>
      <section className="hb-cr-section hb-cr-grow">
        <header className="hb-cr-section-head"><span>Shapes</span><span className="hb-cr-num">{doc.order.length}</span></header>
        <ul className="hb-cr-layers">
          {top.map((id) => (
            <li key={id} className="hb-cr-layer" data-active={selected.includes(id) ? 'true' : undefined}>
              <button type="button" className="hb-cr-layer-name" aria-current={selected.includes(id) ? 'true' : undefined}
                onClick={(e) => v.select([id], { add: e.shiftKey })}>
                <span className="hb-cr-dot" style={{ background: doc.shapes[id].fill !== 'none' ? doc.shapes[id].fill : doc.shapes[id].stroke }} />
                <span className="hb-cr-ellipsis">{shapeName(doc.shapes[id])}</span>
                {doc.shapes[id].group && <span className="hb-cr-tag">group</span>}
              </button>
            </li>
          ))}
          {!top.length && <li className="hb-cr-hint">Draw with the tools on the left, or import an SVG.</li>}
        </ul>
      </section>
    </aside>
  );
}
