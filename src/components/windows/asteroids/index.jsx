/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { windowMeta } from './meta.js';
import { useAsteroids } from './useAsteroids.js';
import { AsteroidsOverlay } from './AsteroidsOverlay.jsx';

export { windowMeta };

function Lives({ count }) {
  return (
    <span className="hb-game-lives" aria-label={`${count} lives`}>
      {Array.from({ length: Math.min(count, 6) }, (_, i) => (
        <svg key={i} width="8" height="10" viewBox="0 0 8 10" aria-hidden="true"><path d="M4 0.5 L7.5 9.5 L4 7.5 L0.5 9.5 Z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /></svg>
      ))}
    </span>
  );
}

function Hud({ view, selfId }) {
  if (!view.ships.length || (view.role === 'idle' && !view.live)) return null;
  return (
    <div className="hb-game-hud" data-testid="game-hud">
      {view.ships.map((ship) => (
        <span key={ship.id} className="hb-game-hud-player" data-self={ship.id === selfId ? 'true' : undefined}>
          <span className="hb-game-hud-name">{ship.id === selfId ? 'You' : ship.name}</span>
          <span className="hb-game-num">{ship.score.toLocaleString()}</span>
          <Lives count={ship.lives} />
        </span>
      ))}
      {view.wave > 0 && <span className="hb-game-wave">Wave {view.wave}</span>}
    </div>
  );
}

/**
 * Asteroids (spec 11). Click to play; the window then owns the keyboard
 * until Escape. Anyone on the board can join the match, guests with a view
 * or comment link watch it, and the high-score table is shared.
 */
export function AsteroidsWindow({ win = {}, onUpdate }) {
  const game = useAsteroids({ win, onUpdate });
  const { view, sound, setSound } = game;
  const { selfId, selfName } = game;
  const inMatch = view.role === 'host' || view.role === 'player';
  const players = view.ships.length;
  const subtitle = inMatch
    ? (players > 1 ? `${players} playing` : 'Playing')
    : (view.live && view.hostName ? `${view.hostName} is playing` : 'Games');

  return (
    <>
      <WindowTitle
        icon={<Icon.Gamepad size={14} />}
        label={win.title || windowMeta.label}
        subtitle={subtitle}
        actions={[
          { id: 'sound', label: null, title: sound.muted ? 'Sound off' : 'Sound on', pressed: !sound.muted,
            icon: sound.muted ? <Icon.SpeakerOff size={14} /> : <Icon.Speaker size={14} />,
            onSelect: () => setSound({ muted: !sound.muted, volume: sound.muted && sound.volume === 0 ? 0.6 : sound.volume }) },
          { id: 'fullscreen', label: null, title: 'Full screen', icon: <Icon.Fullscreen size={14} />, onSelect: game.fullScreen },
        ]}
        menu={inMatch ? [{ id: 'leave', label: 'Leave match', onSelect: game.leave }] : undefined}
      />
      <div ref={game.containerRef} className="hb-game" tabIndex={-1} data-testid="asteroids" data-game-role={view.role} data-captured={game.captured ? 'true' : undefined}
        onPointerDown={(e) => { if (inMatch && !game.captured && e.target === game.canvasRef.current) game.capture(); }}>
        <canvas ref={game.canvasRef} className="hb-game-canvas" aria-label="Asteroids playing field" />
        <Hud view={view} selfId={selfId} />
        <AsteroidsOverlay view={view} captured={game.captured} canPlay={game.canPlay} onPlay={game.capture} onLeave={game.leave}
          highScores={win.highScores || []} sound={sound} setSound={setSound} selfId={selfId} selfName={selfName} />
      </div>
    </>
  );
}
