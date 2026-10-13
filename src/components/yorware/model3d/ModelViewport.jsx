/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { measureLength, niceNumber } from '../../../lib/yorware/modelMeasure.js';

const stageModule = () => import('../../../lib/yorware/modelStage.js');
const isDark = () => typeof document === 'undefined' || document.documentElement.getAttribute('data-theme') !== 'light';

function useDarkTheme() {
  const [dark, setDark] = React.useState(isDark);
  React.useEffect(() => {
    const mo = new MutationObserver(() => setDark(isDark()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

/**
 * The 3D view: the three.js stage, plus the numbered note pins and the
 * measuring label drawn on top as plain HTML so they stay sharp. Pins move
 * with the camera through the stage's onFrame, not through React.
 */
export function ModelViewport({ m, stageRef }) {
  const hostRef = React.useRef(null);
  const pinRefs = React.useRef({});
  const labelRef = React.useRef(null);
  const [failed, setFailed] = React.useState(null);
  const [stage, setStage] = React.useState(null);
  const dark = useDarkTheme();
  const { scene, loaded } = m;

  React.useEffect(() => {
    let stage = null;
    let gone = false;
    stageModule().then(({ ModelStage }) => {
      if (gone || !hostRef.current) return;
      try { stage = new ModelStage(hostRef.current, { dark: isDark() }); } catch (err) { setFailed(err?.message || String(err)); return; }
      stageRef.current = stage;
      setStage(stage);
    });
    return () => { gone = true; stage?.dispose(); stageRef.current = null; };
  }, []);

  React.useEffect(() => { stage?.setTheme(dark); }, [stage, dark]);
  React.useEffect(() => { stage?.setView(scene.view); }, [stage, scene.view]);
  React.useEffect(() => { stage?.setAutoTurn(m.autoTurn); }, [stage, m.autoTurn]);

  // Hand the stage the models that have loaded, in list order.
  const readyKey = scene.order.map((id) => `${id}:${loaded[id]?.object ? 1 : 0}:${JSON.stringify(scene.show[id])}`).join('|');
  const firstFit = React.useRef(false);
  React.useEffect(() => {
    if (!stage) return;
    const items = scene.order.filter((id) => loaded[id]?.object).map((id) => ({ id, object: loaded[id].object, show: scene.show[id] }));
    stage.setModels(items);
    if (items.length && !firstFit.current) { firstFit.current = true; stage.fit('iso'); }
    if (!items.length) firstFit.current = false;
  }, [stage, readyKey]);

  // Measuring line between the points you clicked.
  const [a, b] = m.measure;
  React.useEffect(() => { stage?.setMeasure(a?.world || null, b?.world || null); }, [stage, a, b]);

  // Keep pins and the measure label on their 3D spots every frame.
  React.useEffect(() => {
    if (!stage) return undefined;
    stage.onFrame = () => {
      for (const id of scene.noteOrder) {
        const el = pinRefs.current[id];
        if (!el) continue;
        const n = scene.notes[id];
        const w = stage.toWorld(n.model, n.p);
        const s = w && stage.project(w);
        el.style.display = s && !s.behind ? '' : 'none';
        if (s) el.style.transform = `translate(${s.x}px, ${s.y}px)`;
      }
      if (labelRef.current && a && b) {
        const s = stage.project(a.world.clone().add(b.world).multiplyScalar(0.5));
        labelRef.current.style.transform = `translate(${s.x}px, ${s.y}px)`;
      }
    };
    stage.dirty = true;
    return () => { stage.onFrame = null; };
  }, [stage, scene, a, b]);

  const down = React.useRef(null);
  const onPointerDown = (e) => { down.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    const d = down.current;
    down.current = null;
    if (!stage || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4 || e.button !== 0) return;
    const hit = stage.pick(e.clientX, e.clientY);
    if (hit) m.setCurrent(hit.id);
    if (!hit || m.tool === 'orbit') return;
    if (m.tool === 'note') m.addNote(hit); else m.addMeasurePoint(hit);
  };

  const hasModels = scene.order.length > 0;
  return (
    <div className="hb-y3d-view" data-tool={m.tool} onPointerDown={onPointerDown} onPointerUp={onPointerUp}
      onDoubleClick={() => stage?.fit('iso')}>
      <div ref={hostRef} className="hb-y3d-host" aria-label="3D view: drag to turn, right-drag or Shift-drag to move, scroll to zoom" role="img" />
      {failed && <div className="hb-y3d-fail" role="alert">This computer couldn't start 3D drawing (WebGL): {failed}</div>}
      {hasModels && scene.noteOrder.map((id, i) => (
        <button key={id} type="button" ref={(el) => { pinRefs.current[id] = el; }} className="hb-y3d-pin"
          data-open={m.openNote === id ? 'true' : undefined} style={{ display: 'none' }}
          title={scene.notes[id].text || 'Empty note'} aria-label={`Note ${i + 1}: ${scene.notes[id].text || 'empty'}`}
          onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}
          onClick={() => m.setOpenNote(m.openNote === id ? null : id)}>{i + 1}</button>
      ))}
      {a && b && (
        <div ref={labelRef} className="hb-y3d-measure" role="status">{niceNumber(measureLength(a, b))}</div>
      )}
    </div>
  );
}
