/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { PhotoIcon } from '../photoIcons.jsx';
import { autoEdits, histogram } from '../../../lib/yorware/photoAdjust.js';
import { drawDeveloped, loadImage } from '../../../lib/yorware/photoRender.js';
import { isEdited } from '../../../lib/yorware/photoLibModel.js';
import { ASPECTS } from './CropBox.jsx';

/** A slider that previews while you drag and saves one change when you let go. Double-click resets it. */
function LiveSlider({ field, label, min, max, step, value, p }) {
  const [draft, setDraft] = React.useState(null);
  const shown = draft ?? value;
  const commit = () => { if (draft !== null && draft !== value) p.commitEdit({ [field]: draft }); setDraft(null); };
  const text = field === 'exposure' ? `${shown > 0 ? '+' : ''}${shown.toFixed(2)}` : `${shown > 0 ? '+' : ''}${Math.round(shown)}`;
  return (
    <label className="hb-cr-slider hb-yph-slider" onDoubleClick={() => p.commitEdit({ [field]: 0 })} title="Double-click to reset">
      <span className="hb-cr-slider-top"><span>{label}</span><span className="hb-cr-num" data-changed={shown !== 0 ? 'true' : undefined}>{text}</span></span>
      <input type="range" min={min} max={max} step={step} value={shown} aria-label={label}
        onChange={(e) => { const v = Number(e.target.value); setDraft(v); p.preview({ [field]: v }); }}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </label>
  );
}

function Histogram({ canvas }) {
  const bins = React.useMemo(() => {
    if (!canvas) return null;
    try { return histogram(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data); } catch { return null; }
  }, [canvas]);
  if (!bins) return <div className="hb-yph-hist" aria-hidden="true" />;
  const path = (ch) => `M0 40 ${ch.map((v, i) => `L${(i / (ch.length - 1)) * 128} ${40 - v * 38}`).join(' ')} L128 40 Z`;
  return (
    <svg className="hb-yph-hist" viewBox="0 0 128 40" preserveAspectRatio="none" role="img" aria-label="Brightness of the photo, dark on the left, bright on the right">
      <path d={path(bins[0])} data-ch="r" />
      <path d={path(bins[1])} data-ch="g" />
      <path d={path(bins[2])} data-ch="b" />
      <path d={path(bins[3])} data-ch="l" />
    </svg>
  );
}

export function DevelopSection({ p, ratio, setRatio, drawn, sliders }) {
  const [busy, setBusy] = React.useState(false);
  const auto = async () => {
    setBusy(true);
    try {
      const img = await loadImage(p.photo.thumb || p.photo.src);
      const c = drawDeveloped(img, { rot: p.edits.rot, flip: p.edits.flip, crop: p.edits.crop }, { maxEdge: 320, adjust: false });
      p.commitEdit(autoEdits(c.getContext('2d').getImageData(0, 0, c.width, c.height).data));
    } catch { /* leave the sliders as they are */ }
    setBusy(false);
  };
  const others = p.selection.filter((id) => id !== p.copied);
  return (
    <section className="hb-cr-section" aria-label="Develop">
      <header className="hb-cr-section-head"><span>Develop</span>
        <span className="hb-cr-row">
          <button type="button" className="hb-of-mini" title="Auto: balance colour and brightness" aria-label="Auto" disabled={busy} onClick={auto}><PhotoIcon.Auto size={11} /></button>
          <button type="button" className="hb-of-mini" title="Reset to the original" aria-label="Reset to the original" disabled={!isEdited(p.edits)} onClick={() => p.resetEdits()}><PhotoIcon.Reset size={11} /></button>
        </span>
      </header>
      <Histogram canvas={drawn} />
      {p.cropping && (
        <label className="hb-cr-field"><span>Shape</span>
          <select className="hb-of-select" value={ratio} onChange={(e) => setRatio(e.target.value)} aria-label="Crop shape">
            {ASPECTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      )}
      {sliders.map(([field, label, min, max, step]) => (
        <LiveSlider key={`${p.currentId}-${field}`} field={field} label={label} min={min} max={max} step={step} value={p.lib.edits[p.currentId]?.[field] ?? 0} p={p} />
      ))}
      <div className="hb-cr-row">
        <button type="button" className="hb-of-btn" data-wide="true" title="Copy this photo's look (not its crop)" onClick={p.copyEdits}><PhotoIcon.Copy /><span>Copy look</span></button>
        <button type="button" className="hb-of-btn" data-wide="true" disabled={!p.copied || (p.copied === p.currentId && !others.length)}
          title={others.length ? `Paste onto ${others.length} selected` : 'Paste onto this photo'} onClick={() => p.pasteEdits(others.length ? others : [p.currentId])}>
          <PhotoIcon.Paste /><span>Paste look</span>
        </button>
      </div>
    </section>
  );
}
