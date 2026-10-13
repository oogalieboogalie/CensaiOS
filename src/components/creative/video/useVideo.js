// State and actions for one Censai Video window. Clips sync one by one;
// the selection, playhead and timeline zoom stay local.
import React from 'react';
import { addClipPatch, clipKey, makeClip, readVideo, splitPatch, trackEnd } from '../../../lib/creative/videoModel.js';
import { readMediaFile } from '../../../lib/creative/videoMedia.js';
import { useUndo } from '../useUndo.js';

export function useVideo(win, onUpdate) {
  const doc = React.useMemo(() => readVideo(win), [win]);
  const history = useUndo(win, onUpdate);
  const { update } = history;
  const [selectedId, setSelectedId] = React.useState(null);
  const [pps, setPps] = React.useState(48); // timeline pixels per second
  const clip = selectedId ? doc.clips[selectedId] : null;

  const addClip = (fields) => {
    const { id, patch } = addClipPatch(makeClip(fields.track, { start: trackEnd(doc, fields.track), ...fields }));
    update(patch);
    setSelectedId(id);
    return id;
  };
  const importFiles = async (files) => {
    let end = { v: trackEnd(doc, 'v'), a: trackEnd(doc, 'a') };
    const patch = {};
    let last = null;
    for (const file of files) {
      const info = await readMediaFile(file);
      const made = addClipPatch(makeClip(info.track, { start: end[info.track], dur: info.dur, media: info.media }));
      end = { ...end, [info.track]: end[info.track] + info.dur };
      Object.assign(patch, made.patch);
      last = made.id;
    }
    if (last) { update(patch); setSelectedId(last); }
  };
  const setClip = (id, next) => doc.clips[id] && update({ [clipKey(id)]: next });
  const remove = (id = selectedId) => { if (id && doc.clips[id]) { update({ [clipKey(id)]: null }); setSelectedId(null); } };
  const split = (t) => {
    const id = selectedId && doc.clips[selectedId] && doc.clips[selectedId].start < t && t < doc.clips[selectedId].start + doc.clips[selectedId].dur
      ? selectedId
      : doc.ids.find((x) => doc.clips[x].track !== 't' && doc.clips[x].start < t && t < doc.clips[x].start + doc.clips[x].dur);
    const res = id && splitPatch(doc, id, t);
    if (!res) return false;
    update(res.patch);
    setSelectedId(res.id);
    return true;
  };
  const addTitle = (t) => addClip({ track: 't', start: t, dur: 3 });

  return { doc, history, clip, selectedId, select: setSelectedId, pps, setPps, addClip, importFiles, setClip, remove, split, addTitle };
}
