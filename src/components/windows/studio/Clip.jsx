/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

// One clip on the timeline: a waveform for audio, a note sketch for MIDI.

function Waveform({ peaks, from, to, width, height }) {
  if (!peaks?.length || width < 4) return null;
  const n = peaks.length;
  const a = Math.max(0, Math.floor(from * n)); const b = Math.min(n, Math.ceil(to * n));
  const span = Math.max(1, b - a);
  const mid = height / 2;
  let d = '';
  for (let i = a; i < b; i++) {
    const x = ((i - a) / span) * width;
    const h = Math.max(0.5, (peaks[i] / 99) * (height / 2 - 2));
    d += `M${x.toFixed(1)} ${(mid - h).toFixed(1)}V${(mid + h).toFixed(1)}`;
  }
  return <svg className="hb-studio-wave" width={width} height={height} aria-hidden="true"><path d={d} /></svg>;
}

function NoteSketch({ clip, width, height }) {
  if (!clip.notes.length) return null;
  const ps = clip.notes.map(n => n.p);
  const lo = Math.min(...ps) - 1; const hi = Math.max(...ps) + 1;
  const row = height / Math.max(6, hi - lo + 1);
  return (
    <svg className="hb-studio-notes" width={width} height={height} aria-hidden="true">
      {clip.notes.map((n, i) => (
        <rect key={i} x={(n.t / clip.len) * width} y={(hi - n.p) * row} width={Math.max(1.5, (n.d / clip.len) * width - 1)} height={Math.max(1.5, row - 1)} rx={0.5} />
      ))}
    </svg>
  );
}

export function Clip({ clip, track, asset, zoom, spb, selected, missing, onPointerDown, onOpen, height }) {
  const beats = clip.kind === 'midi' ? clip.len : clip.dur / spb;
  const width = Math.max(4, beats * zoom);
  const assetDur = asset?.dur || clip.offset + clip.dur;
  const name = clip.name || (clip.kind === 'midi' ? track.name : asset?.name || 'Audio');
  return (
    <div className="hb-studio-clip" data-kind={clip.kind} data-selected={selected ? 'true' : undefined} data-missing={missing ? 'true' : undefined}
      data-testid="studio-clip" data-no-drag
      style={{ left: clip.start * zoom, width }}
      onPointerDown={e => onPointerDown(e, 'move')}
      onDoubleClick={(e) => { e.stopPropagation(); onOpen?.(); }}
      title={missing ? `${name}: the audio for this clip is on ${asset?.by || 'another'} computer` : name}>
      <span className="hb-studio-clip-name">{name}</span>
      {clip.kind === 'audio'
        ? <Waveform peaks={asset?.peaks} from={clip.offset / assetDur} to={(clip.offset + clip.dur) / assetDur} width={width} height={height - 18} />
        : <NoteSketch clip={clip} width={width} height={height - 18} />}
      {clip.kind === 'audio' && <span className="hb-studio-clip-edge" data-side="left" onPointerDown={e => onPointerDown(e, 'trimStart')} />}
      <span className="hb-studio-clip-edge" data-side="right" onPointerDown={e => onPointerDown(e, 'trimEnd')} />
    </div>
  );
}
