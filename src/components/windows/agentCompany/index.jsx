/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { HIRES, formatAmount, hireCost, shopHires, shopUpgrades } from '../../../lib/games/idle/economy.js';
import { windowMeta } from './meta.js';
import { useAgentCompany } from './useAgentCompany.js';

export { windowMeta };

const MAX_DOTS = 240;
const COLS = 20;
const TIER = Object.fromEntries(HIRES.map((h, i) => [h.id, i]));

// One dot per hire, biggest kinds first, so the grid fills in as the
// company grows. Past MAX_DOTS each kind keeps its share of the grid.
function dotsFor(owned) {
  const total = HIRES.reduce((n, h) => n + (owned[h.id] || 0), 0);
  const scale = total > MAX_DOTS ? MAX_DOTS / total : 1;
  const dots = [];
  for (const h of [...HIRES].reverse()) {
    const n = owned[h.id] || 0;
    const shown = n ? Math.max(1, Math.round(n * scale)) : 0;
    for (let i = 0; i < shown; i += 1) dots.push(h.id);
  }
  return dots;
}

function DotField({ owned }) {
  const dots = dotsFor(owned);
  if (!dots.length) return <div className="hb-idle-field-empty">Hire your first intern and the grid starts to fill.</div>;
  const rows = Math.max(1, Math.ceil(dots.length / COLS));
  return (
    <svg className="hb-idle-field" viewBox={`0 0 ${COLS * 10} ${rows * 10}`} preserveAspectRatio="xMidYMin meet" aria-label={`${dots.length} people and machines in the company`} data-testid="idle-field">
      {dots.map((id, i) => (
        <circle key={i} cx={(i % COLS) * 10 + 5} cy={Math.floor(i / COLS) * 10 + 5} r={1.8 + TIER[id] * 0.35}
          className="hb-idle-dot" data-tier={TIER[id]} style={{ animationDelay: `${(i * 137) % 2400}ms` }} />
      ))}
    </svg>
  );
}

function Floaters({ items }) {
  return items.map((f) => (
    <span key={f.id} className="hb-idle-float" style={{ left: f.x, top: f.y }} aria-hidden="true">+{formatAmount(f.value)}</span>
  ));
}

