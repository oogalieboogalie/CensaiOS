/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { OfficeBar, OfficeButton, OfficeSep } from '../../office/OfficeBar.jsx';
import { ToolIcon } from '../../creative/toolIcons.jsx';
import { typingIn } from '../../creative/useUndo.js';
import { ModelIcon } from '../../yorware/modelIcons.jsx';
import { useModels, UNTITLED } from '../../yorware/model3d/useModels.js';
import { ModelViewport } from '../../yorware/model3d/ModelViewport.jsx';
import { ModelPanel } from '../../yorware/model3d/ModelPanel.jsx';
import { MODEL_ACCEPT, MODEL_FORMATS } from '../../../lib/yorware/modelFiles.js';

const exporter = () => import('../../../lib/yorware/modelExport.js');
const TOOLS = [['orbit', 'Turn and look', 'V', ModelIcon.Orbit], ['measure', 'Measure', 'M', ModelIcon.Measure], ['note', 'Pin a note', 'N', ModelIcon.Note]];
const TIPS = {
  orbit: 'Drag to turn, right-drag or Shift-drag to move, scroll to zoom. Double-click to fit everything. F fits, T turns on its own.',
  measure: 'Click two points on a model to measure between them. Esc to stop.',
  note: 'Click a spot on a model to pin a note there. Everyone on the board sees it.',
};

function pickModels() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = MODEL_ACCEPT;
    input.multiple = true;
    input.addEventListener('change', () => resolve(Array.from(input.files || [])), { once: true });
    input.click();
  });
}
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

function StartScreen({ m, onOpen }) {
  return (
    <div className="hb-y3d-start">
      <ModelIcon.Cube size={40} />
      <h2>Open a 3D model</h2>
      <p className="hb-cr-hint">Drop a file here or choose one. It is saved on the board, so everyone here can turn it around, measure it and leave notes on it.</p>
      <div className="hb-cr-row">
        <button type="button" className="hb-of-btn hb-y3d-primary" data-wide="true" onClick={onOpen}><ModelIcon.Open /><span>Choose a model</span></button>
        <button type="button" className="hb-of-btn" data-wide="true" disabled={Boolean(m.busy)} onClick={m.addSamples}><ModelIcon.Sample /><span>Try the samples</span></button>
      </div>
      <p className="hb-cr-hint">{MODEL_FORMATS.map(([ext]) => `.${ext}`).join('  ')}</p>
      <p className="hb-cr-hint">An .obj can come with its .mtl and pictures, a .gltf with its .bin: drop them together. Up to 10 MB per model.</p>
    </div>
  );
}

// YorWare 3D Viewer: open and look around 3D models on the board. Part of
// the YorWare Suite (docs/specs/13-yorware-suite.md).
export function Yor3dWindow({ win = {}, onUpdate }) {
  const m = useModels(win, onUpdate);
  const stageRef = React.useRef(null);
  const [dropping, setDropping] = React.useState(false);
  const count = m.scene.order.length;
  const open = async () => m.addFiles(await pickModels());
  const look = (dir) => stageRef.current?.fit(dir);
  const title = (win.title && win.title !== UNTITLED ? win.title : null) || m.scene.models[m.scene.order[0]]?.name || UNTITLED;
  const need = () => { if (!stageRef.current) throw new Error('The 3D view is not ready yet.'); return stageRef.current; };

  const formats = [
    { ext: 'glb', label: 'Everything shown as GLB', hint: 'Opens in Blender, Windows 3D Viewer and web apps', build: async () => (await exporter()).exportGlb(need()) },
    { ext: 'stl', label: 'Everything shown as STL', hint: 'For a 3D printer slicer, Z up', build: async () => (await exporter()).exportStl(need()) },
    { ext: 'png', label: 'This view as PNG', hint: 'A picture of exactly what you see', build: async () => need().snapshot() },
  ];

  const onKeyDown = (e) => {
    if (typingIn(e)) return;
    if (m.history.onKey(e)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const t = TOOLS.find((x) => x[2].toLowerCase() === k);
    if (t && count) { m.setTool(t[0]); return; }
    if (k === 'f') { look('iso'); return; }
    if (k === 't') { m.setAutoTurn(!m.autoTurn); return; }
    if (e.key === 'Escape') { m.setMeasure([]); m.setOpenNote(null); m.setTool('orbit'); }
  };

  return (
    <>
      <WindowTitle icon={<ModelIcon.Cube size={12} />} label={title} subtitle={count ? `YorWare 3D Viewer · ${count} model${count === 1 ? '' : 's'}` : 'YorWare 3D Viewer'} />
      <div className="hb-of hb-cr hb-y3d" data-app="3d" data-dropping={dropping ? 'true' : undefined} tabIndex={-1} onKeyDown={onKeyDown}
        onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setDropping(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropping(false); }}
        onDrop={(e) => { if (!hasFiles(e)) return; e.preventDefault(); setDropping(false); m.addFiles(e.dataTransfer.files); }}>
        <OfficeBar title={title} formats={count ? formats : []} importHint="Open 3D models" onImport={open}>
          {TOOLS.map(([id, label, key, Glyph]) => (
            <OfficeButton key={id} label={label} title={`${label} (${key})`} icon={<Glyph />} pressed={m.tool === id} disabled={!count} onClick={() => m.setTool(id === 'orbit' ? m.tool : id)} />
          ))}
          <OfficeSep />
          <OfficeButton label="Fit everything" title="Fit everything (F)" icon={<ModelIcon.Fit />} disabled={!count} onClick={() => look('iso')} />
          <OfficeButton label="Turn on its own" title="Turn on its own (T)" icon={<ModelIcon.Turn />} pressed={m.autoTurn} disabled={!count} onClick={() => m.setAutoTurn(!m.autoTurn)} />
          <OfficeSep />
          <OfficeButton label="Undo" title="Undo (Ctrl+Z)" icon={<ToolIcon.Undo />} disabled={!m.history.canUndo} onClick={m.history.undo} />
          <OfficeButton label="Redo" title="Redo (Ctrl+Shift+Z)" icon={<ToolIcon.Redo />} disabled={!m.history.canRedo} onClick={m.history.redo} />
          <OfficeSep />
          <OfficeButton label="Add the samples" title="Add a sample rocket and gear" icon={<ModelIcon.Sample />} disabled={Boolean(m.busy)} onClick={m.addSamples} />
        </OfficeBar>
        {(m.notice || m.busy) && (
          <div role="status" className="hb-of-alert"><span>{m.busy || m.notice}</span>
            {!m.busy && <button type="button" className="hb-of-btn" aria-label="Dismiss" onClick={() => m.setNotice(null)}><Icon.Close size={10} /></button>}
          </div>
        )}
        <div className="hb-cr-body">
          <div className="hb-y3d-main">
            <ModelViewport m={m} stageRef={stageRef} />
            {!count && <StartScreen m={m} onOpen={open} />}
          </div>
          <ModelPanel m={m} onView={look} />
        </div>
        {count > 0 && <div className="hb-cr-tip" role="status">{TIPS[m.tool]}</div>}
      </div>
    </>
  );
}

export default Yor3dWindow;
