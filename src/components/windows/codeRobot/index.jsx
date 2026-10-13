/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { LEVELS, nextLevel } from '../../../lib/games/codeRobot/levels.js';
import { CodePane } from './CodePane.jsx';
import { RobotBoard } from './RobotBoard.jsx';
import { windowMeta } from './meta.js';
import { useCodeRobot } from './useCodeRobot.js';

export { windowMeta };

const COMMAND_HELP = [
  ['move()', 'one square forward'],
  ['turnLeft()', 'turn on the spot'],
  ['turnRight()', 'turn on the spot'],
  ['pickUp()', 'collect the gem here'],
  ['wallAhead()', 'true if a wall is in front'],
  ['atGoal()', 'true on the goal'],
  ['onGem()', 'true on a gem'],
  ['gemsLeft()', 'how many gems are left'],
];

function Stars({ n, of = 3 }) {
  return (
    <span className="hb-robot-stars" aria-label={`${n} of ${of} stars`}>
      {Array.from({ length: of }, (_, i) => <span key={i} data-on={i < n ? 'true' : undefined} />)}
    </span>
  );
}

function LevelPicker({ game }) {
  const index = LEVELS.findIndex((l) => l.id === game.levelId);
  return (
    <div className="hb-robot-levels" role="tablist" aria-label="Levels" data-testid="robot-levels">
      {LEVELS.map((l, i) => {
        const best = game.mine?.solved?.[l.id]?.stars || 0;
        return (
          <button key={l.id} type="button" role="tab" aria-selected={l.id === game.levelId} className="hb-robot-level"
            data-solved={best ? 'true' : undefined} onClick={() => game.chooseLevel(l.id)} title={`${i + 1}. ${l.title}`}>
            {i + 1}
          </button>
        );
      })}
      <span className="hb-game-muted hb-robot-levels-note">{index + 1} of {LEVELS.length}</span>
    </div>
  );
}

function Outcome({ game }) {
  const { run, result, replaying, level } = game;
  if (game.running) return <div className="hb-robot-outcome" role="status">Running…</div>;
  if (!run) return <div className="hb-robot-outcome hb-game-muted">Write your program, then press Run (or Ctrl + Enter).</div>;
  if (replaying) return <div className="hb-robot-outcome" role="status">Step {game.frame} · {result?.trace?.[game.frame]?.action}</div>;
  if (run.solved) {
    const next = nextLevel(level.id);
    return (
      <div className="hb-robot-outcome" data-tone="good" role="status" data-testid="robot-outcome">
        <span><strong>Solved</strong> in {run.lines} line{run.lines === 1 ? '' : 's'}. <Stars n={game.stars} /> {game.stars < 3 && <span className="hb-game-muted">Par is {level.par} lines.</span>}</span>
        {next && <button type="button" className="hb-btn" data-primary="true" onClick={() => game.chooseLevel(next.id)} data-testid="robot-next">Next level</button>}
      </div>
    );
  }
  const where = level.maps.length > 1 ? `Map ${game.mapIndex + 1}: ` : '';
  return <div className="hb-robot-outcome" data-tone="bad" role="status" data-testid="robot-outcome">{where}{result?.message}</div>;
}

function ClassProgress({ rows, field }) {
  return (
    <div className="hb-game-board hb-robot-class" data-testid="robot-class">
      <div className="hb-game-board-head">The class</div>
      {rows.length === 0
        ? <div className="hb-game-muted">Solve a level and you'll show up here for everyone on the board.</div>
        : (
          <ol>
            {rows.slice(0, 8).map((row) => (
              <li key={row.field} data-self={row.field === field ? 'true' : undefined}>
                <span className="hb-game-board-name">{row.name}</span>
                <span className="hb-robot-pips" aria-label={`${row.solved} of ${LEVELS.length} levels`}>
                  {row.levels.map((stars, i) => <span key={i} data-stars={stars || undefined} />)}
                </span>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}

/**
 * Code Robot: learn to code by steering a robot with JavaScript. Ten levels
 * walk from single commands to loops, functions, ifs and a maze solver. Each
 * program runs in a sandboxed worker and replays step by step; solved levels
 * show up in the class list for everyone on the board.
 */
export function CodeRobotWindow({ win = {}, onUpdate }) {
  const game = useCodeRobot({ win, onUpdate });
  const { level } = game;
  const map = level.maps[game.mapIndex] || level.maps[0];
  const solvedCount = game.mine ? Object.keys(game.mine.solved).length : 0;
  return (
    <>
      <WindowTitle
        icon={<Icon.Code size={14} />}
        label={win.title || windowMeta.label}
        subtitle={`${solvedCount} of ${LEVELS.length} solved`}
        actions={[{ id: 'reset', label: null, title: 'Start this level over', icon: <Icon.Refresh size={14} />, onSelect: game.resetCode }]}
      />
      <div className="hb-robot" data-testid="code-robot">
        <section className="hb-robot-stage">
          <LevelPicker game={game} />
          <div className="hb-robot-brief">
            <div className="hb-game-title">{level.title}</div>
            <p className="hb-game-body">{level.task}</p>
            <p className="hb-robot-lesson">{level.lesson}</p>
          </div>
          {level.maps.length > 1 && (
            <div className="hb-robot-maps" role="tablist" aria-label="Maps">
              {level.maps.map((_, i) => {
                const outcome = game.run?.results?.[i]?.outcome;
                return (
                  <button key={i} type="button" role="tab" aria-selected={i === game.mapIndex} className="hb-robot-map-tab"
                    data-outcome={outcome} onClick={() => game.showMap(i)}>Map {i + 1}</button>
                );
              })}
            </div>
          )}
          <div className="hb-robot-board-wrap">
            <RobotBoard key={`${level.id}-${game.mapIndex}`} map={map} state={game.state} />
          </div>
          <Outcome game={game} />
          <ClassProgress rows={game.progress} field={game.field} />
        </section>
        <section className="hb-robot-side">
          <CodePane key={level.id} code={game.code} onChange={game.editCode} onRun={game.start} />
          <div className="hb-robot-actions">
            <button type="button" className="hb-btn" data-primary="true" onClick={game.start} disabled={game.running} data-testid="robot-run">
              <Icon.Play size={12} /> Run
            </button>
            {game.replaying && <button type="button" className="hb-btn" onClick={game.skip}>Skip to end</button>}
            <details className="hb-robot-hint">
              <summary>Hint</summary>
              <p>{level.hint}</p>
            </details>
          </div>
          <dl className="hb-robot-help" aria-label="Commands">
            {COMMAND_HELP.map(([cmd, what]) => (
              <React.Fragment key={cmd}><dt>{cmd}</dt><dd>{what}</dd></React.Fragment>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
