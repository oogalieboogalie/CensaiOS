import React from 'react';

// Who else is typing in a board Spreadsheet cell: the cell gets a border in
// the first teammate's colour, and each name sits on a small tag at the
// cell's top edge (src/lib/collaboration/cellSpots.js). Nothing when nobody is.

/** Props that outline a cell for the teammates typing in it. */
export function teammateCellProps(people) {
  if (!people?.length) return {};
  return { 'data-teammate': 'true', style: { '--caret-color': people[0].color } };
}

export function CellTeammates({ people }) {
  if (!people?.length) return null;
  return (
    <span className="hb-sheet-teammates">
      {people.map((p) => (
        <span key={p.clientId} className="hb-sheet-teammate" data-teammate-cell={p.name} style={{ '--caret-color': p.color }}>{p.name}</span>
      ))}
    </span>
  );
}
