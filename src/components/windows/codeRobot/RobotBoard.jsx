/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { DIRS, parseMap } from '../../../lib/games/codeRobot/world.js';

const CELL = 32;

/** The grid, gems, goal and robot for one map, at one step of the replay. */
export function RobotBoard({ map, state }) {
  const world = React.useMemo(() => parseMap(map), [map]);
  const robot = state || world.robot;
  const gems = state ? state.gems : [...world.gems];
  const angle = (robot.dir ?? 0) * 90;
  const cells = [];
  for (let y = 0; y < world.h; y += 1) {
    for (let x = 0; x < world.w; x += 1) {
      cells.push(<rect key={`${x},${y}`} x={x * CELL} y={y * CELL} width={CELL} height={CELL}
        className={world.walls.has(`${x},${y}`) ? 'hb-robot-wall' : 'hb-robot-floor'} />);
    }
  }
  return (
    <svg className="hb-robot-board" viewBox={`0 0 ${world.w * CELL} ${world.h * CELL}`} role="img" aria-label="Robot map" data-testid="robot-board">
      {cells}
      <rect className="hb-robot-goal" x={world.goal.x * CELL + 5} y={world.goal.y * CELL + 5} width={CELL - 10} height={CELL - 10} rx="3" />
      {gems.map((key) => {
        const [x, y] = key.split(',').map(Number);
        const cx = x * CELL + CELL / 2;
        const cy = y * CELL + CELL / 2;
        return <path key={key} className="hb-robot-gem" d={`M${cx} ${cy - 7} L${cx + 6} ${cy} L${cx} ${cy + 7} L${cx - 6} ${cy} Z`} />;
      })}
      {state?.bump && <rect className="hb-robot-bump" x={state.bump.x * CELL + 2} y={state.bump.y * CELL + 2} width={CELL - 4} height={CELL - 4} rx="3" />}
      <g className="hb-robot-bot" style={{ transform: `translate(${robot.x * CELL + CELL / 2}px, ${robot.y * CELL + CELL / 2}px) rotate(${angle}deg)` }} data-dir={DIRS[robot.dir ?? 0].name}>
        <rect x="-10" y="-10" width="20" height="20" rx="4" />
        <circle cx="5" cy="-4" r="1.8" className="hb-robot-eye" />
        <circle cx="5" cy="4" r="1.8" className="hb-robot-eye" />
      </g>
    </svg>
  );
}
