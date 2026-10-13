/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { ITEMS, PACK_SLOTS } from '../../../lib/games/driftholm/save.js';
import { windowMeta } from './meta.js';
import { Fighting, ItemIcon, Pack, Skills } from './parts.jsx';
import { GAME_URL, useDriftholm } from './useDriftholm.js';

export { windowMeta, ItemIcon };

function Bank({ hud, command }) {
  const room = PACK_SLOTS - hud.pack.length;
  return (
    <div className="hb-drift-bank" data-testid="drift-bank" role="dialog" aria-label="Bank chest">
      <div className="hb-drift-bank-head">
        <span className="hb-drift-title">Bank chest</span>
        <button type="button" className="hb-icon-btn" aria-label="Close the bank" onClick={() => command('close_bank')}><Icon.Close size={14} /></button>
      </div>
      {hud.bank.length === 0
        ? <p className="hb-drift-muted">Nothing in the bank yet. Your logs, fish and hides are safe here.</p>
        : (
          <div className="hb-drift-bank-grid">
            {hud.bank.map(([id, count]) => (
              <div key={id} className="hb-drift-bank-item" data-testid={`drift-bank-${id}`}>
                <button type="button" className="hb-drift-slot" title={`Take one ${ITEMS[id]?.name}`} disabled={room === 0} onClick={() => command('withdraw', { item: id, n: 1 })}>
                  <ItemIcon id={id} />
                  <span className="hb-drift-count">{count.toLocaleString()}</span>
                </button>
                <button type="button" className="hb-drift-take" disabled={room === 0} onClick={() => command('withdraw', { item: id, n: count })}>All</button>
              </div>
            ))}
          </div>
        )}
      <div className="hb-drift-bank-foot">
        <button type="button" className="hb-btn" data-primary="true" data-testid="drift-deposit" disabled={hud.pack.length === 0} onClick={() => command('deposit_all')}>Deposit pack</button>
        <span className="hb-drift-muted">{room} free in your pack</span>
      </div>
    </div>
  );
}

function Log({ lines }) {
  const recent = lines.slice(-4);
  if (!recent.length) return null;
  return (
    <div className="hb-drift-log" data-testid="drift-log" aria-live="polite">
      {recent.map((line, i) => <div key={`${lines.length - recent.length + i}-${line}`} data-latest={i === recent.length - 1 ? 'true' : undefined}>{line}</div>)}
    </div>
  );
}

/**
 * Driftholm: a slow island game in a window. Chop pine and birch, fish the
 * shallows, fight the cows, cook at the fire pit, bank what you gather. Everyone on the board shares the island;
 * each person keeps their own skills and bank.
 */
export function DriftholmWindow({ win = {}, onUpdate }) {
  const game = useDriftholm({ win, onUpdate });
  const containerRef = React.useRef(null);
  const { hud, command } = game;
  const here = hud ? hud.others.length + 1 : 0;
  const subtitle = here > 1 ? `Larkspit · ${here} on the island` : 'Larkspit';
  const fullScreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    else el.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <>
      <WindowTitle
        icon={<Icon.Gamepad size={14} />}
        label={win.title || windowMeta.label}
        subtitle={subtitle}
        actions={[
          { id: 'camera', label: null, title: 'Reset the camera', icon: <Icon.Refresh size={14} />, onSelect: () => command('reset_camera') },
          { id: 'fullscreen', label: null, title: 'Full screen', icon: <Icon.Fullscreen size={14} />, onSelect: fullScreen },
        ]}
      />
      <div ref={containerRef} className="hb-drift" data-testid="driftholm" data-status={game.status}>
        <div className="hb-drift-stage" data-no-drag>
          <iframe ref={game.frameRef} src={GAME_URL} title="Driftholm island" className="hb-drift-frame" onLoad={game.focusGame} />
          {game.status === 'loading' && <div className="hb-drift-veil">Loading the island…</div>}
          {game.status === 'problem' && (
            <div className="hb-drift-veil" role="alert">
              <div className="hb-game-card">
                <div className="hb-game-title">The island didn't start</div>
                <p className="hb-game-body">This browser couldn't run the game. Driftholm needs WebGL 2, which every current Chrome, Edge, Firefox and Safari has.</p>
                {game.problem && <p className="hb-game-muted">{game.problem}</p>}
              </div>
            </div>
          )}
          {hud && <Log lines={hud.log} />}
          {!game.canPlay && game.status === 'ready' && <div className="hb-drift-note">You're watching. Ask for an edit link to play.</div>}
          {hud?.bank_open && <Bank hud={hud} command={command} />}
        </div>
        {game.canPlay && (
          <aside className="hb-drift-side" data-no-drag aria-label="Your character">
            <div className="hb-drift-who">
              <span className="hb-drift-title">{game.name}</span>
              <button type="button" className="hb-drift-run" data-on={hud?.run ? 'true' : undefined} aria-pressed={Boolean(hud?.run)} onClick={() => command('run', { on: !hud?.run })}>
                {hud?.run ? 'Running' : 'Walking'}
              </button>
            </div>
            {hud && <Fighting hud={hud} command={command} />}
            {hud ? <Skills skills={hud.skills} /> : <div className="hb-drift-muted">Waiting for the island…</div>}
            {hud && <Pack pack={hud.pack} onDrop={(slot) => command('drop', { slot })} onEat={(slot) => command('eat', { slot })} />}
            <div className="hb-drift-help">
              <span><strong>Click</strong> to walk, chop, fish, fight a cow, cook at the fire pit or open the bank</span>
              <span><strong>Right-drag</strong> or <span className="hb-kbd">←</span> <span className="hb-kbd">→</span> to turn the camera</span>
              <span><strong>Scroll</strong> to zoom</span>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
