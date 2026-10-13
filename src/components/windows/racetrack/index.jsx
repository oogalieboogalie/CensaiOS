/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { useWorkspaceStore } from '../../../lib/store.js';
import { pickTrackStroke, sampleTrack } from '../../../lib/games/racetrack/track.js';
import { formatLap } from '../../../lib/games/racetrack/laps.js';
import { windowMeta } from './meta.js';
import { useRacetrack } from './useRacetrack.js';

export { windowMeta };

function Controls() {
  return (
    <div className="hb-game-keys">
      <span><span className="hb-kbd">↑</span> <span className="hb-kbd">↓</span> drive, brake</span>
      <span><span className="hb-kbd">←</span> <span className="hb-kbd">→</span> steer</span>
      <span><span className="hb-kbd">Space</span> handbrake</span>
      <span><span className="hb-kbd">R</span> reset</span>
      <span><span className="hb-kbd">Esc</span> stop</span>
    </div>
  );
}

function BestLaps({ rows, selfName }) {
  return (
    <div className="hb-game-board" data-testid="race-best-laps">
      <div className="hb-game-board-head">Best laps on this board</div>
      {rows.length === 0
        ? <div className="hb-game-muted">No laps yet. Set the first time.</div>
        : (
          <ol>
            {rows.map((row, i) => (
              <li key={`${row.name}-${row.ms}`} data-self={row.name === selfName ? 'true' : undefined}>
                <span className="hb-game-rank">{i + 1}</span>
                <span className="hb-game-board-name">{row.name}</span>
                <span className="hb-game-num">{formatLap(row.ms / 1000)}</span>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}

function Hud({ hud, flash, captured }) {
  const showFlash = flash && performance.now() - flash.at < 2200;
  return (
    <>
      <div className="hb-race-hud" data-testid="race-hud">
        <span className="hb-race-stat"><span className="hb-race-key">Lap</span><span className="hb-game-num">{hud.lap || '–'}</span></span>
        <span className="hb-race-stat"><span className="hb-race-key">Time</span><span className="hb-game-num" data-testid="race-time">{hud.started ? formatLap(hud.time) : '0.000'}</span></span>
        <span className="hb-race-stat"><span className="hb-race-key">Last</span><span className="hb-game-num">{hud.last === null ? '–' : formatLap(hud.last)}</span></span>
        <span className="hb-race-stat" data-best="true"><span className="hb-race-key">Best</span><span className="hb-game-num" data-testid="race-best">{hud.best === null ? '–' : formatLap(hud.best)}</span></span>
        {hud.rivals.length > 0 && <span className="hb-race-rivals">{hud.rivals.length + 1} on track</span>}
      </div>
      {captured && !hud.started && <div className="hb-race-tip">Cross the start line to start the clock</div>}
      {captured && hud.started && hud.offRoad && <div className="hb-race-tip" data-tone="warn">Off the road</div>}
      {showFlash && <div className="hb-race-flash" data-best={flash.best ? 'true' : undefined}>{flash.best ? 'Best lap ' : 'Lap '}{formatLap(flash.lap)}</div>}
    </>
  );
}

function NoTrack({ onUseBoard, onSample, note }) {
  return (
    <div className="hb-game-scrim" data-testid="race-empty">
      <div className="hb-game-card" data-no-drag>
        <div className="hb-game-title">Draw a track</div>
        <p className="hb-game-body">Pick the pen, draw one closed loop on the board, select it and press <strong>Drive it</strong>. The line becomes the road; a thicker pen makes a wider road.</p>
        <button type="button" className="hb-btn" data-primary="true" onClick={onUseBoard}>Use a loop from the board</button>
        <button type="button" className="hb-btn" onClick={onSample}>Try a sample track</button>
        {note && <p className="hb-game-muted" role="status">{note}</p>}
      </div>
    </div>
  );
}

/**
 * Draw a track, drive a car. A loop drawn with the pen becomes a road and a
 * small car lines up on its start line. Click to drive; the window then owns
 * the keyboard until Escape. Everyone on the board sees every car.
 */
export function RacetrackWindow({ win = {}, onUpdate }) {
  const game = useRacetrack({ win, onUpdate });
  const [note, setNote] = React.useState(null);
  const { hud, track } = game;

  const useBoard = () => {
    const picked = pickTrackStroke(useWorkspaceStore.getState().paths || []);
    if (!picked) { setNote('No closed loop on the board yet. Draw one with the pen first.'); return; }
    onUpdate?.({ track: picked.track, source: { pathIds: [picked.stroke.id] } });
  };
  const useSample = () => onUpdate?.({ track: sampleTrack(), source: null });
  const subtitle = hud.rivals.length ? `${hud.rivals.length + 1} driving` : (track ? 'Drawn track' : 'Games');

  return (
    <>
      <WindowTitle
        icon={<Icon.Car size={14} />}
        label={win.title || windowMeta.label}
        subtitle={subtitle}
        actions={[
          track && { id: 'reset', label: null, title: 'Back to the start line (R)', icon: <Icon.Refresh size={14} />, onSelect: game.restart },
          { id: 'fullscreen', label: null, title: 'Full screen', icon: <Icon.Fullscreen size={14} />, onSelect: game.fullScreen },
        ]}
        menu={[
          { id: 'board', label: 'New track from the board', onSelect: useBoard },
          { id: 'sample', label: 'Sample track', onSelect: useSample },
        ]}
      />
      <div ref={game.containerRef} className="hb-game hb-race" tabIndex={-1} data-testid="racetrack" data-captured={game.captured ? 'true' : undefined}
        onPointerDown={(e) => { if (track && !game.captured && e.target === game.canvasRef.current) game.capture(); }}>
        <canvas ref={game.canvasRef} className="hb-game-canvas" aria-label="Race track" />
        {track && <Hud hud={hud} flash={game.flash} captured={game.captured} />}
        {!track && <NoTrack onUseBoard={useBoard} onSample={useSample} note={note} />}
        {track && !game.captured && (
          <div className="hb-game-scrim" data-testid="race-overlay" onClick={game.canPlay ? game.capture : undefined}>
            <div className="hb-game-card" onClick={(e) => e.stopPropagation()} data-no-drag>
              <div className="hb-game-title">{hud.laps > 0 ? 'Pit stop' : 'Ready to drive'}</div>
              {!game.canPlay && <p className="hb-game-body">You can watch the race. Ask for an edit link to drive.</p>}
              {game.canPlay && <button type="button" className="hb-btn" data-primary="true" data-testid="race-drive" onClick={game.capture} autoFocus>{hud.laps > 0 || hud.started ? 'Keep driving' : 'Click to drive'}</button>}
              <BestLaps rows={Array.isArray(win.bestLaps) ? win.bestLaps : []} selfName={game.selfName} />
              {game.canPlay && <div className="hb-game-foot"><Controls /></div>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
