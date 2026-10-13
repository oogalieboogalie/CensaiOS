/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { OfficeBar, OfficeButton, OfficeSep } from '../../office/OfficeBar.jsx';
import { ToolIcon } from '../../creative/toolIcons.jsx';
import { ColorField } from '../../creative/ColorField.jsx';
import { typingIn } from '../../creative/useUndo.js';
import { usePhoto } from '../../creative/photo/usePhoto.js';
import { PhotoStage } from '../../creative/photo/PhotoStage.jsx';
import { PhotoPanel } from '../../creative/photo/PhotoPanel.jsx';
import { PHOTO_FORMATS, exportPhoto } from '../../../lib/creative/photoRender.js';
import { pickFile } from '../../../lib/office/officeFiles.js';
import { PAPER } from '../../../lib/creative/creativeColors.js';

const TOOLS = [
  ['move', 'Move', 'V', ToolIcon.Move],
  ['select', 'Select', 'M', ToolIcon.Marquee],
  ['brush', 'Brush', 'B', ToolIcon.Brush],
  ['eraser', 'Eraser', 'E', ToolIcon.Eraser],
  ['text', 'Text', 'T', ToolIcon.Text],
  ['pick', 'Color picker', 'I', ToolIcon.Picker],
];
const ZOOMS = [['fit', 'Fit'], ['0.5', '50%'], ['1', '100%'], ['2', '200%']];

// Censai Photo: a layered image editor on the canvas. Brush, eraser,
// selection, crop, text, blend modes and adjustments; PNG, JPEG and WebP out.
export function CreativePhotoWindow({ win = {}, onUpdate }) {
  const p = usePhoto(win, onUpdate);
  const { doc, history, selection } = p;
  const [zoom, setZoom] = React.useState('fit');
  const [alpha, setAlpha] = React.useState(1);
  const [notice, setNotice] = React.useState(null);
  const title = win.title || 'Untitled picture';
  const formats = Object.entries(PHOTO_FORMATS).map(([ext, f]) => ({ ext, label: f.label, hint: f.hint, build: () => exportPhoto(doc, p.surfaces, ext) }));
  const raster = p.layer?.kind === 'raster';

  const importFile = async (file) => {
    try { setNotice(null); await p.importPicture(file); } catch (err) { setNotice(err?.message || String(err)); }
  };
  const onKeyDown = (e) => {
    if (typingIn(e)) return;
    if (history.onKey(e)) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'j') { e.preventDefault(); p.copyToLayer(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tool = TOOLS.find((t) => t[2].toLowerCase() === k);
    if (tool) { p.setTool(tool[0]); return; }
    if (e.key === '[') p.setSize(Math.max(1, p.size - 4));
    else if (e.key === ']') p.setSize(Math.min(300, p.size + 4));
    else if (e.key === 'Escape') p.setSelection(null);
    else if (e.key === 'Enter' && selection) p.crop();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && raster) { e.preventDefault(); p.clearSelection(); }
    else return;
    e.stopPropagation();
  };
  const onDrop = (e) => {
    const file = [...(e.dataTransfer?.files || [])].find((f) => /^image\//.test(f.type));
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    importFile(file);
  };
  const onPaste = (e) => {
    const file = [...(e.clipboardData?.files || [])].find((f) => /^image\//.test(f.type));
    if (file) { e.preventDefault(); e.stopPropagation(); importFile(file); }
  };

  return (
    <>
      <WindowTitle icon={<Icon.Picture size={12} />} label={title} subtitle={`Censai Photo · ${doc.w} × ${doc.h}`} />
      <div className="hb-of hb-cr" data-app="photo" tabIndex={-1} onKeyDown={onKeyDown} onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onPaste={onPaste}>
        <OfficeBar title={title} formats={formats} importHint="Add a picture as a new layer (PNG, JPEG, WebP, GIF)"
          onImport={async () => { const f = await pickFile('image/png,image/jpeg,image/webp,image/gif'); if (f) await importFile(f); }}>
          <OfficeButton label="Undo" title="Undo (Ctrl+Z)" icon={<ToolIcon.Undo />} disabled={!history.canUndo} onClick={history.undo} />
          <OfficeButton label="Redo" title="Redo (Ctrl+Shift+Z)" icon={<ToolIcon.Redo />} disabled={!history.canRedo} onClick={history.redo} />
          <OfficeSep />
          <ColorField label="Color" value={p.color} onChange={p.setColor} swatches={false} />
          <label className="hb-cr-inline"><span>Size</span>
            <input type="range" min={1} max={200} value={p.size} aria-label="Brush size" onChange={(e) => p.setSize(Number(e.target.value))} />
            <span className="hb-cr-num">{p.size}</span>
          </label>
          <label className="hb-cr-inline"><span>Flow</span>
            <input type="range" min={5} max={100} value={Math.round(alpha * 100)} aria-label="Brush opacity" onChange={(e) => setAlpha(Number(e.target.value) / 100)} />
          </label>
          <OfficeSep />
          <OfficeButton wide label="Crop" title="Crop to the selection (Enter)" icon={<ToolIcon.Crop />} disabled={!selection} onClick={p.crop} />
          <OfficeButton wide label="Fill" title="Fill the selection with the color" disabled={!raster} onClick={p.fillSelection} />
          <OfficeButton wide label="Clear" title="Erase inside the selection (Delete)" disabled={!raster} onClick={p.clearSelection} />
          <OfficeButton label="To layer" title="Copy the selection to a new layer (Ctrl+J)" disabled={!raster || !selection} onClick={p.copyToLayer}><span>To layer</span></OfficeButton>
          <OfficeButton label="Flip" title="Flip the layer left to right" icon={<ToolIcon.FlipH />} disabled={!raster} onClick={() => p.flip('h')} />
          <OfficeSep />
          <select className="hb-of-select" aria-label="Zoom" value={zoom} onChange={(e) => setZoom(e.target.value)}>
            {ZOOMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="hb-of-select" aria-label="Background" value={doc.bg ? 'white' : 'clear'} onChange={(e) => p.setBackground(e.target.value === 'white' ? PAPER : null)}>
            <option value="white">White background</option>
            <option value="clear">Transparent</option>
          </select>
        </OfficeBar>
        {notice && <div role="status" className="hb-of-alert"><span>{notice}</span><button type="button" className="hb-of-btn" aria-label="Dismiss" onClick={() => setNotice(null)}><Icon.Close size={10} /></button></div>}
        <div className="hb-cr-body">
          <div className="hb-cr-toolrail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
            {TOOLS.map(([id, label, key, Glyph]) => (
              <OfficeButton key={id} label={label} title={`${label} (${key})`} icon={<Glyph />} pressed={p.tool === id} onClick={() => p.setTool(id)} />
            ))}
          </div>
          <PhotoStage p={p} zoom={zoom} alpha={alpha} onNotice={setNotice} />
          <PhotoPanel p={p} />
        </div>
      </div>
    </>
  );
}

export default CreativePhotoWindow;
