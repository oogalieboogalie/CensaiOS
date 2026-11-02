/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { estimateCost, formatCost, formatMs, tokensPerSecond } from '../../../lib/modelArena/arenaCatalog.js';

export function hasFinishedLane(results) {
  return Array.isArray(results) && results.some((result) => result?.status === 'done');
}

// Length is the size of the number. Lower-is-better rows are not flipped into a score.
const MEASURES = [
  { id: 'first', label: 'First word', note: 'lower is better', read: (entry) => entry.result?.firstTokenMs, format: formatMs },
  { id: 'total', label: 'Finished', note: 'lower is better', read: (entry) => entry.result?.totalMs, format: formatMs },
  { id: 'speed', label: 'Speed', note: 'higher is better', read: (entry) => tokensPerSecond(entry.result), format: (value) => `${Math.round(value)} tok/s` },
  { id: 'cost', label: 'Cost', note: 'lower is better', read: (entry) => estimateCost(entry.lane?.provider, entry.lane?.model, entry.result?.usage), format: formatCost },
];

function shown(measure, value) {
  if (Number.isFinite(value)) return measure.format(value);
  return measure.id === 'cost' ? formatCost(null) : '—';
}

function finishedEntries(lanes, results, labelOf) {
  return (Array.isArray(lanes) ? lanes : []).map((lane, index) => ({
    lane,
    index,
    result: results?.[index],
    label: labelOf(lane, index),
  })).filter((entry) => entry.result?.status === 'done');
}

/** A column of horizontal lines beside the models. It does not pick a winner. */
export function ArenaCompare({ lanes = [], results = [], labelOf }) {
  const nameOf = labelOf || ((lane, index) => lane?.model || `Model ${index + 1}`);
  const entries = finishedEntries(lanes, results, nameOf);
  if (!entries.length) return null;
  return (
    <section className="hb-arena-lane hb-arena-compare" aria-label="How the models compare">
      <p className="hb-arena-label">How they compare</p>
      <ul className="hb-arena-compare-key">
        {entries.map((entry) => (
          <li key={entry.index}>
            <span className="hb-arena-compare-swatch" data-lane={entry.index} aria-hidden="true" />
            {entry.label}
          </li>
        ))}
      </ul>
      {MEASURES.map((measure) => {
        const values = entries.map((entry) => measure.read(entry));
        const finiteValues = values.filter((value) => Number.isFinite(value));
        const max = finiteValues.length ? Math.max(...finiteValues) : 0;
        return (
          <div key={measure.id} className="hb-arena-compare-measure" data-measure={measure.id}>
            <p className="hb-arena-compare-label">
              {measure.label} <span className="hb-arena-compare-note">{measure.note}</span>
            </p>
            {entries.map((entry, row) => {
              const value = values[row];
              const finite = Number.isFinite(value);
              const width = finite && max > 0 ? (value / max) * 100 : 0;
              return (
                <div key={entry.index} className="hb-arena-compare-line">
                  <div className="hb-arena-compare-track" aria-hidden="true">
                    {finite && max > 0 && (
                      <div className="hb-arena-compare-bar" data-lane={entry.index} style={{ width: `${width}%` }} />
                    )}
                  </div>
                  <span className="hb-arena-compare-num">{shown(measure, value)}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}
