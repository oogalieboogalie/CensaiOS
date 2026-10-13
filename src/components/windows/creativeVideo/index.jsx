/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { OfficeBar, OfficeButton, OfficeSep } from '../../office/OfficeBar.jsx';
import { ToolIcon } from '../../creative/toolIcons.jsx';
import { typingIn } from '../../creative/useUndo.js';
import { useFitScale } from '../../creative/useFitScale.js';
import { useVideo } from '../../creative/video/useVideo.js';
import { recordMime, useVideoEngine } from '../../creative/video/useVideoEngine.js';
import { Timeline } from '../../creative/video/Timeline.jsx';
import { ClipInspector } from '../../creative/video/ClipInspector.jsx';
import { duration, formatTime } from '../../../lib/creative/videoModel.js';

const ACCEPT = 'video/*,audio/*,image/png,image/jpeg,image/webp,image/gif';

function pickFiles(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.addEventListener('change', () => resolve([...(input.files || [])]), { once: true });
    input.click();
  });
}

// Censai Video: a simple video editor on the canvas. Clips, pictures and
// titles on a timeline with an audio track; trim, split, and export the edit
// as MP4 (where the browser can record it) or WebM, plus still frames.
export function CreativeVideoWindow({ win = {}, onUpdate }) {
  const ed = useVideo(win, onUpdate);
  const { doc, history, clip } = ed;
  const canvasRef = React.useRef(null);
  const stageRef = React.useRef(null);
  const engine = useVideoEngine(doc, canvasRef);
  const [notice, setNotice] = React.useState(null);
  const [progress, setProgress] = React.useState(null);
  const scale = useFitScale(stageRef, doc.w, doc.h, 24);
  const total = duration(doc);
  const title = win.title || 'Untitled video';

  const record = (ext) => async () => {
    setProgress(0);
    try { return await engine.record(ext, setProgress); } finally { setProgress(null); }
  };
  const formats = [
    ...['mp4', 'webm'].filter((ext) => recordMime(ext)).map((ext) => ({
      ext, label: ext === 'mp4' ? 'MP4 video' : 'WebM video', hint: 'Plays the edit through once while it records', build: record(ext),
    })),
    { ext: 'png', label: 'Still frame', hint: 'The frame under the playhead', build: () => new Promise((res, rej) => canvasRef.current.toBlob((b) => (b ? res(b) : rej(new Error('No frame'))), 'image/png')) },
  ];
  const importFiles = async (files) => {
    try { setNotice(null); await ed.importFiles(files); } catch (err) { setNotice(err?.message || String(err)); }
  };
  const split = () => { if (!ed.split(engine.time)) setNotice('Put the playhead over a clip to cut it there.'); };

  const onKeyDown = (e) => {
    if (typingIn(e)) return;
    if (history.onKey(e)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.key === ' ') { e.preventDefault(); engine.toggle(); } else if (k === 's') split();
    else if (k === 't') ed.addTitle(engine.time);
    else if ((e.key === 'Delete' || e.key === 'Backspace') && clip) { e.preventDefault(); ed.remove(); } else if (e.key === 'ArrowLeft') engine.seek(engine.time - (e.shiftKey ? 1 : 1 / doc.fps));
    else if (e.key === 'ArrowRight') engine.seek(engine.time + (e.shiftKey ? 1 : 1 / doc.fps));
    else if (e.key === 'Home') engine.seek(0);
    else return;
    e.stopPropagation();
  };
  const onDrop = (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => /^(video|audio|image)\//.test(f.type));
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    importFiles(files);
  };

  return (
    <>
      <WindowTitle icon={<Icon.Video size={12} />} label={title} subtitle={`Censai Video · ${formatTime(total)}`} />
      <div className="hb-of hb-cr" data-app="video" tabIndex={-1} onKeyDown={onKeyDown} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <OfficeBar title={title} formats={formats} importHint="Add video, audio or pictures to the timeline"
          onImport={async () => { const files = await pickFiles(ACCEPT); if (files.length) await importFiles(files); }}>
          <OfficeButton label="Undo" title="Undo (Ctrl+Z)" icon={<ToolIcon.Undo />} disabled={!history.canUndo} onClick={history.undo} />
          <OfficeButton label="Redo" title="Redo (Ctrl+Shift+Z)" icon={<ToolIcon.Redo />} disabled={!history.canRedo} onClick={history.redo} />
          <OfficeSep />
          <OfficeButton wide label={engine.playing ? 'Pause' : 'Play'} title="Play or pause (Space)" icon={engine.playing ? <Icon.Stop size={11} /> : <Icon.Play size={11} />} disabled={total <= 0} onClick={engine.toggle} />
          <span className="hb-cr-time" aria-live="off">{formatTime(engine.time)} / {formatTime(total)}</span>
          <OfficeSep />
          <OfficeButton wide label="Split" title="Cut the clip at the playhead (S)" icon={<ToolIcon.Scissors />} disabled={total <= 0} onClick={split} />
          <OfficeButton wide label="Title" title="Add a title at the playhead (T)" icon={<ToolIcon.Title />} onClick={() => ed.addTitle(engine.time)} />
          <OfficeButton label="Delete clip" title="Delete the selected clip (Delete)" icon={<Icon.Close size={10} />} disabled={!clip} onClick={() => ed.remove()} />
          <OfficeSep />
          <OfficeButton label="Zoom out" title="Zoom the timeline out" disabled={ed.pps <= 6} onClick={() => ed.setPps(Math.max(6, ed.pps / 1.5))}><span>-</span></OfficeButton>
          <OfficeButton label="Zoom in" title="Zoom the timeline in" disabled={ed.pps >= 240} onClick={() => ed.setPps(Math.min(240, ed.pps * 1.5))}><span>+</span></OfficeButton>
        </OfficeBar>
        {(notice || progress !== null || engine.missing.length > 0) && (
          <div role="status" className="hb-of-alert">
            <span>{progress !== null ? `Recording ${Math.round(progress * 100)}%. Keep this window open.` : notice || `${engine.missing.length} ${engine.missing.length === 1 ? 'file is' : 'files are'} on the computer that added ${engine.missing.length === 1 ? 'it' : 'them'}. Titles and pictures still show here.`}</span>
            {notice && <button type="button" className="hb-of-btn" aria-label="Dismiss" onClick={() => setNotice(null)}><Icon.Close size={10} /></button>}
          </div>
        )}
        <div className="hb-cr-body">
          <div className="hb-cr-stage hb-cr-monitor" ref={stageRef}>
            <canvas ref={canvasRef} width={doc.w} height={doc.h} className="hb-cr-canvas" role="img" aria-label="Video preview"
              style={{ width: doc.w * scale, height: doc.h * scale }} onClick={engine.toggle} />
          </div>
          <ClipInspector clip={clip} missing={Boolean(clip?.media?.id && engine.missing.includes(clip.media.id))} onChange={(next) => ed.setClip(ed.selectedId, next)} />
        </div>
        <Timeline doc={doc} time={engine.time} total={total} pps={ed.pps} selectedId={ed.selectedId} missing={engine.missing}
          onSelect={ed.select} onSeek={engine.seek} onChange={ed.setClip} />
      </div>
    </>
  );
}

export default CreativeVideoWindow;
