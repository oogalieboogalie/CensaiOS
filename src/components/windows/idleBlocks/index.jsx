/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { formatAmount } from '../../../lib/games/idle/economy.js';
import { BLOCKS } from '../../../lib/games/blocks/economy.js';
import { ISO_AT, nextMilestone, placedCount } from '../../../lib/games/blocks/yard.js';
import { windowMeta } from './meta.js';
import { useIdleBlocks } from './useIdleBlocks.js';
import { FlatYard } from './FlatYard.jsx';
import { IsoYard } from './IsoYard.jsx';
import { YardShop } from './YardShop.jsx';
import { DigButton, awayText } from './DigButton.jsx';

export { windowMeta };

function Palette({ earned, pick, onPick }) {
  return (
    <div className="hb-blocks-palette" role="radiogroup" aria-label="Block to build with" data-testid="blocks-palette">
      {BLOCKS.map((b) => {
        const open = earned >= b.unlock;
        return (
          <button key={b.id} type="button" role="radio" aria-checked={pick === b.id} className="hb-blocks-swatch"
            data-block={b.id} disabled={!open} onClick={() => onPick(b.id)} data-testid={`blocks-pick-${b.id}`}
            title={open ? `${b.name}: ${formatAmount(b.cost)} each` : `${b.name} unlocks at ${formatAmount(b.unlock)} dug`}>
            <span className="hb-blocks-chip" aria-hidden="true" />
            <span>{open ? b.name : 'Locked'}</span>
            <span className="hb-game-muted hb-game-num">{open ? formatAmount(b.cost) : formatAmount(b.unlock)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Milestone({ earned }) {
  const goal = nextMilestone(earned);
  if (!goal) return <div className="hb-game-muted">Every milestone reached. Build something huge.</div>;
  return (
    <div className="hb-blocks-goal" data-testid="blocks-goal">
      <span className="hb-game-muted">Dig {formatAmount(Math.max(0, goal.at - earned))} more: {goal.label}</span>
      <span className="hb-blocks-goal-bar"><span style={{ width: `${Math.round(goal.progress * 100)}%` }} /></span>
    </div>
  );
}

/**
 * Blockyard: an idle building game the whole board plays together. Dig
 * blocks, buy makers that keep digging while the board is closed, and stack
 * blocks on a flat grid that opens up into an isometric world as you go.
 */
export function IdleBlocksWindow({ win = {}, onUpdate }) {
  const game = useIdleBlocks({ win, onUpdate });
  const [pick, setPick] = React.useState('soil');
  const [view, setView] = React.useState(game.iso ? 'iso' : 'flat');
  const [opened, setOpened] = React.useState(false);
  const wasIso = React.useRef(game.iso);
  React.useEffect(() => {
    if (game.iso && !wasIso.current) { setView('iso'); setOpened(true); }
    wasIso.current = game.iso;
  }, [game.iso]);

  const shown = game.iso ? view : 'flat';
  const place = (x, y) => game.place(x, y, pick);
  const others = game.team.filter((row) => row.field !== game.field).length;
  const yardProps = { size: game.size, stacks: game.stacks, field: game.field, canPlay: game.canPlay, onPlace: place, onTake: game.take };
  return (
    <>
      <WindowTitle icon={<Icon.Cube size={14} />} label={win.title || windowMeta.label}
        subtitle={others ? `${others + 1} building` : 'Games'} />
      <div className="hb-blocks" data-testid="idle-blocks">
        <div className="hb-blocks-main">
          {game.away && (
            <div className="hb-idle-away" role="status" data-testid="blocks-away">
              <span>While you were away ({awayText(game.away.seconds)}) your makers dug <strong className="hb-game-num">{formatAmount(game.away.earned)}</strong> blocks.</span>
              <button type="button" className="hb-game-link" onClick={game.dismissAway}>Dismiss</button>
            </div>
          )}
          {opened && shown === 'iso' && (
            <div className="hb-idle-away" role="status" data-testid="blocks-opened">
              <span>Your yard opened up. This is the 3D view; the flat grid is one click away.</span>
              <button type="button" className="hb-game-link" onClick={() => setOpened(false)}>Got it</button>
            </div>
          )}
          <div className="hb-blocks-top">
            <div className="hb-blocks-stats">
              <div className="hb-game-board-head">Blocks</div>
              <div className="hb-idle-wallet hb-game-num" data-testid="blocks-wallet">{formatAmount(game.wallet)}</div>
              <div className="hb-game-muted hb-game-num" data-testid="blocks-rate">{formatAmount(game.eco.rate)}/s · {formatAmount(game.eco.dig)} per dig · {formatAmount(placedCount(game.stacks))} placed</div>
            </div>
            <DigButton onDig={game.dig} canPlay={game.canPlay} />
            <div className="hb-blocks-views" role="group" aria-label="View">
              <button type="button" aria-pressed={shown === 'flat'} onClick={() => setView('flat')} data-testid="blocks-view-flat">Grid</button>
              <button type="button" aria-pressed={shown === 'iso'} disabled={!game.iso} onClick={() => setView('iso')}
                title={game.iso ? 'See your yard in 3D' : `Opens at ${ISO_AT} dug`} data-testid="blocks-view-iso">3D</button>
            </div>
          </div>
          <Milestone earned={game.earned} />
          <Palette earned={game.earned} pick={pick} onPick={setPick} />
          {!game.canPlay && <p className="hb-game-muted">You're watching. Ask for an edit link to build too.</p>}
          <div className="hb-blocks-stage">
            {shown === 'iso' ? <IsoYard {...yardProps} /> : <FlatYard {...yardProps} />}
          </div>
        </div>
        <YardShop game={game} />
      </div>
    </>
  );
}
