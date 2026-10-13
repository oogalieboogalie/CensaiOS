// State and actions for one Censai Vector window. Shapes sync one by one;
// the tool, the selection and the pen in progress stay local.
import React from 'react';
import {
  DEFAULT_STYLE, addShapesPatch, alignPatch, distributePatch, duplicateShapes, expandGroups, groupPatch, makeShape,
  readVector, removeShapesPatch, reorderPatch, shapeKey, shapesPatch, ungroupPatch,
} from '../../../lib/creative/vectorModel.js';
import { moveShape, toPath } from '../../../lib/creative/vectorGeom.js';
import { importSvg } from '../../../lib/creative/svgIn.js';
import { newPartId } from '../../../lib/office/officeParts.js';
import { useUndo } from '../useUndo.js';

export function useVector(win, onUpdate) {
  const doc = React.useMemo(() => readVector(win), [win]);
  const history = useUndo(win, onUpdate);
  const { update } = history;
  const [selected, setSelectedRaw] = React.useState([]);
  const [tool, setTool] = React.useState('select');
  const [style, setStyle] = React.useState({ ...DEFAULT_STYLE });
  const [editId, setEditId] = React.useState(null);
  const live = selected.filter((id) => doc.shapes[id]);
  const one = live.length === 1 ? doc.shapes[live[0]] : null;

  const select = (ids, { add = false } = {}) => {
    const next = expandGroups(doc, ids);
    setSelectedRaw((cur) => (add ? [...new Set([...cur.filter((id) => !next.includes(id)), ...next.filter((id) => !cur.includes(id))])] : next));
    if (!next.includes(editId)) setEditId(null);
  };

  const add = (shapes, { keepTool = false } = {}) => {
    const { ids, patch } = addShapesPatch(doc, shapes);
    update(patch);
    setSelectedRaw(ids);
    if (!keepTool) setTool('select');
    return ids;
  };
  const addShape = (type, fields) => {
    const s = makeShape(type, fields);
    if (type === 'text') return add([s]);
    // Lines (and open pen paths) need a stroke to be seen at all.
    if (type === 'line' || (type === 'path' && fields.open)) return add([{ ...s, stroke: style.stroke !== 'none' ? style.stroke : s.stroke, sw: style.sw || s.sw }]);
    return add([{ ...s, fill: style.fill, stroke: style.stroke, sw: style.sw, opacity: style.opacity }]);
  };
  const change = (changes) => update(shapesPatch(changes));

  /** Set a style field on the selection (or on the defaults for new shapes). */
  const setStyleField = (key, value) => {
    if (!live.length) { setStyle((s) => ({ ...s, [key]: value })); return; }
    change(Object.fromEntries(live.map((id) => [id, { ...doc.shapes[id], [key]: value }])));
    if (key !== 'text' && key !== 'size' && key !== 'rx') setStyle((s) => ({ ...s, [key]: value }));
  };

  const remove = () => { if (live.length) { update(removeShapesPatch(doc, live)); setSelectedRaw([]); setEditId(null); } };
  const duplicate = () => { if (live.length) add(duplicateShapes(doc, live), { keepTool: true }); };
  const nudge = (dx, dy) => live.length && change(Object.fromEntries(live.map((id) => [id, moveShape(doc.shapes[id], dx, dy)])));
  const group = () => { if (live.length > 1) update(groupPatch(doc, live)); };
  const ungroup = () => { if (live.some((id) => doc.shapes[id].group)) update(ungroupPatch(doc, live)); };
  const align = (mode) => { if (live.length) update(alignPatch(doc, live, mode)); };
  const distribute = (axis) => update(distributePatch(doc, live, axis));
  const reorder = (front) => { if (live.length) update(reorderPatch(doc, live, front)); };

  /** Start editing a shape's points. Rectangles, ellipses and lines turn into paths first. */
  const editPoints = (id) => {
    const s = doc.shapes[id];
    if (!s || s.type === 'text') return;
    if (s.type !== 'path') update({ [shapeKey(id)]: toPath(s) });
    setSelectedRaw([id]);
    setEditId(id);
  };

  const importText = (text) => {
    const parsed = importSvg(text, new DOMParser(), () => newPartId('g'));
    if (!parsed.shapes.length) throw new Error('That SVG has no shapes this editor can read.');
    const empty = !doc.order.length;
    const { ids, patch } = addShapesPatch(empty ? { ...doc, w: parsed.w, h: parsed.h } : doc, parsed.shapes);
    update(patch);
    setSelectedRaw(ids);
    setTool('select');
  };

  return {
    doc, history, update, selected: live, one, tool, setTool, style, setStyle, editId, setEditId,
    select, clear: () => { setSelectedRaw([]); setEditId(null); }, selectAll: () => setSelectedRaw(doc.order),
    add, addShape, change, setStyleField, remove, duplicate, nudge, group, ungroup, align, distribute, reorder, editPoints, importText,
    setBackground: (bg) => update({ vectorDoc: { w: doc.w, h: doc.h, order: doc.order, bg } }),
    setSize: (w, h) => update({ vectorDoc: { w, h, order: doc.order, bg: doc.bg } }),
  };
}
