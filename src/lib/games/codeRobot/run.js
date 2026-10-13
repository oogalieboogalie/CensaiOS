// Runs a player's JavaScript against one map and records every move so the
// window can replay it. The program only sees the robot's commands: it runs
// inside a Web Worker (runner.worker.js) with the network and storage
// removed, and a step budget stops runaway loops that keep calling commands.
// A loop that calls nothing at all is stopped by the window ending the worker.
import { DIRS, ahead, cloneWorld, isWall, parseMap, snapshot, solved } from './world.js';

export const MAX_MOVES = 400;
export const MAX_CHECKS = 4000;
export const COMMANDS = ['move', 'turnLeft', 'turnRight', 'pickUp', 'wallAhead', 'atGoal', 'onGem', 'gemsLeft'];

class Stop extends Error {
  constructor(outcome, message) { super(message); this.outcome = outcome; }
}

/** Count how many lines of real code a program has (blank lines and comments don't count). */
export function countLines(code) {
  return String(code || '').split('\n').map((l) => l.replace(/\/\/.*$/, '').trim()).filter((l) => l && l !== '}' && l !== '{').length;
}

/**
 * Run `code` on a text map. Returns { outcome, message, trace, moves }.
 * outcome: 'solved' | 'crashed' | 'unfinished' | 'error' | 'too-long'
 */
export function runProgram(map, code) {
  const world = cloneWorld(typeof map.robot === 'object' && map.walls ? map : parseMap(map));
  const trace = [snapshot(world, 'start')];
  let moves = 0;
  let checks = 0;
  const act = (name) => {
    moves += 1;
    if (moves > MAX_MOVES) throw new Stop('too-long', `The robot took more than ${MAX_MOVES} steps. Is a loop running forever?`);
    trace.push(snapshot(world, name));
  };
  const check = () => {
    checks += 1;
    if (checks > MAX_CHECKS) throw new Stop('too-long', 'The program kept checking without moving. Is a loop running forever?');
  };
  const api = {
    move() {
      const next = ahead(world);
      if (isWall(world, next.x, next.y)) {
        trace.push({ ...snapshot(world, 'bump'), bump: next });
        throw new Stop('crashed', `Bumped into a wall facing ${DIRS[world.robot.dir].name}.`);
      }
      world.robot.x = next.x;
      world.robot.y = next.y;
      act('move');
    },
    turnLeft() { world.robot.dir = (world.robot.dir + 3) % 4; act('turnLeft'); },
    turnRight() { world.robot.dir = (world.robot.dir + 1) % 4; act('turnRight'); },
    pickUp() {
      const key = `${world.robot.x},${world.robot.y}`;
      if (!world.gems.has(key)) throw new Stop('crashed', 'There is no gem here to pick up.');
      world.gems.delete(key);
      act('pickUp');
    },
    wallAhead() { check(); const n = ahead(world); return isWall(world, n.x, n.y); },
    atGoal() { check(); return world.robot.x === world.goal.x && world.robot.y === world.goal.y; },
    onGem() { check(); return world.gems.has(`${world.robot.x},${world.robot.y}`); },
    gemsLeft() { check(); return world.gems.size; },
  };
  try {
    // Strict mode, with the commands as the only names the program is handed.
    // eslint-disable-next-line no-new-func -- running the player's own program is the game; the worker sandboxes it.
    const program = new Function(...COMMANDS, `"use strict";\n${String(code || '')}\n`);
    program(...COMMANDS.map((name) => api[name]));
  } catch (err) {
    if (err instanceof Stop) return { outcome: err.outcome, message: err.message, trace, moves };
    return { outcome: 'error', message: friendlyError(err), trace, moves };
  }
  if (solved(world)) return { outcome: 'solved', message: 'Solved!', trace, moves };
  const left = world.gems.size;
  const atGoal = world.robot.x === world.goal.x && world.robot.y === world.goal.y;
  return {
    outcome: 'unfinished',
    message: atGoal && left ? `Made it to the goal, but ${left} gem${left === 1 ? ' is' : 's are'} still out there.` : 'The program ended before the robot reached the goal.',
    trace,
    moves,
  };
}

function friendlyError(err) {
  const msg = String(err?.message || err);
  const missing = msg.match(/^(\w+) is not defined$/);
  if (missing) return `"${missing[1]}" isn't a command. Try ${COMMANDS.slice(0, 4).map((c) => `${c}()`).join(', ')}.`;
  if (err instanceof SyntaxError) return `The code has a typo: ${msg}`;
  return msg;
}

/** Run a level: every map must be solved by the same program. */
export function runLevel(level, code) {
  const results = level.maps.map((map) => runProgram(map, code));
  const firstFail = results.findIndex((r) => r.outcome !== 'solved');
  return { solved: firstFail === -1, results, failedMap: firstFail, lines: countLines(code) };
}

export function starsFor(level, run) {
  if (!run.solved) return 0;
  return run.lines <= level.par ? 3 : run.lines <= level.par * 2 ? 2 : 1;
}
