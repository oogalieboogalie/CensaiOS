// State and actions for one YorWare Layout window. Pages, frames, stories and
// pictures sync one by one through the board; the page you're on, the tool
// and the selection stay local to you.
import React from 'react';
import {
  MASTER, addFramePatch, addImagePatch, addPagePatch, clampFrame, duplicateFramesPatch, framePatch, linkFramePatch,
  movePagePatch, pageSizePatch, readLayout, removeFramesPatch, removePagePatch, restackPatch, setPagePatch, storyPatch,
  unlinkFramePatch,
} from '../../../lib/yorware/layoutModel.js';
import { flowDocument } from '../../../lib/yorware/layoutPlan.js';
import { templatePatch } from '../../../lib/yorware/layoutTemplates.js';
import { readPicture } from '../../../lib/yorware/layoutPictures.js';
import { useUndo } from '../../creative/useUndo.js';

export const UNTITLED = 'Untitled layout';
const TEMPLATE_TITLES = { flyer: 'Flyer', listing: 'Listing sheet', menu: 'Menu', newsletter: 'Newsletter' };

export function useLayout(win, onUpdate) {
  const doc = React.useMemo(() => readLayout(win), [win]);
  const flow = React.useMemo(() => flowDocument(doc), [doc]);
  const history = useUndo(win, onUpdate);
  const { update } = history;
  const [current, setCurrent] = React.useState(null);
  const [selectedRaw, setSelected] = React.useState([]);
  const [tool, setTool] = React.useState('select');
  const [linkFrom, setLinkFrom] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const pageId = current === MASTER || doc.pages[current] ? current : doc.order[0] || null;
  const pageIndex = pageId && pageId !== MASTER ? doc.order.indexOf(pageId) : -1;
  const selected = selectedRaw.filter((id) => doc.frames[id] && doc.frames[id].page === pageId);
  const one = selected.length === 1 ? doc.frames[selected[0]] : null;
  const story = one?.type === 'text' ? doc.stories[one.story] : null;

  const goTo = (id) => { setCurrent(id); setSelected([]); setLinkFrom(null); };
  const step = (delta) => { const next = doc.order[pageIndex + delta]; if (next) goTo(next); };

  const applyTemplate = (id) => {
    const patch = templatePatch(id);
    const title = !win.title || win.title === UNTITLED ? TEMPLATE_TITLES[id] : null;
    update(title ? { ...patch, title } : patch);
    setCurrent(null);
    setSelected([]);
  };
  const addPage = () => { const r = addPagePatch(doc, pageId === MASTER ? null : pageId); update(r.patch); goTo(r.id); return r.id; };
  const removePage = () => {
    if (!pageId || pageId === MASTER) return;
    update(removePagePatch(doc, pageId));
    goTo(doc.order[pageIndex + 1] || doc.order[pageIndex - 1] || null);
  };
  const movePage = (to) => { if (pageId && pageId !== MASTER) update(movePagePatch(doc, pageId, to)); };
  const setSize = (size) => update(pageSizePatch(doc, size));
  const toggleMaster = () => { if (pageId && pageId !== MASTER) update(setPagePatch(doc, pageId, { noMaster: !doc.pages[pageId].noMaster })); };

  const addFrame = (fields, storyFields) => {
    if (!pageId) return null;
    const { id, patch } = addFramePatch(doc, clampFrame({ ...fields, page: pageId }, doc), storyFields);
    update(patch);
    setSelected([id]);
    setTool('select');
    return id;
  };
  /** Write changed frames: { id: frame }. */
  const changeFrames = (changes, opts) => {
    let patch = {};
    for (const [id, f] of Object.entries(changes)) patch = { ...patch, ...framePatch(id, f.type === 'line' ? f : clampFrame(f, doc)) };
    update(patch, opts);
  };
  const setField = (key, value) => changeFrames(Object.fromEntries(selected.map((id) => [id, { ...doc.frames[id], [key]: value }])));
  const setStory = (fields) => { if (one?.story) update(storyPatch(doc, one.story, fields)); };
  const remove = () => { if (selected.length) { update(removeFramesPatch(doc, selected)); setSelected([]); } };
  const duplicate = () => { if (!selected.length) return; const r = duplicateFramesPatch(doc, selected); update(r.patch); setSelected(r.ids); };
  const restack = (front) => { if (selected.length) update(restackPatch(doc, selected, front)); };
  const nudge = (dx, dy) => selected.length && changeFrames(Object.fromEntries(selected.map((id) => {
    const f = doc.frames[id];
    return [id, { ...f, x: f.x + dx, y: f.y + dy }];
  })));

  /** Carry the selected text frame's story on to a new frame on the next page. */
  const continueOnNextPage = () => {
    if (!one || one.type !== 'text' || pageId === MASTER) return;
    let working = doc;
    let patch = {};
    let next = doc.order[pageIndex + 1];
    if (!next) {
      const r = addPagePatch(doc, pageId);
      next = r.id;
      patch = r.patch;
      working = readLayout({ ...win, ...patch });
    }
    const { story: sid, z: _z, ...box } = one;
    const added = addFramePatch(working, { ...box, page: next, story: sid, fill: 'none', stroke: 'none' });
    update({ ...patch, ...added.patch });
    goTo(next);
    setSelected([added.id]);
  };
  const startLink = () => { if (one?.type === 'text') { setLinkFrom(one.story); setTool('link'); } };
  const linkTo = (frameId) => {
    if (!linkFrom) return;
    const patch = linkFramePatch(doc, linkFrom, frameId);
    if (Object.keys(patch).length) update(patch);
    else setNotice('Pick a different text frame. That one is already part of this story.');
    setLinkFrom(null);
    setTool('select');
    setSelected([frameId]);
  };
  const unlink = () => { if (one) update(unlinkFramePatch(doc, selected[0])); };

  /** Put a picture from the computer into a frame, or into a new frame at a point on the page. */
  const addPicture = async (file, { frameId, at } = {}) => {
    if (!file || !pageId) return;
    setBusy(true);
    setNotice(null);
    try {
      const pic = await readPicture(file);
      const { id: img, patch } = addImagePatch(pic);
      const target = frameId && doc.frames[frameId]?.type === 'image' ? frameId : null;
      if (target) {
        update({ ...patch, ...framePatch(target, { ...doc.frames[target], img, fit: doc.frames[target].fit || 'fill' }) });
        setSelected([target]);
      } else {
        const w = Math.min(doc.w * 0.5, pic.w);
        const h = (w * pic.h) / pic.w;
        const c = at || { x: doc.w / 2, y: doc.h / 2 };
        const r = addFramePatch(doc, clampFrame({ type: 'image', page: pageId, img, fit: 'fill', x: c.x - w / 2, y: c.y - h / 2, w, h }, doc));
        update({ ...patch, ...r.patch });
        setSelected([r.id]);
      }
      setTool('select');
    } catch (err) {
      setNotice(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return {
    doc, flow, history, update, pageId, pageIndex, selected, one, story, tool, setTool, linkFrom, setLinkFrom, notice, setNotice, busy,
    select: (ids, add = false) => setSelected((cur) => (add ? [...new Set([...cur, ...ids])] : ids)), goTo, step,
    applyTemplate, addPage, removePage, movePage, setSize, toggleMaster,
    addFrame, changeFrames, setField, setStory, remove, duplicate, restack, nudge,
    continueOnNextPage, startLink, linkTo, unlink, addPicture,
  };
}
