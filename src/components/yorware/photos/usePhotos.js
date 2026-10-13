// State and actions for one YorWare Photos window. Photos, ratings and
// develop settings sync one by one through the board; the view, filters,
// selection and a slider mid-drag stay local to you.
import React from 'react';
import {
  EMPTY_EDITS, MAX_PHOTOS, addPhotosPatch, editPatch, pasteEditsPatch, ratingPatch, readLibrary, removePhotosPatch, rotatePatch,
} from '../../../lib/yorware/photoLibModel.js';
import { DEFAULT_FILTER, visiblePhotos } from '../../../lib/yorware/photoFilter.js';
import { useUndo } from '../../creative/useUndo.js';

export const UNTITLED = 'Photos';
const importer = () => import('../../../lib/yorware/photoImport.js');

export function usePhotos(win, onUpdate, allWins) {
  const lib = React.useMemo(() => readLibrary(win), [win]);
  const history = useUndo(win, onUpdate);
  const { update } = history;
  const [view, setView] = React.useState('grid');
  const [current, setCurrent] = React.useState(null);
  const [selected, setSelected] = React.useState(() => new Set());
  const [filter, setFilterRaw] = React.useState(DEFAULT_FILTER);
  const [notice, setNotice] = React.useState(null);
  const [busy, setBusy] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [cropping, setCropping] = React.useState(false);
  const [copied, setCopied] = React.useState(null);

  const visible = React.useMemo(() => visiblePhotos(lib, filter), [lib, filter]);
  const currentId = lib.photos[current] ? current : visible[0] || null;
  const photo = currentId ? lib.photos[currentId] : null;
  const edits = currentId ? { ...lib.edits[currentId], ...(draft?.id === currentId ? draft.change : {}) } : EMPTY_EDITS;
  const selection = [...selected].filter((id) => lib.photos[id]);
  const targets = selection.length ? selection : currentId ? [currentId] : [];

  const addItems = async (jobs, label) => {
    const room = MAX_PHOTOS - lib.order.length;
    if (room <= 0) { setNotice(`This library is full (${MAX_PHOTOS} photos). Start another Photos window for more.`); return; }
    setNotice(null);
    const items = [];
    const errors = [];
    for (let i = 0; i < Math.min(jobs.length, room); i += 1) {
      setBusy(`${label} ${i + 1} of ${Math.min(jobs.length, room)}…`);
      try { items.push(await jobs[i]()); } catch (err) { errors.push(err?.message || String(err)); }
    }
    setBusy(null);
    const { ids, patch } = addPhotosPatch(lib, items);
    if (ids.length) {
      update(patch);
      setCurrent(ids[0]);
    }
    const more = jobs.length > room ? ` ${jobs.length - room} more did not fit (${MAX_PHOTOS} photos per library).` : '';
    if (errors.length || more) setNotice(`${errors.slice(0, 3).join(' ')}${errors.length > 3 ? ` And ${errors.length - 3} more could not be opened.` : ''}${more}`.trim());
  };
  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    const { photoFromFile } = await importer();
    await addItems(files.map((f) => () => photoFromFile(f)), 'Opening');
  };
  const addFromBoard = async () => {
    const { boardPictures, photoFromBoard, pictureKey } = await importer();
    const have = new Set(Object.values(lib.photos).map((p) => p.from).filter(Boolean));
    const pics = boardPictures(allWins, win.id).filter((p) => !have.has(pictureKey(p.src)));
    if (!pics.length) { setNotice('No pictures on this board yet. Image windows and generated images show up here.'); return; }
    await addItems(pics.map((p) => async () => ({ ...(await photoFromBoard(p)), meta: {} })), 'Bringing in');
  };

  const open = (id) => { setCurrent(id); setView('develop'); setDraft(null); setCropping(false); };
  const step = (delta) => {
    const i = visible.indexOf(currentId);
    const next = visible[i + delta];
    if (next) { setCurrent(next); setDraft(null); setCropping(false); }
  };
  const toggleSelect = (id, { range, add } = {}) => {
    setSelected((prev) => {
      if (range && current && visible.includes(current)) {
        const [a, b] = [visible.indexOf(current), visible.indexOf(id)].sort((x, y) => x - y);
        return new Set([...prev, ...visible.slice(a, b + 1)]);
      }
      const next = new Set(add ? prev : []);
      if (add && prev.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    if (!range) setCurrent(id);
  };
  const clearSelection = () => setSelected(new Set());
  const selectAll = () => setSelected(new Set(visible));

  const rateMany = (ids, change) => {
    const patch = {};
    for (const id of ids) Object.assign(patch, ratingPatch(lib, id, typeof change === 'function' ? change(lib.ratings[id]) : change));
    update(patch);
  };
  const setStars = (n, ids = targets) => rateMany(ids, { stars: n });
  const setFlag = (flag, ids = targets) => rateMany(ids, (r) => ({ flag: r.flag === flag && ids.length === 1 ? null : flag }));
  const addTag = (tag, ids = targets) => rateMany(ids, (r) => ({ tags: [...r.tags, tag] }));
  const removeTag = (tag, ids = targets) => rateMany(ids, (r) => ({ tags: r.tags.filter((t) => t !== tag) }));
  const remove = (ids = targets) => {
    if (!ids.length) return;
    const i = visible.indexOf(ids[0]);
    update(removePhotosPatch(lib, ids));
    setSelected(new Set());
    setCurrent(visible.filter((id) => !ids.includes(id))[Math.max(0, i - 1)] || null);
    if (lib.order.length <= ids.length) setView('grid');
  };

  const preview = (change) => setDraft({ id: currentId, change: { ...(draft?.id === currentId ? draft.change : {}), ...change } });
  const commitEdit = (change, id = currentId) => { if (id) update(editPatch(lib, id, change)); setDraft(null); };
  const resetEdits = (id = currentId) => commitEdit({ ...EMPTY_EDITS }, id);
  const rotate = (dir) => currentId && update(rotatePatch(lib, currentId, dir));
  const flip = () => {
    const c = edits.crop;
    commitEdit({ flip: !edits.flip, crop: c ? { ...c, x: 1 - c.x - c.w } : null });
  };
  const copyEdits = () => currentId && setCopied(currentId);
  const pasteEdits = (ids = targets) => { if (copied) update(pasteEditsPatch(lib, copied, ids)); };
  const setFilter = (change) => setFilterRaw((f) => ({ ...f, ...change }));

  return {
    lib, history, update, view, setView, visible, currentId, photo, edits, selected, selection, targets,
    filter, setFilter, notice, setNotice, busy, cropping, setCropping, copied,
    addFiles, addFromBoard, open, step, toggleSelect, clearSelection, selectAll,
    setStars, setFlag, addTag, removeTag, remove, preview, commitEdit, resetEdits, rotate, flip, copyEdits, pasteEdits,
  };
}
