/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { OfficeBar } from '../../office/OfficeBar.jsx';
import { getSelf } from '../../../lib/modules/presenceRoster.js';
import { liveElements } from '../../../lib/yorware/diagramModel.js';
import { useDiagramSync } from '../../yorware/diagrams/useDiagramSync.js';
import { DiagramStage } from '../../yorware/diagrams/DiagramStage.jsx';
import { diagramFormats, importDiagram } from '../../yorware/diagrams/diagramFiles.js';
import { windowMeta } from './meta.js';

export { windowMeta };
export const UNTITLED = 'Untitled diagram';

// The drawing engine is big, so it loads the first time a Diagrams window opens.
let kitPromise = null;
const loadKit = () => (kitPromise ||= import('../../yorware/diagrams/excalidrawKit.js'));

// YorWare Diagrams: flowcharts, sketches and wireframes on the board, drawn
// with Excalidraw (MIT). Every shape is its own board field, so people on
// the board draw together live. Part of the YorWare Suite
// (docs/specs/13-yorware-suite.md).
export function YorDiagramsWindow({ win = {}, onUpdate }) {
  const [kit, setKit] = React.useState(null);
  const [failed, setFailed] = React.useState(null);
  React.useEffect(() => {
    // Excalidraw needs the browser's 2D drawing and font APIs (test pages lack them).
    if (typeof Path2D === 'undefined' || typeof FontFace === 'undefined') { setFailed('this browser has no drawing surface'); return undefined; }
    let live = true;
    loadKit().then((k) => { if (live) setKit(k); }, (err) => { kitPromise = null; if (live) setFailed(err?.message || String(err)); });
    return () => { live = false; };
  }, []);
  const sync = useDiagramSync(win, onUpdate, kit || {});
  const title = win.title || UNTITLED;
  const count = liveElements(sync.board.elements).length;
  const readOnly = getSelf().canEdit === false;

  return (
    <>
      <WindowTitle icon={<Icon.NewWorkflow size={12} />} label={title}
        subtitle={count ? `YorWare Diagrams · ${count} shape${count === 1 ? '' : 's'}` : 'YorWare Diagrams'} />
      <div className="hb-of hb-yd" data-app="diagrams">
        <OfficeBar title={title} formats={kit ? diagramFormats(kit, sync.api) : []}
          onImport={kit && !readOnly ? () => importDiagram(kit, win, onUpdate) : undefined}
          importHint="Open an .excalidraw file in place of this drawing">
          {readOnly && <span className="hb-yd-readonly">You can look; the owner hasn't let you edit.</span>}
        </OfficeBar>
        {sync.notice && (
          <div role="status" className="hb-of-alert"><span>{sync.notice}</span>
            <button type="button" className="hb-of-btn" aria-label="Dismiss" onClick={() => sync.setNotice(null)}><Icon.Close size={10} /></button>
          </div>
        )}
        {kit ? <DiagramStage kit={kit} sync={sync} readOnly={readOnly} /> : (
          <div className="hb-yd-loading" role="status">{failed ? `The drawing tools could not load: ${failed}` : 'Opening the drawing tools…'}</div>
        )}
      </div>
    </>
  );
}

export default YorDiagramsWindow;
