/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { ColorField } from '../ColorField.jsx';
import { Slider } from '../Slider.jsx';
import { TITLE_POSITIONS, clipEnd, formatTime } from '../../../lib/creative/videoModel.js';

const KIND = { video: 'Video clip', audio: 'Audio clip', image: 'Picture' };

/** Settings for the selected clip: title text and style, or volume. */
export function ClipInspector({ clip, missing, onChange }) {
  if (!clip) {
    return (
      <aside className="hb-cr-panel" aria-label="Clip settings">
        <section className="hb-cr-section">
          <header className="hb-cr-section-head"><span>Clip</span></header>
          <p className="hb-cr-hint">Import video, audio or pictures, add a title, then drag clips on the timeline. Drag a clip&apos;s edge to trim it; press S to cut at the playhead.</p>
        </section>
      </aside>
    );
  }
  const set = (change) => onChange({ ...clip, ...change });
  return (
    <aside className="hb-cr-panel" aria-label="Clip settings">
      <section className="hb-cr-section">
        <header className="hb-cr-section-head"><span>{clip.track === 't' ? 'Title' : KIND[clip.media?.kind] || 'Clip'}</span>
          <span className="hb-cr-num">{formatTime(clip.start)} to {formatTime(clipEnd(clip))}</span></header>
        {clip.media?.name && <p className="hb-cr-hint hb-cr-ellipsis">{clip.media.name}{clip.media.w ? ` · ${clip.media.w} × ${clip.media.h}` : ''}</p>}
        {missing && <p className="hb-cr-hint">This file is on the computer that added it, so it plays there. Your edits to it still sync.</p>}
        {clip.track === 't' && (
          <>
            <textarea className="hb-cr-input hb-cr-textarea" aria-label="Title text" value={clip.text} onChange={(e) => set({ text: e.target.value })} />
            <label className="hb-cr-field"><span>Place</span>
              <select className="hb-of-select" aria-label="Title position" value={clip.pos || 'center'} onChange={(e) => set({ pos: e.target.value })}>
                {Object.entries(TITLE_POSITIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <div className="hb-cr-field"><span>Color</span><ColorField label="Title color" value={clip.color} onChange={(c) => set({ color: c })} swatches={false} /></div>
            <Slider label="Size" min={16} max={200} unit="px" value={clip.size || 72} onChange={(n) => set({ size: n })} />
          </>
        )}
        {(clip.media?.kind === 'video' || clip.media?.kind === 'audio') && (
          <Slider label="Volume" min={0} max={100} unit="%" value={Math.round((clip.volume ?? 1) * 100)} onChange={(n) => set({ volume: n / 100 })} />
        )}
        <Slider label="Length" min={0.1} max={Math.max(60, Math.ceil(clip.dur))} step={0.1} unit="s" value={Math.round(clip.dur * 10) / 10}
          onChange={(n) => set({ dur: clip.media?.dur ? Math.min(n, clip.media.dur - (clip.in || 0)) : n })} />
      </section>
    </aside>
  );
}
