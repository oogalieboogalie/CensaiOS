import React from 'react';

// A Writer paragraph you are not typing in shows its words with their marks
// turned into bold, links and so on, so a teammate's cursor can't be drawn
// at the exact letter there. Instead each teammate typing in it gets a small
// name tag in their colour at the paragraph's right edge. Click into the
// paragraph and their cursor shows right at the letter (TeammateCarets.jsx).
export function TeammatesHere({ carets }) {
  if (!carets.length) return null;
  return (
    <div className="hb-of-here" aria-label={`${carets.map((c) => c.name).join(', ')} typing here`}>
      {carets.map((c) => (
        <span key={c.clientId} className="hb-of-here-tag" data-teammate-caret={c.name} data-at={c.index}
          style={{ '--caret-color': c.color }}>{c.name}</span>
      ))}
    </div>
  );
}
