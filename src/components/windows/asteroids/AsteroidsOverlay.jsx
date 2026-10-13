/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Leaderboard } from '../../games/Leaderboard.jsx';

function Controls() {
  return (
    <div className="hb-game-keys">
      <span><span className="hb-kbd">←</span> <span className="hb-kbd">→</span> turn</span>
      <span><span className="hb-kbd">↑</span> thrust</span>
      <span><span className="hb-kbd">Space</span> fire</span>
      <span><span className="hb-kbd">Esc</span> pause</span>
    </div>
  );
}

function Volume({ sound, setSound }) {
  return (
    <label className="hb-game-volume" data-no-drag>
      <span>Sound</span>
      <input type="range" min="0" max="1" step="0.05" value={sound.muted ? 0 : sound.volume} aria-label="Volume"
        onChange={(e) => setSound({ volume: Number(e.target.value), muted: Number(e.target.value) === 0 })} />
    </label>
  );
}

/** Everything drawn over the playing field: click to play, pause, results. */
export function AsteroidsOverlay({ view, captured, canPlay, onPlay, onLeave, highScores, sound, setSound, selfId, selfName }) {
  if (captured) return null;
  const inMatch = view.role === 'host' || view.role === 'player';
  const watching = !inMatch && view.live && view.hostName;

  if (watching && !view.results) {
    return (
      <div className="hb-game-bar" data-testid="game-watch-bar">
        <span className="hb-game-dot" aria-hidden="true" />
        <span><strong>{view.hostName}</strong> is playing</span>
        {canPlay
          ? <button type="button" className="hb-btn" data-primary="true" data-testid="game-join" onClick={onPlay}>Join</button>
          : <span className="hb-game-muted">Watching</span>}
      </div>
    );
  }

  let title = 'Asteroids';
  let body = null;
  let action = canPlay ? 'Click to play' : null;
  if (inMatch) {
    title = view.paused ? 'Paused' : 'You stepped away';
    body = view.paused ? 'The match waits for you.' : 'Your ship coasts while the others keep playing.';
    action = 'Resume';
  } else if (view.results) {
    title = 'Game over';
    action = canPlay ? 'Play again' : null;
  } else if (!canPlay) {
    body = 'Nobody is playing right now. When someone starts a match you can watch it here.';
  }

  return (
    <div className="hb-game-scrim" data-testid="game-overlay" onClick={action ? onPlay : undefined}>
      <div className="hb-game-card" onClick={(e) => e.stopPropagation()} data-no-drag>
        <div className="hb-game-title">{title}</div>
        {body && <p className="hb-game-body">{body}</p>}
        {view.results && (
          <ol className="hb-game-results" data-testid="game-results">
            {view.results.map((row) => (
              <li key={row.id} data-self={row.id === selfId ? 'true' : undefined}><span>{row.id === selfId ? 'You' : row.name}</span><span className="hb-game-num">{row.score.toLocaleString()}</span></li>
            ))}
          </ol>
        )}
        {action && (
          <button type="button" className="hb-btn" data-primary="true" data-testid="game-play" onClick={onPlay} autoFocus>{action}</button>
        )}
        {!inMatch && <Leaderboard rows={highScores} limit={view.results ? 10 : 5} highlight={selfName} />}
        <div className="hb-game-foot">
          {canPlay && <Controls />}
          <Volume sound={sound} setSound={setSound} />
        </div>
        {inMatch && <button type="button" className="hb-game-link" onClick={onLeave}>Leave match</button>}
      </div>
    </div>
  );
}
