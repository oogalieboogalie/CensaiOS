/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { useFitScale } from '../../creative/useFitScale.js';
import { outputSize } from '../../../lib/yorware/photoLibModel.js';
import { PhotoCanvas } from './PhotoCanvas.jsx';
import { CropBox } from './CropBox.jsx';
import { PhotoStrip } from './PhotoGrid.jsx';

/** One photo, big, with its develop settings; the crop box on top while cropping. */
export function PhotoDevelop({ p, ratio, onDrawn }) {
  const { photo, edits, cropping } = p;
  const wrapRef = React.useRef(null);
  const shown = outputSize(photo, cropping ? { ...edits, crop: null } : edits);
  const scale = useFitScale(wrapRef, shown.w, shown.h, 40);
  const tw = edits.rot % 180 ? photo.h : photo.w;
  const th = edits.rot % 180 ? photo.w : photo.h;
  const frame = { width: Math.round(shown.w * scale), height: Math.round(shown.h * scale) };

  return (
    <div className="hb-yph-develop">
      <div className="hb-cr-stage hb-yph-stage" ref={wrapRef}>
        <div className="hb-yph-frame hb-yph-cropwrap" style={frame}>
          <PhotoCanvas className="hb-yph-big" photo={photo} edits={edits} skipCrop={cropping} maxEdge={1800} onDrawn={onDrawn} />
          {cropping && <CropBox crop={edits.crop} ratio={ratio} tw={tw} th={th} onCommit={(crop) => p.commitEdit({ crop })} />}
        </div>
      </div>
      <PhotoStrip p={p} />
    </div>
  );
}

/** Two photos side by side: the first two you selected, or this one and the next. */
export function PhotoCompare({ p }) {
  const ids = p.selection.length >= 2 ? p.selection.slice(0, 2) : [p.currentId, p.visible[p.visible.indexOf(p.currentId) + 1]].filter(Boolean);
  if (ids.length < 2) return <div className="hb-cr-stage"><p className="hb-cr-hint">Add one more photo to compare two side by side.</p></div>;
  return (
    <div className="hb-yph-compare">
      {ids.map((id) => {
        const r = p.lib.ratings[id];
        return (
          <figure key={id} className="hb-yph-compare-side" data-current={id === p.currentId ? 'true' : undefined}>
            <button type="button" className="hb-yph-compare-pic" onClick={() => p.toggleSelect(id, { add: true })} aria-label={`Choose ${p.lib.photos[id].name}`}>
              <PhotoCanvas className="hb-yph-fit" photo={p.lib.photos[id]} edits={p.lib.edits[id]} maxEdge={1400} />
            </button>
            <figcaption className="hb-yph-compare-cap">
              <span className="hb-yph-name">{p.lib.photos[id].name}</span>
              <span className="hb-yph-stars-text">{'★'.repeat(r.stars)}{'☆'.repeat(5 - r.stars)}</span>
              <button type="button" className="hb-cr-chip" data-on={r.flag === 'pick' ? 'true' : undefined} onClick={() => p.setFlag('pick', [id])}>{r.flag === 'pick' ? 'Picked' : 'Pick this one'}</button>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
