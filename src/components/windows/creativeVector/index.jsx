/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { OfficeBar, OfficeButton, OfficeSep } from '../../office/OfficeBar.jsx';
import { ToolIcon } from '../../creative/toolIcons.jsx';
import { typingIn } from '../../creative/useUndo.js';
import { useVector } from '../../creative/vector/useVector.js';
import { VectorStage } from '../../creative/vector/VectorStage.jsx';
import { VectorPanel } from '../../creative/vector/VectorPanel.jsx';
import { vectorToPng, vectorToSvg } from '../../../lib/creative/svgOut.js';
import { pickFile } from '../../../lib/office/officeFiles.js';
import { PAPER } from '../../../lib/creative/creativeColors.js';
import { useFitScale } from '../../creative/useFitScale.js';

const TOOLS = [
  ['select', 'Select', 'V', ToolIcon.Pointer],
  ['pen', 'Pen', 'P', ToolIcon.Pen],
  ['rect', 'Rectangle', 'R', ToolIcon.Rect],
  ['ellipse', 'Ellipse', 'O', ToolIcon.Ellipse],
  ['line', 'Line', 'L', ToolIcon.Line],
  ['text', 'Text', 'T', ToolIcon.Text],
];
const ALIGN = [
  ['left', 'Align left', ToolIcon.AlignLeft], ['center', 'Align centers', ToolIcon.AlignCenterH], ['right', 'Align right', ToolIcon.AlignRight],
  ['top', 'Align top', ToolIcon.AlignTop], ['middle', 'Align middles', ToolIcon.AlignMiddle], ['bottom', 'Align bottom', ToolIcon.AlignBottom],
];
const ZOOMS = [['fit', 'Fit'], ['0.5', '50%'], ['1', '100%'], ['2', '200%']];

