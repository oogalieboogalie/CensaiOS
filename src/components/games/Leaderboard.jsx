/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

/** A board's high-score table (spec 11). Same for everyone on the board. */
export function Leaderboard({ rows = [], limit = 5, highlight }) {
  const shown = (Array.isArray(rows) ? rows : []).slice(0, limit);
  return (
    <div className="hb-game-board" data-testid="game-leaderboard">
      <div className="hb-game-board-head">High scores on this board</div>
      {shown.length === 0
        ? <div className="hb-game-muted">No scores yet. Be the first.</div>
        : (
          <ol>
            {shown.map((row, i) => (
              <li key={`${row.name}-${row.score}-${row.at}`} data-self={highlight && row.name === highlight ? 'true' : undefined}>
                <span className="hb-game-rank">{i + 1}</span>
                <span className="hb-game-board-name">{row.name}</span>
                <span className="hb-game-num">{row.score.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}
