/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

const AUTO = '__auto__';
const keyOf = (c) => `${c.provider}|${c.model}`;

/** Pick the scout's model: Auto (cheapest fast model you have a key for) or any model with a key. */
export function ScoutModelPicker({ model, choices, busy, onPick }) {
  const usable = choices.filter((c) => c.hasKey);
  const current = model.auto ? AUTO : `${model.provider}|${model.model}`;
  const autoLabel = model.auto && model.provider ? `Auto: ${model.label}` : 'Auto: cheapest fast model you have a key for';
  return (
    <div className="hb-scout-model">
      <select className="hb-aep-input" data-testid="scout-model" value={current} disabled={busy}
        aria-label="Scout model"
        onChange={(e) => onPick(e.target.value === AUTO ? null : usable.find((c) => keyOf(c) === e.target.value))}>
        <option value={AUTO}>{autoLabel}</option>
        {!model.auto && !usable.some((c) => keyOf(c) === current) && <option value={current}>{model.label}</option>}
        {usable.map((c) => <option key={keyOf(c)} value={keyOf(c)}>{c.provider === 'ollama' ? c.label : `${c.label} (${c.provider})`}</option>)}
      </select>
      <div className="hb-aep-hint" data-testid="scout-model-note">
        {!model.provider ? model.reason : model.provider === 'ollama' ? `The scout runs on ${model.label}.` : `The scout runs on ${model.label}, on your own key.`}
        {model.provider && model.reason ? ` ${model.reason}` : ''}
      </div>
    </div>
  );
}

export function MapSummary({ map }) {
  if (!map) return null;
  const { stats } = map;
  return (
    <div className="hb-scout-map" data-testid="scout-map">
      <div className="hb-scout-stats">
        <span><b>{stats.files.toLocaleString()}</b> files</span>
        <span><b>{stats.symbols.toLocaleString()}</b> functions and parts</span>
        <span><b>{stats.links.toLocaleString()}</b> links</span>
      </div>
      <div className="hb-aep-hint">
        {stats.lastRefresh?.firstLook ? 'First look' : 'Fresh look'}: read {stats.lastRefresh?.filesRead ?? 0} changed file(s) in {stats.lastRefresh?.ms ?? 0} ms.
      </div>
      <div className="hb-aep-label">Most used files</div>
      <ul className="hb-scout-list">
        {map.hubs.slice(0, 6).map((h) => <li key={h.path}><code>{h.path}</code><span>used by {h.usedBy}</span></li>)}
      </ul>
    </div>
  );
}

export function FindResult({ result }) {
  if (!result) return null;
  if (!result.found) return <div className="hb-aep-empty" data-testid="scout-result">{result.note}</div>;
  const others = result.candidates.filter((c) => c.path !== result.file).slice(0, 4);
  return (
    <div className="hb-scout-result" data-testid="scout-result">
      <div className="hb-scout-spot">
        <code data-testid="scout-spot">{result.file}:{result.line}:{result.column}</code>
        <span className="hb-aep-tag">{result.pickedBy === 'model' ? `picked by ${result.model}` : 'from the map'}</span>
      </div>
      <div className="hb-scout-why">{result.reason}</div>
      {result.lineText && <pre className="hb-scout-line">{result.lineText}</pre>}
      {result.modelError && <div className="hb-aep-hint">{result.modelError}</div>}
      <div className="hb-aep-label">Also check (they use this file)</div>
      <div className="hb-scout-also">{result.alsoCheck.usedBy.length ? result.alsoCheck.usedBy.slice(0, 8).join(', ') : 'Nothing uses it.'}</div>
      {result.alsoCheck.tests.length > 0 && (
        <><div className="hb-aep-label">Tests to run</div><div className="hb-scout-also">{result.alsoCheck.tests.join(', ')}</div></>
      )}
      {others.length > 0 && (
        <><div className="hb-aep-label">Other places it looked</div>
          <div className="hb-scout-also">{others.map((c) => `${c.path}:${c.line}`).join(', ')}</div></>
      )}
    </div>
  );
}
