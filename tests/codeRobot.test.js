// Code Robot: the level ladder is solvable at par, programs are judged
// fairly, and runaway or broken programs end with a plain explanation.
import { LEVELS, levelById, nextLevel } from '../src/lib/games/codeRobot/levels.js';
import { countLines, runLevel, runProgram, starsFor } from '../src/lib/games/codeRobot/run.js';
import { parseMap } from '../src/lib/games/codeRobot/world.js';
import { classProgress, coderField, mergeSolve, readCoders } from '../src/lib/games/codeRobot/progress.js';
import * as Y from 'yjs';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { WINDOW_MANIFESTS } from '../src/lib/windowManifest.js';

const SOLUTIONS = {
  'first-steps': 'move();\nmove();\nmove();\nmove();',
  'turn-the-corner': 'move();\nmove();\nturnRight();\nmove();\nmove();',
  'pick-it-up': 'move();\npickUp();\nmove();\nmove();\npickUp();\nmove();',
  'the-long-hall': 'for (let i = 0; i < 12; i++) {\n  move();\n}',
  stairs: 'function step() {\n  move();\n  turnLeft();\n  move();\n  turnRight();\n}\nfor (let i = 0; i < 3; i++) step();\nmove();\nturnLeft();\nmove();',
  'how-far': 'while (!atGoal()) {\n  move();\n}',
  'wall-ahead': 'while (!atGoal()) {\n  if (wallAhead()) {\n    turnRight();\n  }\n  move();\n}',
  'gem-hunt': 'while (!atGoal()) {\n  move();\n  if (onGem()) {\n    pickUp();\n  }\n}',
  zigzag: 'while (!atGoal()) {\n  if (wallAhead()) {\n    turnRight();\n    if (wallAhead()) {\n      turnLeft();\n      turnLeft();\n    }\n  }\n  move();\n}',
  'the-maze': 'while (!atGoal()) {\n  turnRight();\n  while (wallAhead()) {\n    turnLeft();\n  }\n  move();\n}',
};

describe('the level ladder', () => {
  test.each(LEVELS.map((l) => [l.id, l]))('%s parses and is solvable within par', (id, level) => {
    for (const map of level.maps) expect(() => parseMap(map)).not.toThrow();
    const run = runLevel(level, SOLUTIONS[id]);
    expect(run.results.map((r) => r.message)).toEqual(level.maps.map(() => 'Solved!'));
    expect(starsFor(level, run)).toBe(3);
  });

  test('levels link in order', () => {
    expect(nextLevel('first-steps').id).toBe('turn-the-corner');
    expect(nextLevel('the-maze')).toBeNull();
    expect(levelById('nope')).toBeNull();
  });

  test('the starter code alone never solves a level', () => {
    for (const level of LEVELS) expect(runLevel(level, level.starter).solved).toBe(false);
  });
});