function Team({ team, field }) {
  return (
    <div className="hb-game-board" data-testid="idle-team">
      <div className="hb-game-board-head">The team</div>
      {team.length === 0
        ? <div className="hb-game-muted">Nobody has shipped yet. Tap to be first.</div>
        : (
          <ol>
            {team.slice(0, 6).map((row, i) => (
              <li key={row.field} data-self={row.field === field ? 'true' : undefined}>
                <span className="hb-game-rank">{i + 1}</span>
                <span className="hb-game-board-name">{row.name}</span>
                <span className="hb-game-muted hb-game-num">{formatAmount(row.taps)} taps · {row.hires} hired</span>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}

function Shop({ game }) {
  const { company, wallet, canPlay } = game;
  const upgrades = shopUpgrades(company);
  return (
    <aside className="hb-idle-shop" data-testid="idle-shop">
      {upgrades.length > 0 && (
        <section>
          <div className="hb-game-board-head">Upgrades</div>
          <div className="hb-idle-upgrades">
            {upgrades.slice(0, 4).map((u) => (
              <button key={u.id} type="button" className="hb-idle-upgrade" disabled={!canPlay || wallet < u.cost}
                onClick={() => game.upgrade(u.id)} title={u.blurb} data-testid={`idle-upgrade-${u.id}`}>
                <span className="hb-idle-row-name">{u.name}</span>
                <span className="hb-game-muted">{u.blurb}</span>
                <span className="hb-idle-cost hb-game-num">{formatAmount(u.cost)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <section>
        <div className="hb-game-board-head">Hire</div>
        <div className="hb-idle-hires">
          {shopHires(company).map((h) => {
            const owned = company.owned[h.id] || 0;
            const cost = hireCost(h.id, owned);
            return (
              <button key={h.id} type="button" className="hb-idle-hire" disabled={!canPlay || wallet < cost}
                onClick={() => game.hire(h.id)} title={h.blurb} data-testid={`idle-hire-${h.id}`}>
                <span className="hb-idle-row-top">
                  <span className="hb-idle-row-name">{h.name}</span>
                  <span className="hb-idle-owned hb-game-num">{owned || ''}</span>
                </span>
                <span className="hb-idle-row-top">
                  <span className="hb-game-muted">+{formatAmount(h.rate)}/s each</span>
                  <span className="hb-idle-cost hb-game-num">{formatAmount(cost)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

function awayText(seconds) {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} days`;
}

/**
 * Agent Company: an idle clicker the whole board plays together. Tap to ship,
 * spend what the company earns on interns, agents and data centers, and they
 * keep shipping while the board is closed. Everyone shares one wallet; each
 * person's taps and hires live in their own seat on the window record.
 */
export function AgentCompanyWindow({ win = {}, onUpdate }) {
  const game = useAgentCompany({ win, onUpdate });
  const { company, wallet } = game;
  const [floaters, setFloaters] = React.useState([]);
  const [pressed, setPressed] = React.useState(false);
  const nextId = React.useRef(0);

  const onTap = (e) => {
    const value = game.tap();
    if (!value) return;
    const button = e.currentTarget.getBoundingClientRect();
    const wrap = e.currentTarget.parentElement.getBoundingClientRect();
    const id = (nextId.current += 1);
    const x = (e.clientX || button.left + button.width / 2) - wrap.left;
    const y = (e.clientY || button.top + button.height / 2) - wrap.top;
    setFloaters((list) => [...list.slice(-14), { id, x, y, value }]);
    setTimeout(() => setFloaters((list) => list.filter((f) => f.id !== id)), 900);
  };
  const onKey = (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) { setPressed(true); onTap(e); }
  };

  const others = game.team.filter((row) => row.field !== game.field).length;
  return (
    <>
      <WindowTitle
        icon={<Icon.Gamepad size={14} />}
        label={win.title || windowMeta.label}
        subtitle={others ? `${others + 1} on the team` : 'Games'}
      />
      <div className="hb-idle" data-testid="agent-company">
        <div className="hb-idle-main">
          {game.away && (
            <div className="hb-idle-away" role="status" data-testid="idle-away">
              <span>While you were away ({awayText(game.away.seconds)}) the company shipped <strong className="hb-game-num">{formatAmount(game.away.earned)}</strong>.</span>
              <button type="button" className="hb-game-link" onClick={game.dismissAway}>Dismiss</button>
            </div>
          )}
          <div className="hb-idle-stats">
            <div className="hb-game-board-head">Credits</div>
            <div className="hb-idle-wallet hb-game-num" data-testid="idle-wallet">{formatAmount(wallet)}</div>
            <div className="hb-game-muted hb-game-num" data-testid="idle-rate">{formatAmount(company.rate)} per second · {formatAmount(company.tap)} per tap</div>
          </div>
          <div className="hb-idle-tap-wrap">
            <button type="button" className="hb-idle-tap" data-pressed={pressed ? 'true' : undefined} disabled={!game.canPlay}
              onClick={onTap} onKeyDown={onKey} onKeyUp={() => setPressed(false)} data-testid="idle-tap" data-no-drag
              aria-label="Ship it">
              <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <circle key={`${r}${c}`} cx={6 + c * 6} cy={6 + r * 6} r={r === 1 && c === 1 ? 2.2 : 1.6} />))}
              </svg>
              <span>Ship it</span>
            </button>
            <Floaters items={floaters} />
          </div>
          {!game.canPlay && <p className="hb-game-muted">You're watching. Ask for an edit link to join the company.</p>}
          <DotField owned={company.owned} />
          <Team team={game.team} field={game.field} />
        </div>
        <Shop game={game} />
      </div>
    </>
  );
}
