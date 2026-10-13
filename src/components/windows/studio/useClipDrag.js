import React from 'react';
import { snapTo } from '../../../lib/studio/edit.js';
import { snapBeats } from '../../../lib/studio/project.js';

// Drag behaviour for clips: move (across tracks of the same kind), trim the
// start (audio only, slides the source offset) and trim the end. Every move
// is an edit; useStudio batches the saves.

export function useClipDrag({ project, edit, zoom, setSelection }) {
  return React.useCallback((e, track, clip, mode) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    setSelection({ trackId: track.id, clipId: clip.id });
    const spb = 60 / project.bpm;
    const step = e.altKey ? 0 : snapBeats(project.snap);
    const x0 = e.clientX;
    const orig = { ...clip };
    let trackId = track.id;
    const move = (ev) => {
      const dBeats = (ev.clientX - x0) / zoom;
      if (mode === 'move') {
        const start = snapTo(orig.start + dBeats, step);
        const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-studio-lane]')?.getAttribute('data-studio-lane');
        const dest = project.tracks.find(t => t.id === over);
        if (dest && dest.id !== trackId && dest.kind === track.kind) {
          edit('moveClipTo', trackId, clip.id, dest.id, start);
          trackId = dest.id;
          setSelection({ trackId, clipId: clip.id });
        } else {
          edit('clip', trackId, clip.id, { start });
        }
      } else if (mode === 'trimEnd') {
        if (orig.kind === 'midi') {
          const end = snapTo(orig.start + orig.len + dBeats, step);
          edit('clip', trackId, clip.id, { len: Math.max(step || 0.25, end - orig.start) });
        } else {
          const end = snapTo(orig.start + orig.dur / spb + dBeats, step);
          const asset = project.assets[orig.asset];
          const maxDur = asset?.dur ? asset.dur - orig.offset : Infinity;
          edit('clip', trackId, clip.id, { dur: Math.min(maxDur, Math.max(0.05, (end - orig.start) * spb)) });
        }
      } else if (mode === 'trimStart' && orig.kind === 'audio') {
        let start = snapTo(orig.start + dBeats, step);
        const endBeat = orig.start + orig.dur / spb;
        start = Math.min(start, endBeat - 0.05 / spb);
        let offset = orig.offset + (start - orig.start) * spb;
        if (offset < 0) { start -= offset / spb; offset = 0; }
        edit('clip', trackId, clip.id, { start, offset, dur: (endBeat - start) * spb });
      }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [project, edit, zoom, setSelection]);
}
