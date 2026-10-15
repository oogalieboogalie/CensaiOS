/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { formatCost, formatMs } from '../../../lib/modelArena/arenaCatalog.js';

const LEADS = [
  ['fastRight', 'Fast and right'],
  ['picked', 'Most picked'],
  ['accurate', 'Most often right'],
  ['firstWord', 'First to answer'],
  ['finish', 'Fastest finish'],
  ['cheapest', 'Cheapest'],
];

const percent = (value) => (value === null ? '—' : `${Math.round(value * 100)}%`);

/** One row per model across every recorded run, with who leads what. */
export function ModelTable({ table, ahead, labelOf }) {
  return (
    <div className="hb-bench-table-wrap">
      <table className="hb-bench-table">
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col" title="How fast it runs and stays right: typical finish time, counting only answers marked right (or picked best)">Fast and right</th>
            <th scope="col" title="Answers marked right (or picked best), out of the ones marked">Right</th>
            <th scope="col" title="Typical time until the whole reply was in, right or not">Finished</th>
            <th scope="col" title="How many recorded runs this model raced in">Raced</th>
            <th scope="col" title="How often a person picked its answer as best (the judge's picks in brackets)">Picked best</th>
            <th scope="col" title="Typical time until the first word arrived">First word</th>
            <th scope="col" title="Average reply tokens a second">Speed</th>
            <th scope="col" title="Average estimated cost of one reply">Cost</th>
          </tr>
        </thead>
        <tbody>
          {table.map((row) => {
            const leads = LEADS.filter(([key]) => ahead[key] === row.id).map(([, label]) => label);
            const marked = row.right + row.wrong;
            return (
              <tr key={row.id}>
                <th scope="row">
                  <span className="hb-bench-model">{labelOf(row.provider, row.model)}</span>
                  {leads.length > 0 && (
                    <span className="hb-arena-badges">{leads.map((l) => <span key={l} className="hb-arena-badge">{l}</span>)}</span>
                  )}
                </th>
                <td className="hb-bench-headline">{formatMs(row.fastRightMs)}</td>
                <td>{marked ? `${percent(row.accuracy)} of ${marked}` : '—'}</td>
                <td>{formatMs(row.medianTotalMs)}</td>
                <td>{row.runs}{row.errors ? <span className="hb-arena-hint"> ({row.errors} failed)</span> : null}</td>
                <td>{row.picks}{row.judgePicks ? <span className="hb-arena-hint"> ({row.judgePicks})</span> : null}</td>
                <td>{formatMs(row.medianFirstMs)}</td>
                <td>{row.averageSpeed ? `${Math.round(row.averageSpeed)} tok/s` : '—'}</td>
                <td>{row.averageCost === null ? '—' : formatCost(row.averageCost)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