describe('running a program', () => {
  const hall = ['#####', '#>.G#', '#####'];

  test('the trace records every step for the replay', () => {
    const run = runProgram(hall, 'move();\nmove();');
    expect(run.outcome).toBe('solved');
    expect(run.trace.map((s) => s.action)).toEqual(['start', 'move', 'move']);
    expect(run.trace[2]).toMatchObject({ x: 3, y: 1 });
  });

  test('walking into a wall stops the robot with a reason', () => {
    const run = runProgram(hall, 'turnLeft();\nmove();');
    expect(run.outcome).toBe('crashed');
    expect(run.message).toMatch(/Bumped into a wall facing north/);
    expect(run.trace.at(-1).bump).toEqual({ x: 1, y: 0 });
  });

  test('stopping short, or skipping gems, is unfinished', () => {
    expect(runProgram(hall, 'move();').outcome).toBe('unfinished');
    const gem = runProgram(['#####', '#>*G#', '#####'], 'move();\nmove();');
    expect(gem.outcome).toBe('unfinished');
    expect(gem.message).toMatch(/1 gem is still out there/);
  });

  test('picking up thin air is a mistake', () => {
    expect(runProgram(hall, 'pickUp();').message).toMatch(/no gem here/);
  });

  test('runaway loops are stopped by the step budget', () => {
    expect(runProgram(hall, 'while (true) { turnLeft(); }').outcome).toBe('too-long');
    expect(runProgram(hall, 'while (!atGoal()) { }').outcome).toBe('too-long');
  });

  test('typos and unknown commands read as plain advice', () => {
    expect(runProgram(hall, 'moove();').message).toMatch(/"moove" isn't a command/);
    expect(runProgram(hall, 'move(;').message).toMatch(/typo/);
  });

  test('one program must solve every map of a level', () => {
    const level = levelById('how-far');
    const run = runLevel(level, 'for (let i = 0; i < 6; i++) move();');
    expect(run.solved).toBe(false);
    expect(run.failedMap).toBe(1);
  });

  test('lines are counted without blanks, comments or lone braces', () => {
    expect(countLines('// hi\n\nwhile (x) {\n  move();\n}\n')).toBe(2);
  });
});

describe('the class list', () => {
  test('a level keeps its best solve: more stars, then fewer lines', () => {
    let seat = mergeSolve(null, 'Alma', 'first-steps', { stars: 2, lines: 6, code: 'a', at: 1 });
    expect(seat.solved['first-steps']).toMatchObject({ stars: 2, lines: 6 });
    expect(mergeSolve(seat, 'Alma', 'first-steps', { stars: 2, lines: 7, code: 'b', at: 2 })).toBe(seat);
    seat = mergeSolve(seat, 'Alma', 'first-steps', { stars: 3, lines: 4, code: 'c', at: 3 });
    expect(seat.solved['first-steps'].code).toBe('c');
    expect(mergeSolve(seat, 'Alma', 'turn-the-corner', { stars: 0, lines: 1 })).toBe(seat);
    expect(mergeSolve(seat, 'Alma', 'made-up', { stars: 3, lines: 1 })).toBe(seat);
  });

  test('progress rows rank the class and ignore junk fields', () => {
    const coders = readCoders({
      coder_sam: { name: 'Sam', solved: { 'first-steps': { stars: 3 }, 'turn-the-corner': { stars: 1 } } },
      coder_alma: { name: 'Alma', solved: { 'first-steps': { stars: 2 }, fake: { stars: 3 } } },
      coder_bad: 'nope',
    });
    const rows = classProgress(coders);
    expect(rows.map((r) => r.name)).toEqual(['Sam', 'Alma']);
    expect(rows[0].levels.slice(0, 3)).toEqual([3, 1, 0]);
    expect(rows[1].solved).toBe(1);
  });

  test('two students solving at once both land on the shared board', () => {
    const frame = { id: 'w1', kind: 'codeRobot', x: 0, y: 0, w: 900, h: 580 };
    const a = new Y.Doc();
    const b = new Y.Doc();
    const sync = () => {
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
    };
    const base = { wins: [frame] };
    writeStateToDoc(a, null, base, 'local');
    sync();
    writeStateToDoc(a, base, { wins: [{ ...frame, [coderField('Alma')]: mergeSolve(null, 'Alma', 'first-steps', { stars: 3, lines: 4, code: 'x', at: 1 }) }] }, 'local');
    writeStateToDoc(b, base, { wins: [{ ...frame, [coderField('Sam')]: mergeSolve(null, 'Sam', 'first-steps', { stars: 1, lines: 9, code: 'y', at: 1 }) }] }, 'local');
    sync();
    for (const doc of [a, b]) expect(classProgress(readCoders(readDocState(doc).wins[0])).map((r) => r.name)).toEqual(['Alma', 'Sam']);
  });

  test('Code Robot is in the Add palette under Games', () => {
    const games = buildAddSections({ manifests: WINDOW_MANIFESTS.filter((m) => m.moduleMenu?.show !== false) }).find((s) => s.label === 'Games');
    expect(games.items.map((i) => i.label)).toContain('Code Robot');
  });
});
