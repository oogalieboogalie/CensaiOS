import React from 'react';
import { screenToCanvas } from '../../lib/canvasMath.js';
import { buildInkStroke, coalescedSamples, inkPoint, inkSize } from '../../lib/ink/stroke.js';
import { createPalmFilter } from '../../lib/ink/palmFilter.js';
import { strokesInLasso } from '../../lib/ink/shapes.js';
import { createLiveInkSender } from '../../lib/ink/live.js';
import { reportInk } from '../../lib/collaboration/liveText.js';
import { getCollaborationClientId } from '../../lib/collaboration/clientIdentity.js';

// Spec 9 pen input for the canvas: pressure and tilt samples (all of them,
// via coalesced events), palm rejection, the live stroke others watch, and
// the lasso. useCanvasPointer routes pointer events here.
export function useInkPointer({ ref, pan, zoom, penColor, penSize, paths, setPaths }) {
  const [currentPath, setCurrentPath] = React.useState(null);
  const [lasso, setLasso] = React.useState(null);
  const [inkSelection, setInkSelection] = React.useState([]);
  const palm = React.useMemo(() => createPalmFilter(), []);
  const strokeRef = React.useRef(null);
  const sendLive = React.useMemo(() => createLiveInkSender(reportInk), []);
  const view = React.useRef({ pan, zoom });
  view.current = { pan, zoom };

  const toCanvas = React.useCallback((e) => {
    const { pan: p, zoom: z } = view.current;
    return screenToCanvas(e.clientX, e.clientY, p.x, p.y, z, ref.current.getBoundingClientRect());
  }, [ref]);

  const live = (s, phase = 'move') => sendLive({
    strokeId: s.id, points: s.points, color: s.color, size: inkSize(penSize, view.current.zoom), sim: s.sim, phase,
  });

  const startStroke = (e) => {
    const s = { id: crypto.randomUUID(), points: [inkPoint(toCanvas(e), e)], color: penColor, sim: e.pointerType !== 'pen' };
    strokeRef.current = s;
    setCurrentPath(s.points);
  };

  const extendStroke = (e) => {
    const s = strokeRef.current;
    if (!s) return;
    for (const sample of coalescedSamples(e)) s.points.push(inkPoint(toCanvas(sample), sample));
    setCurrentPath([...s.points]);
    live(s);
  };

  const commitStroke = () => {
    const s = strokeRef.current;
    strokeRef.current = null;
    setCurrentPath(null);
    if (!s) return;
    const stroke = buildInkStroke(s.points, {
      color: s.color, size: penSize, zoom: view.current.zoom, simulated: s.sim, by: getCollaborationClientId(),
    });
    if (stroke) {
      stroke.id = s.id;
      setPaths((prev) => [...prev, stroke]);
    }
    live(s, 'end');
  };

  const startLasso = (e) => setLasso([toCanvas(e)]);
  const extendLasso = (e) => setLasso((prev) => (prev ? [...prev, toCanvas(e)] : prev));
  const endLasso = () => {
    setInkSelection(lasso ? strokesInLasso(paths, lasso) : []);
    setLasso(null);
  };

  // Drop selected ids that no longer exist (erased here or by someone else).
  React.useEffect(() => {
    if (!inkSelection.length) return;
    const ids = new Set(paths.map((p) => p.id));
    if (inkSelection.some((id) => !ids.has(id))) setInkSelection((sel) => sel.filter((id) => ids.has(id)));
  }, [paths, inkSelection]);

  return {
    palm,
    currentPath,
    currentStroke: currentPath && strokeRef.current
      ? { id: strokeRef.current.id, ink: 1, pts: currentPath, color: strokeRef.current.color, size: inkSize(penSize, zoom), sim: strokeRef.current.sim }
      : null,
    startStroke,
    extendStroke,
    commitStroke,
    lasso,
    startLasso,
    extendLasso,
    endLasso,
    inkSelection,
    setInkSelection,
  };
}
