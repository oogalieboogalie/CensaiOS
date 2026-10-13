/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../../Icons.jsx';
import { ADJUSTMENTS, BLENDS, PRESETS } from '../../../lib/creative/photoModel.js';
import { INK } from '../../../lib/creative/creativeColors.js';
import { Slider } from '../Slider.jsx';

function LayerRow({ id, layer, active, onSelect, onToggle }) {
  return (
    <li className="hb-cr-layer" data-active={active ? 'true' : undefined}>
      <button type="button" className="hb-of-mini" aria-label={layer.visible === false ? `Show ${layer.name}` : `Hide ${layer.name}`}
        aria-pressed={layer.visible !== false} onClick={onToggle}>
        <Icon.Eye size={11} />
      </button>
      <button type="button" className="hb-cr-layer-name" aria-current={active ? 'true' : undefined} onClick={onSelect}>
        <span className="hb-cr-layer-kind">{layer.kind === 'text' ? 'T' : <span className="hb-cr-layer-thumb" style={layer.src ? { backgroundImage: `url(${layer.src})` } : undefined} />}</span>
        <span className="hb-cr-ellipsis">{layer.name}</span>
      </button>
    </li>
  );
}

/** Layers on top, then the selected layer's settings and adjustments. */
export function PhotoPanel({ p }) {
  const { doc, layer, current } = p;
  const top = [...doc.order].reverse();
  const adj = layer?.adj || {};
  const setAdj = (k, v) => p.setLayer(current, { adj: { ...adj, [k]: v } });
  return (
    <aside className="hb-cr-panel" aria-label="Layers and adjustments">
      <section className="hb-cr-section">
        <header className="hb-cr-section-head">
          <span>Layers</span>
          <span className="hb-cr-row">
            <button type="button" className="hb-of-mini" aria-label="New layer" title="New layer" onClick={() => p.addLayer()}><Icon.Plus size={10} /></button>
            <button type="button" className="hb-of-mini" aria-label="Duplicate layer" title="Duplicate layer" disabled={!layer} onClick={p.duplicate}><Icon.Copy size={10} /></button>
            <button type="button" className="hb-of-mini" aria-label="Move layer up" title="Move up" disabled={!layer} onClick={() => p.move(current, 1)}><Icon.Up size={10} /></button>
            <button type="button" className="hb-of-mini" aria-label="Move layer down" title="Move down" disabled={!layer} onClick={() => p.move(current, -1)}><Icon.Down size={10} /></button>
            <button type="button" className="hb-of-mini" aria-label="Delete layer" title="Delete layer" disabled={!layer || doc.order.length < 2} onClick={() => p.remove()}><Icon.Close size={10} /></button>
          </span>
        </header>
        <ul className="hb-cr-layers">
          {top.map((id) => (
            <LayerRow key={id} id={id} layer={doc.layers[id]} active={id === current}
              onSelect={() => p.select(id)} onToggle={() => p.setLayer(id, { visible: doc.layers[id].visible === false })} />
          ))}
        </ul>
      </section>
      {layer && (
        <section className="hb-cr-section">
          <label className="hb-cr-field"><span>Name</span>
            <input className="hb-cr-input" value={layer.name} aria-label="Layer name" onChange={(e) => p.setLayer(current, { name: e.target.value })} />
          </label>
          <label className="hb-cr-field"><span>Blend</span>
            <select className="hb-of-select" aria-label="Blend mode" value={layer.blend || 'source-over'} onChange={(e) => p.setLayer(current, { blend: e.target.value })}>
              {Object.entries(BLENDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <Slider label="Opacity" min={0} max={100} unit="%" value={Math.round((layer.opacity ?? 1) * 100)} onChange={(v) => p.setLayer(current, { opacity: v / 100 })} />
          {layer.kind === 'text' && (
            <>
              <textarea className="hb-cr-input hb-cr-textarea" aria-label="Text" value={layer.text} onChange={(e) => p.setLayer(current, { text: e.target.value })} />
              <div className="hb-cr-row">
                <input type="color" className="hb-cr-color" aria-label="Text color" value={layer.color || INK} onChange={(e) => p.setLayer(current, { color: e.target.value })} />
                <button type="button" className="hb-of-mini" aria-pressed={(layer.weight || 600) >= 600} aria-label="Bold text" onClick={() => p.setLayer(current, { weight: (layer.weight || 600) >= 600 ? 400 : 700 })}><strong>B</strong></button>
              </div>
              <Slider label="Size" min={8} max={400} unit="px" value={layer.size || 64} onChange={(v) => p.setLayer(current, { size: v })} />
            </>
          )}
        </section>
      )}
      {layer && (
        <section className="hb-cr-section">
          <header className="hb-cr-section-head"><span>Adjust</span>
            <button type="button" className="hb-of-mini" onClick={() => p.setLayer(current, { adj: {} })}>Reset</button>
          </header>
          <div className="hb-cr-presets" role="group" aria-label="Filters">
            {Object.entries(PRESETS).map(([k, preset]) => (
              <button key={k} type="button" className="hb-cr-chip" onClick={() => p.setLayer(current, { adj: { ...preset.adj } })}>{preset.label}</button>
            ))}
          </div>
          {ADJUSTMENTS.map(([k, label, min, max]) => (
            <Slider key={k} label={label} min={min} max={max} value={Number(adj[k]) || 0} unit={k === 'blur' ? 'px' : k === 'hue' ? '°' : ''} onChange={(v) => setAdj(k, v)} />
          ))}
        </section>
      )}
    </aside>
  );
}
