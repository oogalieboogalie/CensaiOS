/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { formatAmount } from '../../../lib/games/idle/economy.js';
import { makerCost, shopMakers, shopUpgrades } from '../../../lib/games/blocks/economy.js';

/** Upgrades and makers, the same shop shape as Agent Company. */
export function YardShop({ game }) {
  const { eco, wallet, canPlay } = game;
  const upgrades = shopUpgrades(eco);
  return (
    <aside className="hb-idle-shop" data-testid="blocks-shop">
      {upgrades.length > 0 && (
        <section>
          <div className="hb-game-board-head">Upgrades</div>
          <div className="hb-idle-upgrades">
            {upgrades.slice(0, 3).map((u) => (
              <button key={u.id} type="button" className="hb-idle-upgrade" disabled={!canPlay || wallet < u.cost}
                onClick={() => game.upgrade(u.id)} title={u.blurb} data-testid={`blocks-upgrade-${u.id}`}>
                <span className="hb-idle-row-name">{u.name}</span>
                <span className="hb-game-muted">{u.blurb}</span>
                <span className="hb-idle-cost hb-game-num">{formatAmount(u.cost)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <section>
        <div className="hb-game-board-head">Makers dig while you're away</div>
        <div className="hb-idle-hires">
          {shopMakers(eco).map((m) => {
            const owned = eco.owned[m.id] || 0;
            const cost = makerCost(m.id, owned);
            return (
              <button key={m.id} type="button" className="hb-idle-hire" disabled={!canPlay || wallet < cost}
                onClick={() => game.buy(m.id)} title={m.blurb} data-testid={`blocks-maker-${m.id}`}>
                <span className="hb-idle-row-top">
                  <span className="hb-idle-row-name">{m.name}</span>
                  <span className="hb-idle-owned hb-game-num">{owned || ''}</span>
                </span>
                <span className="hb-idle-row-top">
                  <span className="hb-game-muted">+{formatAmount(m.rate)}/s each</span>
                  <span className="hb-idle-cost hb-game-num">{formatAmount(cost)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section data-testid="blocks-team">
        <div className="hb-game-board-head">Builders</div>
        {game.team.length === 0
          ? <div className="hb-game-muted">Nobody has dug yet. Be first.</div>
          : (
            <ol className="hb-blocks-team">
              {game.team.slice(0, 6).map((row) => (
                <li key={row.field} data-self={row.field === game.field ? 'true' : undefined}>
                  <span className="hb-game-board-name">{row.name}</span>
                  <span className="hb-game-muted hb-game-num">{formatAmount(row.placed)} placed · {formatAmount(row.digs)} dug</span>
                </li>
              ))}
            </ol>
          )}
      </section>
    </aside>
  );
}
