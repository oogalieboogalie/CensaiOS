/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Clip } from './Clip.jsx';
import { TrackHeader } from './TrackHeader.jsx';
import { useClipDrag } from './useClipDrag.js';
import { useTick } from './ticker.js';
import { snapTo } from '../../../lib/studio/edit.js';
import { snapBeats, projectEndBeats } from '../../../lib/studio/project.js';

// Arrangement view: a ruler (top strip sets the loop, the rest seeks) and
// one lane per track with its header pinned to the left.

const LANE_H = 64;
const HEAD_W = 188;

function Playhead({ ticker, zoom }) {
  const beat = useTick(ticker, s => s.beat);
  return <div className="hb-studio-playhead" style={{ transform: `translateX(${HEAD_W + beat * zoom}px)` }} aria-hidden="true" />;
}

function Ruler({ project, zoom, beats, onSeek, edit }) {
  const bar = project.beatsPerBar;
  const ticks = [];
  const every = zoom * bar < 36 ? 4 : zoom * bar < 70 ? 2 : 1;
  for (let b = 0; b <= beats; b += bar) {
    const n = b / bar;
    ticks.push(<span key={b} className="hb-studio-tick" data-bar={n % every === 0 ? 'true' : undefined} style={{ left: b * zoom }}>{n % every === 0 ? n + 1 : ''}</span>);
  }
  const beatAt = e => (e.clientX - e.currentTarget.getBoundingClientRect().left) / zoom;
  const onLoopDown = (e) => {
    e.preventDefault(); e.stopPropagation();
    const step = snapBeats(project.snap) || 0.25;
    const startBeat = snapTo(beatAt(e), Math.max(step, 1));
    const el = e.currentTarget;
    const move = (ev) => {
      const b = snapTo((ev.clientX - el.getBoundingClientRect().left) / zoom, Math.max(step, 1));
      if (Math.abs(b - startBeat) >= 1) edit('set', { loop: { on: true, start: Math.min(b, startBeat), end: Math.max(b, startBeat) } });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  return (
    <div className="hb-studio-ruler" style={{ width: beats * zoom }}>
      <div className="hb-studio-loopstrip" onPointerDown={onLoopDown} title="Drag to set the loop" data-no-drag>
        <div className="hb-studio-loop" data-on={project.loop.on ? 'true' : undefined}
          style={{ left: project.loop.start * zoom, width: (project.loop.end - project.loop.start) * zoom }} />
      </div>
      <div className="hb-studio-seekstrip" onPointerDown={(e) => { e.stopPropagation(); onSeek(Math.max(0, snapTo(beatAt(e), snapBeats(project.snap)))); }} title="Click to move the playhead" data-no-drag>
        {ticks}
      </div>
    </div>
  );
}

export function Timeline({ studio, audio, zoom, selection, setSelection, onOpenClip, onDropFiles }) {
  const { project, edit } = studio;
  const spb = 60 / project.bpm;
  const beats = Math.max(64, Math.ceil((projectEndBeats(project) + 16) / project.beatsPerBar) * project.beatsPerBar);
  const startDrag = useClipDrag({ project, edit, zoom, setSelection });
  const missing = new Set(audio.missing);
  const step = snapBeats(project.snap);
  const grid = Math.max(zoom, zoom * project.beatsPerBar >= 24 ? zoom : zoom * project.beatsPerBar);

  const onLaneDouble = (e, track) => {
    if (track.kind !== 'synth') return;
    const beat = snapTo((e.clientX - e.currentTarget.getBoundingClientRect().left) / zoom, Math.max(step, project.beatsPerBar));
    edit('addClip', track.id, { start: beat, len: project.beatsPerBar, notes: [] });
  };
  const onDrop = (e, track) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    e.preventDefault(); e.stopPropagation();
    const beat = snapTo((e.clientX - e.currentTarget.getBoundingClientRect().left) / zoom, step);
    onDropFiles(files, track?.kind === 'audio' ? track.id : null, beat);
  };

  return (
    <div className="hb-studio-arrange" data-testid="studio-timeline" style={{ '--studio-grid': `${grid}px`, '--studio-head': `${HEAD_W}px` }}
      onDragOver={e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); }}
      onDrop={e => onDrop(e, null)}>
      <div className="hb-studio-rulerrow">
        <div className="hb-studio-corner">{project.tracks.length} tracks</div>
        <Ruler project={project} zoom={zoom} beats={beats} onSeek={audio.transport.seek} edit={edit} />
      </div>
      {project.tracks.map(track => (
        <div key={track.id} className="hb-studio-row" data-color={track.color} data-selected={selection.trackId === track.id ? 'true' : undefined}>
          <TrackHeader track={track} studio={studio} ticker={audio.ticker} selected={selection.trackId === track.id}
            onSelect={() => setSelection({ trackId: track.id, clipId: null })} />
          <div className="hb-studio-lane" data-studio-lane={track.id} style={{ width: beats * zoom, height: LANE_H }}
            onPointerDown={(e) => { if (e.target === e.currentTarget) setSelection({ trackId: track.id, clipId: null }); }}
            onDoubleClick={e => { if (e.target === e.currentTarget) onLaneDouble(e, track); }}
            onDrop={e => onDrop(e, track)}>
            {track.clips.map(clip => (
              <Clip key={clip.id} clip={clip} track={track} asset={project.assets[clip.asset]} zoom={zoom} spb={spb} height={LANE_H - 6}
                selected={selection.clipId === clip.id} missing={clip.kind === 'audio' && missing.has(clip.asset)}
                onPointerDown={(e, mode) => startDrag(e, track, clip, mode)}
                onOpen={() => onOpenClip(track, clip)} />
            ))}
          </div>
        </div>
      ))}
      <div className="hb-studio-addrow">
        <button type="button" className="hb-studio-chip" onClick={() => edit('addTrack', 'synth')}>Add synth track</button>
        <button type="button" className="hb-studio-chip" onClick={() => edit('addTrack', 'audio')}>Add audio track</button>
        <span className="hb-studio-hint">Drop audio files anywhere. Double-click a synth lane for a new clip.</span>
      </div>
      <Playhead ticker={audio.ticker} zoom={zoom} />
    </div>
  );
}