// Censai Vector: an illustration editor on the canvas. Pen with bezier
// curves, shapes, fill and stroke, align, groups; SVG in, SVG and PNG out.
export function CreativeVectorWindow({ win = {}, onUpdate }) {
  const v = useVector(win, onUpdate);
  const { doc, history, selected } = v;
  const wrapRef = React.useRef(null);
  const penRef = React.useRef(null);
  const [zoom, setZoom] = React.useState('fit');
  const [notice, setNotice] = React.useState(null);
  const fit = useFitScale(wrapRef, doc.w, doc.h);
  const scale = zoom === 'fit' ? fit : Number(zoom);
  const title = win.title || 'Untitled artwork';
  const formats = [
    { ext: 'svg', label: 'SVG', hint: 'Opens in Illustrator, Figma, Inkscape, browsers', build: async () => new Blob([vectorToSvg(doc)], { type: 'image/svg+xml' }) },
    { ext: 'png', label: 'PNG', hint: 'Picture at twice the artboard size', build: () => vectorToPng(doc, 2) },
  ];
  const importSvgFile = async () => {
    const file = await pickFile('image/svg+xml,.svg');
    if (!file) return;
    v.importText(await file.text());
  };
  const has = selected.length > 0;
  const grouped = selected.some((id) => doc.shapes[id]?.group);

  const onKeyDown = (e) => {
    if (typingIn(e)) return;
    if (history.onKey(e)) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    const pen = penRef.current;
    if (mod && k === 'g') { e.preventDefault(); if (e.shiftKey) v.ungroup(); else v.group(); return; }
    if (mod && k === 'd') { e.preventDefault(); v.duplicate(); return; }
    if (mod && k === 'a') { e.preventDefault(); v.selectAll(); return; }
    if (mod || e.altKey) return;
    if (e.key === 'Enter' && pen?.pen) { pen.finishPen(false); return; }
    if (e.key === 'Escape') { if (pen?.pen) pen.finishPen(false); else if (v.editId) v.setEditId(null); else v.clear(); return; }
    const step = e.shiftKey ? 10 : 1;
    const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (arrows[e.key] && has) { e.preventDefault(); v.nudge(...arrows[e.key]); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && has) { e.preventDefault(); v.remove(); return; }
    if (e.key === ']') { v.reorder(true); return; }
    if (e.key === '[') { v.reorder(false); return; }
    const tool = TOOLS.find((t) => t[2].toLowerCase() === k);
    if (tool) { pen?.cancelPen(); v.setTool(tool[0]); }
  };

  return (
    <>
      <WindowTitle icon={<ToolIcon.Pen size={12} />} label={title} subtitle={`Censai Vector · ${doc.w} × ${doc.h}`} />
      <div className="hb-of hb-cr" data-app="vector" tabIndex={-1} onKeyDown={onKeyDown}>
        <OfficeBar title={title} formats={formats} importHint="Add the shapes from an .svg file"
          onImport={async () => { try { setNotice(null); await importSvgFile(); } catch (err) { setNotice(err?.message || String(err)); } }}>
          <OfficeButton label="Undo" title="Undo (Ctrl+Z)" icon={<ToolIcon.Undo />} disabled={!history.canUndo} onClick={history.undo} />
          <OfficeButton label="Redo" title="Redo (Ctrl+Shift+Z)" icon={<ToolIcon.Redo />} disabled={!history.canRedo} onClick={history.redo} />
          <OfficeSep />
          {ALIGN.map(([mode, label, Glyph]) => <OfficeButton key={mode} label={label} icon={<Glyph />} disabled={!has} onClick={() => v.align(mode)} />)}
          <OfficeButton label="Distribute horizontally" icon={<ToolIcon.DistributeH />} disabled={selected.length < 3} onClick={() => v.distribute('h')} />
          <OfficeButton label="Distribute vertically" icon={<ToolIcon.DistributeV />} disabled={selected.length < 3} onClick={() => v.distribute('v')} />
          <OfficeSep />
          <OfficeButton wide label={grouped ? 'Ungroup' : 'Group'} title={grouped ? 'Ungroup (Ctrl+Shift+G)' : 'Group (Ctrl+G)'} icon={<ToolIcon.Group />}
            disabled={grouped ? false : selected.length < 2} onClick={grouped ? v.ungroup : v.group} />
          <OfficeButton label="Bring to front" title="Bring to front (])" icon={<ToolIcon.Front />} disabled={!has} onClick={() => v.reorder(true)} />
          <OfficeButton label="Send to back" title="Send to back ([)" icon={<ToolIcon.Back />} disabled={!has} onClick={() => v.reorder(false)} />
          <OfficeButton label="Duplicate" title="Duplicate (Ctrl+D)" icon={<Icon.Copy size={11} />} disabled={!has} onClick={v.duplicate} />
          <OfficeButton label="Delete" title="Delete (Delete)" icon={<Icon.Close size={10} />} disabled={!has} onClick={v.remove} />
          <OfficeSep />
          <select className="hb-of-select" aria-label="Zoom" value={zoom} onChange={(e) => setZoom(e.target.value)}>
            {ZOOMS.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
          </select>
          <select className="hb-of-select" aria-label="Background" value={doc.bg ? 'white' : 'clear'} onChange={(e) => v.setBackground(e.target.value === 'white' ? PAPER : null)}>
            <option value="white">White artboard</option>
            <option value="clear">Transparent</option>
          </select>
        </OfficeBar>
        {notice && <div role="status" className="hb-of-alert"><span>{notice}</span><button type="button" className="hb-of-btn" aria-label="Dismiss" onClick={() => setNotice(null)}><Icon.Close size={10} /></button></div>}
        <div className="hb-cr-body">
          <div className="hb-cr-toolrail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
            {TOOLS.map(([id, label, key, Glyph]) => (
              <OfficeButton key={id} label={label} title={`${label} (${key})`} icon={<Glyph />} pressed={v.tool === id}
                onClick={() => { penRef.current?.finishPen(false); v.setTool(id); }} />
            ))}
          </div>
          <div className="hb-cr-stage" ref={wrapRef}>
            <div className="hb-cr-art" style={{ width: doc.w * scale, height: doc.h * scale }}>
              <VectorStage v={v} scale={scale} penRef={penRef} />
            </div>
          </div>
          <VectorPanel v={v} />
        </div>
        {v.tool === 'pen' && <div className="hb-cr-tip" role="status">Click to add corners, drag to pull curves. Click the first point to close, Enter to finish.</div>}
      </div>
    </>
  );
}

export default CreativeVectorWindow;
