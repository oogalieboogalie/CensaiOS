import React from 'react';
import { useWriters } from '../../lib/collaboration/useWriters.js';
import { writerColors, writerList } from '../../../shared/collab/typedBy.js';

// "Who typed what" in a Document (or any window's shared words, by `field`,
// like the Teleprompter script): the words with each person's part tinted
// in a colour of their own (no two writers share one), and a row of names
// that says how many letters each one wrote. Letters from before this was kept,
// or from a file, show plain as "not recorded".

const UNRECORDED = 'Not recorded';
const plural = (n) => `${n} ${n === 1 ? 'letter' : 'letters'}`;

export function WhoTypedWhat({ windowId, field = 'text' }) {
  const runs = useWriters(windowId, field);
  if (!runs) {
    return <div className="hb-who-note" data-who-typed="off">Who typed what shows when this board is shared live.</div>;
  }
  const people = writerList(runs);
  const colors = writerColors(people);
  const colorOf = (run) => (run.by ? colors.get(`${run.byId ?? ''}\u0000${run.by}`) : null);
  return (
    <div data-who-typed="on">
      <div className="hb-who-legend" role="list" aria-label="Who typed what">
        {people.map((p) => (
          <span key={p.key} role="listitem" className="hb-who-person" data-writer={p.name || ''}>
            <i className="hb-who-dot" style={p.name ? { '--who': colors.get(p.key) } : undefined} />
            {p.name || UNRECORDED} · {plural(p.letters)}
          </span>
        ))}
      </div>
      <div className="hb-who-text">
        {runs.map((run, i) => {
          const color = colorOf(run);
          return (
            <span key={i} className={color ? 'hb-who-run' : 'hb-who-run hb-who-plain'} data-typed-by={run.by || ''}
              title={run.by ? `Typed by ${run.by}` : UNRECORDED} style={color ? { '--who': color } : undefined}>
              {run.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
