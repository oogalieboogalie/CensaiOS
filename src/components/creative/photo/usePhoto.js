// State and actions for one Censai Photo window. The document syncs (each
// layer on its own); the tool, colors, selection and zoom stay local.
import React from 'react';
import {
  MAX_PHOTO_EDGE, addLayerPatch, cropPatch, isBlank, layerKey, makeLayer, moveLayerPatch, normRect, readPhoto, removeLayerPatch,
} from '../../../lib/creative/photoModel.js';
import { encodeSurface, layerSurface, loadImage, makeCanvas } from '../../../lib/creative/photoRender.js';
import { useUndo } from '../useUndo.js';
import { BRUSH } from '../../../lib/creative/creativeColors.js';

/** Decoded pixels for every raster layer, refreshed when a layer's data changes. */
function useSurfaces(doc) {
  const [surfaces, setSurfaces] = React.useState({});
  const decoded = React.useRef({});
  React.useEffect(() => {
    let alive = true;
    for (const id of doc.order) {
      const layer = doc.layers[id];
      if (layer.kind !== 'raster') continue;
      const sig = `${layer.src || ''}|${layer.w || doc.w}x${layer.h || doc.h}`;
      if (decoded.current[id] === sig) continue;
      decoded.current[id] = sig;
      if (!layer.src) { const c = makeCanvas(layer.w || doc.w, layer.h || doc.h); setSurfaces((s) => ({ ...s, [id]: c })); continue; }
      layerSurface(layer, doc).then((c) => { if (alive) setSurfaces((s) => ({ ...s, [id]: c })); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [doc]);
  /** Adopt a canvas we just drew, so the echo from the board isn't decoded again. */
  const adopt = (id, canvas, layer, doc2) => {
    decoded.current[id] = `${layer.src || ''}|${layer.w || doc2.w}x${layer.h || doc2.h}`;
    setSurfaces((s) => ({ ...s, [id]: canvas }));
  };
  return { surfaces, adopt };
}

async function readPicture(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Pick a PNG, JPEG, WebP or GIF picture.');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = makeCanvas(img.naturalWidth * scale, img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const fmt = file.type === 'image/png' && c.width * c.height < 700 * 700 ? 'png' : 'webp';
    return { canvas: c, fmt, name: String(file.name || 'Picture').replace(/\.[a-z0-9]+$/i, '') };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function usePhoto(win, onUpdate) {
  const doc = React.useMemo(() => readPhoto(win), [win]);
  const history = useUndo(win, onUpdate);
  const { update } = history;
  const { surfaces, adopt } = useSurfaces(doc);
  const [selectedId, setSelectedId] = React.useState(null);
  const [tool, setTool] = React.useState('brush');
  const [color, setColor] = React.useState(BRUSH);
  const [size, setSize] = React.useState(18);
  const [selection, setSelection] = React.useState(null);
  const current = doc.layers[selectedId] ? selectedId : doc.order[doc.order.length - 1] || null;
  const layer = current ? doc.layers[current] : null;

  const setLayer = (id, change) => doc.layers[id] && update({ [layerKey(id)]: { ...doc.layers[id], ...change } });

  /** Store a layer's new pixels on the board. */
  const commitSurface = (id, canvas, extra = {}) => {
    const l = doc.layers[id];
    if (!l) return;
    const next = { ...l, ...extra, src: encodeSurface(canvas, l.fmt), w: canvas.width, h: canvas.height };
    adopt(id, canvas, next, doc);
    update({ [layerKey(id)]: next });
  };

  const addLayer = (fields = {}) => {
    const n = doc.order.length + 1;
    const { id, patch } = addLayerPatch(doc, makeLayer('raster', { name: `Layer ${n}`, w: doc.w, h: doc.h, ...fields }), current);
    update(patch);
    setSelectedId(id);
    return id;
  };
  const addText = (x, y) => {
    const { id, patch } = addLayerPatch(doc, makeLayer('text', { x: Math.round(x), y: Math.round(y), color, name: 'Text' }), current);
    update(patch);
    setSelectedId(id);
    return id;
  };
  const duplicate = () => {
    if (!layer) return;
    const { id, patch } = addLayerPatch(doc, { ...layer, name: `${layer.name} copy` }, current);
    update(patch);
    setSelectedId(id);
  };
  const remove = (id = current) => {
    if (!id) return;
    const i = doc.order.indexOf(id);
    update(removeLayerPatch(doc, id));
    setSelectedId(doc.order[i - 1] || doc.order[i + 1] || null);
  };
  const move = (id, delta) => { const p = moveLayerPatch(doc, id, delta); if (p) update(p); };

  const importPicture = async (file) => {
    const pic = await readPicture(file);
    const blank = isBlank(doc);
    const w = blank ? pic.canvas.width : doc.w;
    const h = blank ? pic.canvas.height : doc.h;
    const base = blank ? { ...doc, w, h, order: [] } : doc;
    const fields = {
      name: pic.name, fmt: pic.fmt, w: pic.canvas.width, h: pic.canvas.height,
      x: Math.round((w - pic.canvas.width) / 2), y: Math.round((h - pic.canvas.height) / 2),
    };
    const draft = makeLayer('raster', fields);
    const { id, patch } = addLayerPatch(base, { ...draft, src: encodeSurface(pic.canvas, pic.fmt) }, null);
    if (blank) for (const old of doc.order) patch[layerKey(old)] = null;
    adopt(id, pic.canvas, patch[layerKey(id)], { w, h });
    update(patch);
    setSelectedId(id);
  };

  /** Run a pixel operation on the current raster layer, clipped to the selection. */
  const editPixels = (fn) => {
    if (!layer || layer.kind !== 'raster' || !surfaces[current]) return;
    const src = surfaces[current];
    const c = makeCanvas(src.width, src.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    fn(ctx, c, selection && localRect(normRect(selection), layer));
    commitSurface(current, c);
  };
  const clearSelection = () => editPixels((ctx, c, r) => { if (r) ctx.clearRect(r.x, r.y, r.w, r.h); else ctx.clearRect(0, 0, c.width, c.height); });
  const fillSelection = () => editPixels((ctx, c, r) => { ctx.fillStyle = color; const b = r || { x: 0, y: 0, w: c.width, h: c.height }; ctx.fillRect(b.x, b.y, b.w, b.h); });
  const flip = (axis) => editPixels((ctx, c) => {
    const copy = makeCanvas(c.width, c.height);
    copy.getContext('2d').drawImage(c, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    if (axis === 'h') { ctx.translate(c.width, 0); ctx.scale(-1, 1); } else { ctx.translate(0, c.height); ctx.scale(1, -1); }
    ctx.drawImage(copy, 0, 0);
    ctx.restore();
  });
  const copyToLayer = () => {
    if (!layer || layer.kind !== 'raster' || !selection || !surfaces[current]) return;
    const r = normRect(selection);
    const lr = localRect(r, layer);
    const c = makeCanvas(r.w, r.h);
    c.getContext('2d').drawImage(surfaces[current], lr.x, lr.y, lr.w, lr.h, 0, 0, r.w, r.h);
    const fields = { name: `${layer.name} part`, x: Math.round(r.x), y: Math.round(r.y), w: c.width, h: c.height, fmt: layer.fmt };
    const { id, patch } = addLayerPatch(doc, { ...makeLayer('raster', fields), src: encodeSurface(c, layer.fmt) }, current);
    adopt(id, c, patch[layerKey(id)], doc);
    update(patch);
    setSelectedId(id);
  };
  const crop = () => {
    if (!selection) return;
    update(cropPatch(doc, selection));
    setSelection(null);
  };

  return {
    doc, surfaces, history, update, current, layer, tool, setTool, color, setColor, size, setSize, selection, setSelection,
    select: setSelectedId, setLayer, commitSurface, addLayer, addText, duplicate, remove, move, importPicture,
    clearSelection, fillSelection, flip, copyToLayer, crop,
    setBackground: (bg) => update({ photoDoc: { ...(win.photoDoc || {}), w: doc.w, h: doc.h, order: doc.order, bg } }),
  };
}

/** A document rectangle in a layer's own pixel coordinates. */
export function localRect(r, layer) {
  return { x: Math.round(r.x - (layer.x || 0)), y: Math.round(r.y - (layer.y || 0)), w: Math.round(r.w), h: Math.round(r.h) };
}
