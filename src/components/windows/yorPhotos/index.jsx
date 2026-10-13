/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { OfficeBar, OfficeButton, OfficeSep } from '../../office/OfficeBar.jsx';
import { ToolIcon } from '../../creative/toolIcons.jsx';
import { typingIn } from '../../creative/useUndo.js';
import { PhotoIcon } from '../../yorware/photoIcons.jsx';
import { usePhotos, UNTITLED } from '../../yorware/photos/usePhotos.js';
import { PhotoGrid } from '../../yorware/photos/PhotoGrid.jsx';
import { PhotoCompare, PhotoDevelop } from '../../yorware/photos/PhotoDevelop.jsx';
import { PhotoPanel } from '../../yorware/photos/PhotoPanel.jsx';
import { fitAspect } from '../../yorware/photos/CropBox.jsx';
import { PHOTO_ACCEPT } from '../../../lib/yorware/photoImport.js';

const VIEWS = [['grid', 'Library', 'G', PhotoIcon.Grid], ['develop', 'Develop', 'D', PhotoIcon.Develop], ['compare', 'Compare', 'C', PhotoIcon.Compare]];
const exporter = () => import('../../../lib/yorware/photoRender.js');

function pickPhotos() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = PHOTO_ACCEPT;
    input.multiple = true;
    input.addEventListener('change', () => resolve(Array.from(input.files || [])), { once: true });
    input.click();
  });
}
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

