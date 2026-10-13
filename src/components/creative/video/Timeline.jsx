/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { TRACKS, clipEnd, formatTime, snap, trimClip } from '../../../lib/creative/videoModel.js';

const LABEL_W = 72;

function Waveform({ peaks }) {
  if (!peaks?.length) return null;
  const top = Math.max(0.01, ...peaks); // quiet files still fill the clip
  const d = peaks.map((p, i) => `M${i} ${50 - (p / top) * 45}V${50 + (p / top) * 45}`).join('');
  return <svg className="hb-cr-wave" viewBox={`0 0 ${peaks.length} 100`} preserveAspectRatio="none" aria-hidden="true"><path d={d} /></svg>;
}

function ClipBox({ id, clip, pps, selected, missing, onDown }) {
  const m = clip.media;
  const label = clip.track === 't' ? clip.text || 'Title' : m?.name || 'Clip';
  const style = { left: clip.start * pps, width: Math.max(4, clip.dur * pps) };
  if (m?.thumb) style.backgroundImage = `url(${m.thumb})`;
  else if (m?.kind === 'image') style.backgroundImage = `url(${m.src})`;
  return (
    <div className="hb-cr-clip" data-track={clip.track} data-selected={selected ? 'true' : undefined} data-missing={missing ? 'true' : undefined}
      style={style} role="button" tabIndex={0} aria-label={`${label}, ${formatTime(clip.start)} to ${formatTime(clipEnd(clip))}`}
      aria-pressed={selected} data-clip={id} data-no-drag onPointerDown={(e) => onDown(e, id, 'move')}>
      <span className="hb-cr-trim" data-edge="in" onPointerDown={(e) => onDown(e, id, 'in')} />
      {clip.track === 'a' && <Waveform peaks={m?.peaks} />}
      <span className="hb-cr-clip-label">{label}</span>
      <span className="hb-cr-trim" data-edge="out" onPointerDown={(e) => onDown(e, id, 'out')} />
    </div>
  );
}

/** Ruler, playhead and the three tracks. Drag clips to move, edges to trim. */
export function Timeline({ doc, time, total, pps, selectedId, missing, onSelect, onSeek, onChange }) {
  const lanesRef = React.useRef(null);
  const drag = React.useRef(null);
  const [preview, setPreview] = React.useState(null); // { id, clip }
  const span = Math.max(total + 5, 20);
  const width = span * pps;

  const timeAt = (e) => {
    const r = lanesRef.current.getBoundingClientRect();
    const k = lanesRef.current.offsetWidth / r.width || 1; // the canvas may be zoomed
    return Math.max(0, ((e.clientX - r.left) * k + lanesRef.current.scrollLeft - LABEL_W) / pps);
  };
  const edges = (skip) => [time, 0, ...doc.ids.filter((id) => id !== skip).flatMap((id) => [doc.clips[id].start, clipEnd(doc.clips[id])])];

  const onClipDown = (e, id, mode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onSelect(id);
    drag.current = { id, mode, t0: timeAt(e), orig: doc.clips[id], target: e.currentTarget };
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const t = timeAt(e);
    const tol = 8 / pps;
    let clip;
    if (d.mode === 'seek') { onSeek(t); return; }
    if (d.mode === 'move') {
      let start = Math.max(0, d.orig.start + (t - d.t0));
      const snappedStart = snap(start, edges(d.id), tol);
      const snappedEnd = snap(start + d.orig.dur, edges(d.id), tol);
      if (snappedStart !== start) start = snappedStart;
      else if (snappedEnd !== start + d.orig.dur) start = snappedEnd - d.orig.dur;
      clip = { ...d.orig, start: Math.max(0, start) };
    } else {
      clip = trimClip(d.orig, d.mode, snap(t, edges(d.id), tol));
    }
    setPreview({ id: d.id, clip });
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.mode !== 'seek' && preview) onChange(preview.id, preview.clip);
    setPreview(null);
  };
  const onRulerDown = (e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { mode: 'seek' };
    onSeek(timeAt(e));
  };

  const step = pps >= 80 ? 1 : pps >= 30 ? 2 : pps >= 12 ? 5 : 10;
  const ticks = [];
  for (let s = 0; s <= span; s += step) ticks.push(s);
  const clips = preview ? { ...doc.clips, [preview.id]: preview.clip } : doc.clips;

  return (
    <div className="hb-cr-timeline" ref={lanesRef} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} data-no-drag>
      <div className="hb-cr-tl-inner" style={{ width: width + LABEL_W }}>
        <div className="hb-cr-ruler" onPointerDown={onRulerDown} role="slider" aria-label="Playhead" aria-valuemin={0}
          aria-valuemax={Math.round(total * 10) / 10} aria-valuenow={Math.round(time * 10) / 10} aria-valuetext={formatTime(time)} tabIndex={0}>
          {ticks.map((s) => <span key={s} className="hb-cr-tick" style={{ left: LABEL_W + s * pps }}>{formatTime(s).replace(/\.0$/, '')}</span>)}
        </div>
        {TRACKS.map((tr) => (
          <div key={tr.id} className="hb-cr-lane" data-track={tr.id}>
            <span className="hb-cr-lane-label">{tr.label}</span>
            <div className="hb-cr-lane-body" onPointerDown={(e) => { if (e.target === e.currentTarget) { onSelect(null); onRulerDown(e); } }}>
              {doc.ids.filter((id) => clips[id].track === tr.id).map((id) => (
                <ClipBox key={id} id={id} clip={clips[id]} pps={pps} selected={id === selectedId}
                  missing={Boolean(clips[id].media?.id && missing.includes(clips[id].media.id))} onDown={onClipDown} />
              ))}
            </div>
          </div>
        ))}
        <div className="hb-cr-playhead" style={{ left: LABEL_W + time * pps }} aria-hidden="true" />
      </div>
    </div>
  );
}
