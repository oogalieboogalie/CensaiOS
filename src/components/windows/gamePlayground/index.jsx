/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { windowMeta } from './meta.js';
import { usePlayground, readDropped } from './usePlayground.js';
import { Picker } from './Picker.jsx';
import { engineLabel, sampleById } from '../../../lib/games/playground/catalog.js';

export { windowMeta };

/** The card over a chosen game that isn't running here yet. */
function ReadyCard({ game }) {
  const { record } = game;
  const sample = record.source.type === 'sample' ? sampleById(record.source.id) : null;
  const needsCopy = record.source.type === 'local' && !game.hasLocal;
  const who = record.by && record.by !== game.selfName ? record.by : null;
  return (
    <div className="hb-game-scrim" data-testid="playground-ready" onClick={needsCopy ? undefined : game.start}>
      <div className="hb-game-card" onClick={(e) => e.stopPropagation()} data-no-drag>
        <div className="hb-play-card-head">
          <span className="hb-game-title">{record.title}</span>
          <span className="hb-play-engine" data-engine={record.engine}>{engineLabel(record.engine)}</span>
        </div>
        {needsCopy ? (
          <p className="hb-game-body">
            {who ? `${who} opened this game from their computer.` : 'This game was opened from another computer.'} Its files stay there,
            so open your own copy of <strong>{record.source.name}</strong> to play along.
          </p>
        ) : (
          <p className="hb-game-body">
            {who ? `${who} picked this game. ` : ''}Everyone runs their own copy, so play alongside each other.
          </p>
        )}
        {sample?.keys && <p className="hb-game-muted">{sample.keys} Esc gives the keyboard back.</p>}
        {!needsCopy && <button type="button" className="hb-btn" data-primary="true" data-testid="playground-play" onClick={game.start}>Click to play</button>}
        <button type="button" className="hb-game-link" onClick={() => game.setPicking(true)}>{needsCopy ? 'Open a game' : 'Choose another game'}</button>
      </div>
    </div>
  );
}

/**
 * Game Playground: LÖVE games through love.js, Three.js scenes and Godot or
 * any other HTML5 export, each in a sandboxed frame inside the window. The
 * chosen game is shared on the window record; each viewer runs their own
 * copy. While the game has focus it owns the keyboard; Escape gives it back.
 */
export function GamePlaygroundWindow({ win = {}, onUpdate }) {
  const game = usePlayground({ win, onUpdate });
  const { record, running } = game;
  const [dragging, setDragging] = React.useState(false);
  const showPicker = !record || game.picking;

  const onDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const list = await readDropped(e.dataTransfer);
    if (list.length) {
      const first = list[0].path.split('/')[0];
      game.chooseFiles(list, list.length > 1 ? first : list[0].path);
    }
  };

  const subtitle = record ? `${record.title} · ${engineLabel(record.engine)}` : 'Games';
  const actions = running ? [
    { id: 'restart', label: null, title: 'Restart', icon: <Icon.Refresh size={14} />, onSelect: game.restart },
    { id: 'fullscreen', label: null, title: 'Full screen', icon: <Icon.Fullscreen size={14} />, onSelect: game.fullScreen },
  ] : undefined;
  const menu = [
    record && { id: 'choose', label: 'Choose another game', onSelect: () => { game.stop(); game.setPicking(true); } },
    record?.source.type === 'url' && { id: 'tab', label: 'Open in a new tab', onSelect: () => window.open(record.source.url, '_blank', 'noopener,noreferrer') },
    running && { id: 'stop', label: 'Stop the game', onSelect: game.stop },
  ].filter(Boolean);

  return (
    <>
      <WindowTitle icon={<Icon.Gamepad size={14} />} label={win.title || windowMeta.label} subtitle={subtitle} actions={actions} menu={menu.length ? menu : undefined} />
      <div ref={game.containerRef} className="hb-game hb-play" tabIndex={-1} data-testid="game-playground"
        data-running={running ? 'true' : undefined} data-captured={game.captured ? 'true' : undefined} data-dragging={dragging ? 'true' : undefined}
        onDragOver={(e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={onDrop}>
        {running && game.frameProps && !game.picking && (
          <iframe key={game.runKey} ref={game.frameRef} className="hb-play-frame" title={record?.title || 'Game'}
            src={game.frameProps.src} sandbox={game.frameProps.sandbox} allow="fullscreen; gamepad; autoplay"
            referrerPolicy="no-referrer" data-testid="playground-frame" />
        )}
        {showPicker && <Picker game={game} onCancel={record && game.picking ? () => game.setPicking(false) : null} />}
        {!showPicker && !running && <ReadyCard game={game} />}
        {running && !game.picking && game.status && <div className="hb-play-status" role="status">{game.status}</div>}
        {running && !game.picking && game.error && (
          <div className="hb-game-scrim" data-testid="playground-error">
            <div className="hb-game-card" data-no-drag>
              <span className="hb-game-title">The game stopped</span>
              <p className="hb-game-body">{game.error}</p>
              <button type="button" className="hb-btn" data-primary="true" onClick={game.restart}>Restart</button>
              <button type="button" className="hb-game-link" onClick={() => { game.stop(); game.setPicking(true); }}>Choose another game</button>
            </div>
          </div>
        )}
        {running && !game.picking && !game.error && !game.captured && (
          <button type="button" className="hb-game-bar hb-play-bar" data-testid="playground-focus" onClick={game.focusGame}>
            <span className="hb-game-dot" aria-hidden="true" />
            Click the game to play. <span className="hb-kbd">Esc</span> gives the keyboard back.
          </button>
        )}
        {dragging && <div className="hb-play-drop" aria-hidden="true">Drop to play</div>}
      </div>
    </>
  );
}
