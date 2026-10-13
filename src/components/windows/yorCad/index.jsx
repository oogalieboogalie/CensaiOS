/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { OfficeBar, OfficeButton, OfficeSep } from '../../office/OfficeBar.jsx';
import { useCad, UNTITLED } from '../../yorware/cad/useCad.js';
import { CadViewport } from '../../yorware/cad/CadViewport.jsx';
import { CadPanel } from '../../yorware/cad/CadPanel.jsx';
import { CadCode, CadStart } from '../../yorware/cad/CadCode.jsx';
import { sizeText } from '../../../lib/yorware/cadModel.js';
import { openInViewer } from '../../yorware/cad/cadHandoff.js';
import { windowMeta } from './meta.js';

export { windowMeta };

const VIEWS = [['iso', '3D'], ['front', 'Front'], ['top', 'Top'], ['right', 'Side']];

const dataUrlBytes = (url) => Uint8Array.from(atob(String(url).split(',')[1] || ''), (c) => c.charCodeAt(0));

// YorWare CAD: parts made from short recipes on the replicad library (MIT)
// and the OpenCascade kernel (LGPL-2.1, shipped unchanged). The sizes are
// dials anyone on the board can turn; the recipe is code a person or an
// agent can change. Exports STL for 3D printers and STEP for other CAD
// apps. Part of the YorWare Suite (docs/specs/13-yorware-suite.md).
export function YorCadWindow({ win = {}, onUpdate }) {
  const cad = useCad(win, onUpdate);
  const viewRef = React.useRef(null);
  const [showCode, setShowCode] = React.useState(false);
  const [view, setView] = React.useState('iso');
  const title = win.title || UNTITLED;
  const started = Boolean(cad.board.code.trim());
  const part = cad.part;

  const formats = started ? [
    { ext: 'stl', label: 'STL for 3D printing', hint: 'Opens in Cura, PrusaSlicer, Bambu Studio', build: () => cad.exportAs('stl') },
    { ext: 'step', label: 'STEP for CAD and machine shops', hint: 'Exact shapes, each body named and coloured', build: () => cad.exportAs('step') },
    { ext: 'png', label: 'Picture of this view', hint: 'For a message or a quote request', build: async () => {
      const url = viewRef.current?.snapshot();
      if (!url) throw new Error('The 3D view is not ready.');
      return dataUrlBytes(url);
    } },
  ] : [];
  const pick = (name) => { setView(name); viewRef.current?.view(name); };
  const toViewer = async () => {
    try { openInViewer(win, await cad.exportAs('stl')); } catch (err) { cad.setNotice(`Could not open it in the 3D Viewer: ${err.message}`); }
  };
  const subtitle = part?.ok ? `YorWare CAD · ${sizeText(part.size)}` : 'YorWare CAD';

  return (
    <>
      <WindowTitle icon={<Icon.Toolbox size={12} />} label={title} subtitle={subtitle} />
      <div className="hb-of hb-cr hb-yc" data-app="cad">
        <OfficeBar title={title} formats={formats}>
          <OfficeButton wide label="Recipe" title="Show the code that makes this part" icon={<Icon.Code size={12} />}
            pressed={showCode} disabled={!started} onClick={() => setShowCode((v) => !v)} />
          <OfficeSep />
          {VIEWS.map(([id, label]) => (
            <OfficeButton key={id} wide label={label} title={`${label} view`} pressed={started ? view === id : undefined} disabled={!part?.meshes} onClick={() => pick(id)} />
          ))}
          <OfficeSep />
          <OfficeButton wide label="3D Viewer" title="Open a copy in the 3D Viewer, to turn it, measure it and pin notes" icon={<Icon.Cube size={12} />}
            disabled={!part?.ok} onClick={toViewer} />
          <OfficeSep />
          <span className="hb-cr-num hb-yc-status" role="status" data-state={cad.status}>
            {cad.status === 'building' ? 'Building…' : cad.status === 'error' ? 'Recipe has a problem' : ''}
          </span>
          {!cad.canEdit && <span className="hb-cr-tag">You can look; the owner hasn't let you edit.</span>}
        </OfficeBar>
        {cad.notice && (
          <div role="status" className="hb-of-alert"><span>{cad.notice}</span>
            <button type="button" className="hb-of-btn" aria-label="Dismiss" onClick={() => cad.setNotice(null)}><Icon.Close size={10} /></button>
          </div>
        )}
        <div className="hb-cr-body">
          {started && showCode && <CadCode cad={cad} />}
          <div className="hb-cr-stage hb-yc-stage">
            {started ? (
              <CadViewport part={part} fitKey={part?.code} view={view} viewRef={viewRef}>
                {part && !part.ok && (
                  <div className="hb-yc-error" role="alert">
                    <strong>{part.meshes ? 'Showing the last part that built. ' : ''}The recipe stopped:</strong> {part.error}
                  </div>
                )}
                {!part && <div className="hb-yc-empty" role="status">Loading the CAD kernel…</div>}
              </CadViewport>
            ) : <CadStart cad={cad} />}
          </div>
          {started && <CadPanel cad={cad} />}
        </div>
      </div>
    </>
  );
}

export default YorCadWindow;
