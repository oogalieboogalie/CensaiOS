/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { logToApp } from '../../../lib/appLog/browserLog.js';
import { niceNumber } from '../../../lib/yorware/modelMeasure.js';

const SAFE_ERROR = new Set([
  'Nothing to save: open or show a model first.',
  'The 3D view is not ready yet.',
]);

/** Changes that alter the STL (what is showing, which axis is up, true size). */
export function printWatch(m) {
  const order = m.scene?.order || [];
  const bits = order.map((id) => {
    const show = m.scene.show?.[id];
    const ready = m.loaded?.[id]?.object ? 1 : 0;
    return `${id}:${show?.visible ? 1 : 0}:${show?.zUp ? 1 : 0}:${ready}`;
  });
  return `${m.scene?.view?.arrange || ''}|${bits.join(',')}`;
}

function sizeLine(size) {
  return `${niceNumber(size.x)} × ${niceNumber(size.y)} × ${niceNumber(size.z)}`;
}

function openLine(n) {
  const edges = n === 1 ? 'open edge' : 'open edges';
  const holes = n === 1 ? 'this hole' : 'these holes';
  return `${n.toLocaleString('en-US')} ${edges}: a slicer may fill or skip ${holes}`;
}

function verdict(check) {
  if (!check.triangles) return 'Nothing shown has triangles to print.';
  if (check.closed) return 'Closed mesh: every edge is shared by two triangles.';
  if (!check.openEdges) return 'This mesh has no closed surface a slicer can use.';
  return openLine(check.openEdges);
}

export function PrintCheckView({ state }) {
  const check = state?.check;
  return (
    <div className="hb-panel hb-y3d-print" role="status" aria-label="Print check">
      <p className="hb-y3d-print-unit">One model unit is one millimetre. Width × depth × height, Z up, as a slicer reads the file.</p>
      {!state && <p className="hb-y3d-print-unit">Checking the mesh…</p>}
      {state?.error && <p className="hb-y3d-print-unit">{state.error}</p>}
      {check && (
        <>
          <div className="hb-y3d-print-stats">
            <div className="hb-stat">
              <span className="hb-stat-value">{sizeLine(check.size)}</span>
              <span className="hb-stat-label">Width × depth × height (mm)</span>
            </div>
            <div className="hb-stat">
              <span className="hb-stat-value">{check.triangles.toLocaleString('en-US')}</span>
              <span className="hb-stat-label">Triangles</span>
            </div>
            <div className="hb-stat">
              <span className="hb-stat-value">{check.openEdges.toLocaleString('en-US')}</span>
              <span className="hb-stat-label">Open edges</span>
            </div>
          </div>
          <p className="hb-y3d-print-unit">{verdict(check)}</p>
        </>
      )}
    </div>
  );
}

export function PrintCheck({ stageRef, watch }) {
  const [state, setState] = React.useState(null);

  React.useEffect(() => {
    let gone = false;
    const timer = setTimeout(() => {
      const stage = stageRef.current;
      if (!stage) {
        if (!gone) setState({ error: 'The 3D view is not ready yet.' });
        return;
      }
      import('../../../lib/yorware/printScene.js')
        .then(({ checkShown }) => {
          if (gone) return null;
          return checkShown(stage);
        })
        .then((check) => {
          if (gone || !check) return;
          logToApp('info', `3D print check: ${check.triangles} triangles, ${check.openEdges} open edges`, { where: 'yor3d' });
          setState({ check });
        })
        .catch((err) => {
          if (gone) return;
          logToApp('warn', '3D print check could not read the model', { where: 'yor3d' });
          const message = SAFE_ERROR.has(err?.message) ? err.message : 'The print check could not read this model.';
          setState({ error: message });
        });
    }, 0);
    return () => { gone = true; clearTimeout(timer); };
  }, [stageRef, watch]);

  return <PrintCheckView state={state} />;
}
