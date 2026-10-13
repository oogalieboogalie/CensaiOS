// State and actions for one YorWare 3D Viewer window. Models, how each one
// shows, the shared look and the notes pinned on models sync through the
// board; the camera, the tool you hold and a measurement stay yours.
import React from 'react';
import {
  MAX_MODELS, addModelsPatch, addNotePatch, editNotePatch, readScene, removeModelPatch, removeNotePatch, showPatch, viewPatch,
} from '../../../lib/yorware/modelBoard.js';
import { countObject } from '../../../lib/yorware/modelMeasure.js';
import { getSelf } from '../../../lib/modules/presenceRoster.js';
import { useUndo } from '../../creative/useUndo.js';

export const UNTITLED = '3D Viewer';
const loader = () => import('../../../lib/yorware/modelLoad.js');
const files = () => import('../../../lib/yorware/modelFiles.js');

export function useModels(win, onUpdate) {
  const scene = React.useMemo(() => readScene(win), [win]);
  const history = useUndo(win, onUpdate);
  const { update } = history;
  const [loaded, setLoaded] = React.useState({});
  const [tool, setToolRaw] = React.useState('orbit');
  const [measure, setMeasure] = React.useState([]);
  const [current, setCurrent] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [busy, setBusy] = React.useState(null);
  const [autoTurn, setAutoTurn] = React.useState(false);
  const [openNote, setOpenNote] = React.useState(null);
  const pending = React.useRef(new Set());

  // Load each model once; the file behind a model id never changes.
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useEffect(() => {
    for (const id of scene.order) {
      if (loaded[id] || pending.current.has(id)) continue;
      pending.current.add(id);
      const model = scene.models[id];
      loader().then(({ loadModel }) => loadModel(model))
        .then((object) => ({ object, stats: countObject(object), box: object.userData.box }), (err) => ({ error: err?.message || String(err) }))
        .then((result) => { pending.current.delete(id); if (mounted.current) setLoaded((m) => ({ ...m, [id]: result })); });
    }
  }, [scene, loaded]);

  const currentId = scene.models[current] ? current : scene.order[0] || null;

  const addItems = (items, extra = []) => {
    const { ids, patch, skipped, tooBig } = addModelsPatch(scene, items);
    if (ids.length) { update(patch); setCurrent(ids[0]); }
    const msgs = [...extra];
    if (tooBig.length) msgs.push(`${tooBig.join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} over 10 MB, too big to keep on the board.`);
    if (skipped > 0) msgs.push(`${skipped} more did not fit (${MAX_MODELS} models per viewer).`);
    setNotice(msgs.length ? msgs.join(' ') : null);
    return ids;
  };
  const addFiles = async (list) => {
    const { groupModelFiles, readModel } = await files();
    const { models, skipped } = groupModelFiles(list);
    if (!models.length) {
      setNotice(skipped.length ? `${skipped.join(', ')}: not a 3D model this viewer opens.` : null);
      return;
    }
    setBusy('Reading the model…');
    try {
      const items = [];
      for (const m of models) items.push(await readModel(m));
      addItems(items, skipped.length ? [`Skipped ${skipped.join(', ')}.`] : []);
    } catch (err) {
      setNotice(err?.message || String(err));
    } finally {
      setBusy(null);
    }
  };
  const addSamples = async () => {
    setBusy('Making the samples…');
    try { addItems(await (await import('../../../lib/yorware/modelSample.js')).sampleModels()); } catch (err) { setNotice(err?.message || String(err)); } finally { setBusy(null); }
  };

  const remove = (id = currentId) => {
    if (!id) return;
    update(removeModelPatch(scene, id));
    if (openNote && scene.notes[openNote]?.model === id) setOpenNote(null);
  };
  const setShow = (id, change) => update(showPatch(scene, id, change));
  const setView = (change) => update(viewPatch(scene, change));
  const setTool = (t) => { setToolRaw((now) => (now === t ? 'orbit' : t)); setMeasure([]); };

  const addNote = (hit) => {
    const { id, patch } = addNotePatch({ model: hit.id, p: hit.local, text: '', by: getSelf()?.label || '' });
    if (!id) return;
    update(patch);
    setOpenNote(id);
    setToolRaw('orbit');
  };
  const editNote = (id, text) => update(editNotePatch(scene, id, text));
  const removeNote = (id) => { update(removeNotePatch(id)); if (openNote === id) setOpenNote(null); };
  const addMeasurePoint = (hit) => setMeasure((m) => (m.length >= 2 ? [hit] : [...m, hit]));

  return {
    scene, history, loaded, tool, setTool, measure, setMeasure, currentId, setCurrent, notice, setNotice, busy,
    autoTurn, setAutoTurn, openNote, setOpenNote, addFiles, addSamples, remove, setShow, setView,
    addNote, editNote, removeNote, addMeasurePoint,
  };
}