// YorWare Photos: a photo library and basic raw developer on the board. Part
// of the YorWare Suite (docs/specs/13-yorware-suite.md).
export function YorPhotosWindow({ win = {}, onUpdate, allWins }) {
  const p = usePhotos(win, onUpdate, allWins);
  const { history, view, photo, edits } = p;
  const [dropping, setDropping] = React.useState(false);
  const [ratio, setRatioRaw] = React.useState('free');
  const [drawn, setDrawn] = React.useState(null);
  const count = p.lib.order.length;
  const tw = photo ? (edits.rot % 180 ? photo.h : photo.w) : 1;
  const th = photo ? (edits.rot % 180 ? photo.w : photo.h) : 1;
  const ratioNum = ratio === 'free' ? null : ratio === 'original' ? tw / th : Number(ratio);
  const setRatio = (v) => {
    setRatioRaw(v);
    const r = v === 'free' ? null : v === 'original' ? tw / th : Number(v);
    if (r) p.commitEdit({ crop: fitAspect(r, tw, th) });
  };
  const addFiles = async () => p.addFiles(await pickPhotos());
  const base = (photo?.name || UNTITLED).replace(/\.[a-z0-9]+$/i, '');

  const formats = [
    { ext: 'jpg', label: 'This photo as JPEG', hint: 'With your develop settings and crop', build: async () => {
      if (!photo) throw new Error('Add a photo first.');
      return (await exporter()).exportPhoto(photo, edits, 'image/jpeg');
    } },
    { ext: 'png', label: 'This photo as PNG', hint: 'Lossless, bigger file', build: async () => {
      if (!photo) throw new Error('Add a photo first.');
      return (await exporter()).exportPhoto(photo, edits, 'image/png');
    } },
  ];

  const go = (v) => { p.setCropping(false); p.setView(v); };
  const onKeyDown = (e) => {
    if (typingIn(e)) return;
    if (history.onKey(e)) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'a' && view === 'grid') { e.preventDefault(); p.selectAll(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || !photo) return;
    if (/^[0-5]$/.test(e.key)) { p.setStars(Number(e.key)); return; }
    if (k === 'p') { p.setFlag('pick'); return; }
    if (k === 'x') { p.setFlag('reject'); return; }
    if (k === 'r' && view === 'develop') { p.setCropping(!p.cropping); return; }
    const v = VIEWS.find((x) => x[2].toLowerCase() === k);
    if (v) { go(v[0]); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); p.step(1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); p.step(-1); return; }
    if (e.key === 'Enter' && view === 'grid') { p.open(p.currentId); return; }
    if (e.key === 'Escape') { if (p.cropping) p.setCropping(false); else if (view !== 'grid') go('grid'); else p.clearSelection(); }
  };

  return (
    <>
      <WindowTitle icon={<PhotoIcon.Photo size={12} />} label={win.title || UNTITLED} subtitle={count ? `YorWare Photos · ${count} photo${count === 1 ? '' : 's'}` : 'YorWare Photos'} />
      <div className="hb-of hb-cr hb-yph" data-app="photos" data-dropping={dropping ? 'true' : undefined} tabIndex={-1} onKeyDown={onKeyDown}
        onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setDropping(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropping(false); }}
        onDrop={(e) => { if (!hasFiles(e)) return; e.preventDefault(); setDropping(false); p.addFiles(e.dataTransfer.files); }}>
        <OfficeBar title={base} formats={formats} importHint="Add photos or camera raw files" onImport={addFiles}>
          {VIEWS.map(([id, label, key, Glyph]) => (
            <OfficeButton key={id} wide label={label} title={`${label} (${key})`} icon={<Glyph />} pressed={view === id} disabled={!count} onClick={() => go(id)} />
          ))}
          <OfficeSep />
          <OfficeButton label="Undo" title="Undo (Ctrl+Z)" icon={<ToolIcon.Undo />} disabled={!history.canUndo} onClick={history.undo} />
          <OfficeButton label="Redo" title="Redo (Ctrl+Shift+Z)" icon={<ToolIcon.Redo />} disabled={!history.canRedo} onClick={history.redo} />
          <OfficeSep />
          <OfficeButton label="Previous photo" title="Previous photo (Left arrow)" icon={<PhotoIcon.Prev />} disabled={!photo} onClick={() => p.step(-1)} />
          <OfficeButton label="Next photo" title="Next photo (Right arrow)" icon={<PhotoIcon.Next />} disabled={!photo} onClick={() => p.step(1)} />
          {view === 'develop' && <>
            <OfficeSep />
            <OfficeButton label="Crop" title="Crop (R)" icon={<PhotoIcon.Crop />} pressed={p.cropping} disabled={!photo} onClick={() => p.setCropping(!p.cropping)} />
            <OfficeButton label="Turn left" title="Turn left" icon={<PhotoIcon.RotateLeft />} disabled={!photo} onClick={() => p.rotate(-1)} />
            <OfficeButton label="Turn right" title="Turn right" icon={<PhotoIcon.RotateRight />} disabled={!photo} onClick={() => p.rotate(1)} />
            <OfficeButton label="Mirror" title="Mirror left to right" icon={<PhotoIcon.Flip />} disabled={!photo} onClick={p.flip} />
          </>}
          <OfficeSep />
          <OfficeButton label="From this board" title="Bring in pictures from Image windows on this board" icon={<PhotoIcon.Board />} disabled={Boolean(p.busy)} onClick={p.addFromBoard} />
          <OfficeButton label="Remove from library" title={p.selection.length > 1 ? `Remove ${p.selection.length} photos` : 'Remove this photo'} icon={<PhotoIcon.Trash />} disabled={!photo} onClick={() => p.remove()} />
        </OfficeBar>
        {(p.notice || p.busy) && (
          <div role="status" className="hb-of-alert"><span>{p.busy || p.notice}</span>
            {!p.busy && <button type="button" className="hb-of-btn" aria-label="Dismiss" onClick={() => p.setNotice(null)}><Icon.Close size={10} /></button>}
          </div>
        )}
        <div className="hb-cr-body">
          {view === 'develop' && photo ? <PhotoDevelop p={p} ratio={ratioNum} onDrawn={setDrawn} />
            : view === 'compare' && photo ? <PhotoCompare p={p} />
              : <PhotoGrid p={p} onOpenFiles={addFiles} />}
          {count > 0 && <PhotoPanel p={p} develop={view === 'develop'} ratio={ratio} setRatio={setRatio} drawn={drawn} />}
        </div>
        {photo && <div className="hb-cr-tip" role="status">{p.cropping
          ? 'Drag the box to move it, drag a corner to resize. Press R or Esc when done.'
          : view === 'grid' ? 'Click to choose, Shift or Ctrl to choose more. Double-click or Enter to develop. 1 to 5 for stars, P to pick, X to reject.'
            : '1 to 5 for stars, P to pick, X to reject, arrows for the next photo. Your original never changes.'}</div>}
      </div>
    </>
  );
}

export default YorPhotosWindow;
