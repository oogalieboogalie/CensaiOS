/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { snapTo } from '../../../lib/studio/edit.js';
import { snapBeats } from '../../../lib/studio/project.js';
import { inScale, nearestInScale, fitToScale, quantizeNotes, keyLabel } from '../../../lib/studio/musicKey.js';

// Piano roll for one MIDI clip. Click to add a note, drag to move it (time
// and pitch), drag its right edge to lengthen, double-click to delete. Rows
// outside the song's key are shaded; with Key lock on, notes stay in the key.

const ROW = 12;
const TOP = 96; const BOTTOM = 24;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const black = p => [1, 3, 6, 8, 10].includes(p % 12);
export const noteName = p => `${NAMES[p % 12]}${Math.floor(p / 12) - 1}`;

export function PianoRoll({ studio, track, clip, onClose }) {
  const { project, edit } = studio;
  const scrollRef = React.useRef(null);
  const [lastLen, setLastLen] = React.useState(null);
  const [selected, setSelected] = React.useState(-1);
  const step = snapBeats(project.snap) || 0.25;
  const fit = p => Math.max(BOTTOM, Math.min(TOP, project.scaleLock ? nearestInScale(p, project.key, project.scale) : p));
  const [width, setWidth] = React.useState(600);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setWidth(Math.max(320, el.clientWidth - 56)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The clip fills the panel's width, but a beat never gets narrower than 16 px.
  const zoom = Math.max(16, width / clip.len);

  React.useEffect(() => {
    // Open centred on the clip's notes, or around middle C.
    const ps = clip.notes.map(n => n.p);
    const mid = ps.length ? (Math.min(...ps) + Math.max(...ps)) / 2 : 60;
    if (scrollRef.current) scrollRef.current.scrollTop = (TOP - mid) * ROW - scrollRef.current.clientHeight / 2;
  }, [clip.id]);

  const setNotes = notes => edit('notes', track.id, clip.id, notes);
  const pos = (e, el) => {
    const r = el.getBoundingClientRect();
    return { beat: (e.clientX - r.left) / zoom, pitch: TOP - Math.floor((e.clientY - r.top) / ROW) };
  };

  const drag = (e, index, mode) => {
    e.preventDefault(); e.stopPropagation();
    setSelected(index);
    const grid = e.currentTarget.closest('.hb-studio-pr-grid');
    const start = pos(e, grid);
    const orig = clip.notes[index];
    const move = (ev) => {
      const p = pos(ev, grid);
      const notes = clip.notes.slice();
      if (mode === 'move') {
        notes[index] = { ...orig, t: Math.max(0, Math.min(clip.len - step, snapTo(orig.t + p.beat - start.beat, ev.altKey ? 0 : step))), p: fit(Math.max(BOTTOM, Math.min(TOP, orig.p + p.pitch - start.pitch))) };
      } else {
        const d = Math.max(step / 2, snapTo(orig.t + orig.d + p.beat - start.beat, ev.altKey ? 0 : step) - orig.t);
        notes[index] = { ...orig, d };
        setLastLen(d);
      }
      setNotes(notes);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const onGridDown = (e) => {
    if (e.target !== e.currentTarget || e.button !== 0) return;
    const p = pos(e, e.currentTarget);
    const t = Math.max(0, Math.floor(p.beat / step) * step);
    if (t >= clip.len) return;
    const note = { p: fit(p.pitch), t, d: Math.min(lastLen || step, clip.len - t), v: 0.8 };
    const notes = [...clip.notes, note];
    setNotes(notes);
    setSelected(notes.length - 1);
  };

  const rows = [];
  for (let p = TOP; p >= BOTTOM; p--) rows.push(p);
  return (
    <div className="hb-studio-pr" data-no-drag data-testid="studio-piano-roll"
      onKeyDown={(e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && selected >= 0) { e.stopPropagation(); setNotes(clip.notes.filter((_, i) => i !== selected)); setSelected(-1); } }} tabIndex={-1}>
      <div className="hb-studio-pr-bar">
        <span className="hb-studio-panel-title">{track.name}</span>
        <span className="hb-studio-hint">{clip.notes.length} notes · {clip.len} beats · click to add, drag to move, double-click to delete</span>
        <button type="button" className="hb-studio-chip" onClick={() => setNotes(quantizeNotes(clip.notes, step, clip.len))}
          title={`Move every note onto the ${project.snap === 'off' ? '1/16' : project.snap} grid`} data-testid="studio-pr-quantize">Quantize</button>
        <button type="button" className="hb-studio-chip" onClick={() => setNotes(fitToScale(clip.notes, project.key, project.scale))}
          title={`Move notes outside ${keyLabel(project.key, project.scale)} to the nearest note in it`} data-testid="studio-pr-fit">Fit to {keyLabel(project.key, project.scale)}</button>
        <button type="button" className="hb-studio-link" onClick={onClose}>Close</button>
      </div>
      <div className="hb-studio-pr-scroll" ref={scrollRef}>
        <div className="hb-studio-pr-keys" aria-hidden="true">
          {rows.map(p => <div key={p} className="hb-studio-pr-key" data-black={black(p) ? 'true' : undefined}>{p % 12 === 0 ? noteName(p) : ''}</div>)}
        </div>
        <div className="hb-studio-pr-grid" style={{ width: clip.len * zoom, height: rows.length * ROW, '--pr-beat': `${zoom}px`, '--pr-step': `${zoom * step}px`, '--pr-bar': `${zoom * project.beatsPerBar}px` }}
          onPointerDown={onGridDown}>
          {rows.map((p, i) => !inScale(p, project.key, project.scale) && <div key={p} className="hb-studio-pr-lane" style={{ top: i * ROW }} />)}
          {clip.notes.map((n, i) => (
            <div key={i} className="hb-studio-pr-note" data-selected={i === selected ? 'true' : undefined}
              style={{ left: n.t * zoom, top: (TOP - n.p) * ROW, width: Math.max(4, n.d * zoom - 1), opacity: 0.55 + n.v * 0.45 }}
              title={`${noteName(n.p)} · velocity ${Math.round(n.v * 127)}`}
              onPointerDown={e => drag(e, i, 'move')}
              onDoubleClick={(e) => { e.stopPropagation(); setNotes(clip.notes.filter((_, k) => k !== i)); setSelected(-1); }}>
              <span className="hb-studio-pr-edge" onPointerDown={e => drag(e, i, 'size')} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
