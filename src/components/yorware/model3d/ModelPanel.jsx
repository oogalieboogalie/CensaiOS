/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { ModelIcon } from '../modelIcons.jsx';
import { ARRANGES, DEFAULT_PAINT, MAX_NOTE_LENGTH, SHADINGS } from '../../../lib/yorware/modelBoard.js';
import { MODEL_FORMATS, formatBytes } from '../../../lib/yorware/modelFiles.js';
import { sizeText, standBox, statsLine } from '../../../lib/yorware/modelMeasure.js';
import { NotesSection } from './ModelNotes.jsx';

const formatName = (f) => MODEL_FORMATS.find(([ext]) => ext === f)?.[1] || f.toUpperCase();

function ModelList({ m }) {
  const { scene, loaded } = m;
  return (
    <section className="hb-cr-section" aria-label="Models">
      <header className="hb-cr-section-head"><span>Models</span><span className="hb-cr-tag">{scene.order.length}</span></header>
      <ul className="hb-cr-layers">
        {scene.order.map((id) => {
          const show = scene.show[id];
          const state = loaded[id];
          return (
            <li key={id} className="hb-cr-layer" data-selected={id === m.currentId ? 'true' : undefined}>
              <button type="button" className="hb-of-btn hb-y3d-eye" aria-pressed={show.visible} title={show.visible ? 'Hide' : 'Show'}
                aria-label={`${show.visible ? 'Hide' : 'Show'} ${scene.models[id].name}`} onClick={() => m.setShow(id, { visible: !show.visible })}>
                {show.visible ? <ModelIcon.Eye /> : <ModelIcon.EyeOff />}
              </button>
              <button type="button" className="hb-cr-layer-name" onClick={() => m.setCurrent(id)}>
                <span className="hb-cr-ellipsis">{scene.models[id].name}</span>
                <span className="hb-cr-tag">{state?.error ? 'error' : state ? scene.models[id].format.toUpperCase() : 'opening…'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ModelInfo({ m }) {
  const id = m.currentId;
  const model = m.scene.models[id];
  if (!model) return null;
  const show = m.scene.show[id];
  const state = m.loaded[id];
  const box = standBox(state?.box, show.zUp);
  return (
    <section className="hb-cr-section" aria-label="This model">
      <header className="hb-cr-section-head"><span>This model</span></header>
      <div className="hb-y3d-name">{model.name}</div>
      <div className="hb-cr-hint">{formatName(model.format)} · {formatBytes(model.bytes)}{Object.keys(model.files).length > 1 ? ` · ${Object.keys(model.files).length} files` : ''}</div>
      {state?.error && <p className="hb-y3d-error" role="alert">{state.error}</p>}
      {state?.stats && <div className="hb-cr-num">{statsLine(state.stats)}</div>}
      {box && <div className="hb-cr-num" title="Width × depth × height, in the file's own units (3D printing files are usually millimetres)">Size {sizeText(box)}</div>}
      <label className="hb-cr-inline hb-y3d-check">
        <input type="checkbox" checked={show.zUp} onChange={(e) => m.setShow(id, { zUp: e.target.checked })} />
        <span>Z is up (most printer and CAD files)</span>
      </label>
      <div className="hb-cr-row">
        <span className="hb-cr-tag">Paint</span>
        <input type="color" className="hb-cr-color" aria-label="Paint this model one color" value={show.color || DEFAULT_PAINT}
          onChange={(e) => m.setShow(id, { color: e.target.value })} />
        {show.color && <button type="button" className="hb-cr-chip" onClick={() => m.setShow(id, { color: null })}>Own colors</button>}
      </div>
      <button type="button" className="hb-of-btn" data-wide="true" onClick={() => m.remove(id)}><ModelIcon.Trash /><span>Remove from viewer</span></button>
    </section>
  );
}

function LookSection({ m, onView }) {
  const { view } = m.scene;
  return (
    <section className="hb-cr-section" aria-label="Look">
      <header className="hb-cr-section-head"><span>Look</span><span className="hb-cr-tag">everyone sees this</span></header>
      <div className="hb-cr-presets" role="group" aria-label="Shading">
        {SHADINGS.map(([k, label]) => (
          <button key={k} type="button" className="hb-cr-chip" aria-pressed={view.shading === k} onClick={() => m.setView({ shading: k })}>{label}</button>
        ))}
      </div>
      <div className="hb-cr-presets" role="group" aria-label="Arrange">
        {ARRANGES.map(([k, label]) => (
          <button key={k} type="button" className="hb-cr-chip" aria-pressed={view.arrange === k} onClick={() => m.setView({ arrange: k })}>{label}</button>
        ))}
      </div>
      <label className="hb-cr-inline hb-y3d-check">
        <input type="checkbox" checked={view.grid} onChange={(e) => m.setView({ grid: e.target.checked })} /><span>Floor grid</span>
      </label>
      <header className="hb-cr-section-head"><span>Look from</span></header>
      <div className="hb-cr-presets" role="group" aria-label="Look from">
        {[['iso', 'Corner'], ['front', 'Front'], ['back', 'Back'], ['left', 'Left'], ['right', 'Right'], ['top', 'Top']].map(([k, label]) => (
          <button key={k} type="button" className="hb-cr-chip" onClick={() => onView(k)}>{label}</button>
        ))}
      </div>
    </section>
  );
}

/** The panel on the right: the models, the one you picked, the look, and the notes. */
export function ModelPanel({ m, onView }) {
  if (!m.scene.order.length) return null;
  return (
    <aside className="hb-cr-panel hb-y3d-panel" aria-label="Model details">
      <ModelList m={m} />
      <ModelInfo m={m} />
      <LookSection m={m} onView={onView} />
      <NotesSection m={m} maxLength={MAX_NOTE_LENGTH} />
    </aside>
  );
}
