// Code Robot bug hunt and red team. The wrong things on purpose: a loop that
// never ends, a typo, both people pressing Run at the same moment, and a
// program that tries to reach the internet. Then a hostile teammate (played
// by Pat Example's browser) plants broken class records on the shared board;
// Sam Example's window must stay up, show names as plain words and never run
// a planted script. All names are made up.

import { updateWindow } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';
import { classOf, outcomeOf, robotOf, runProgram } from './codeRobotSteps.mjs';

const CORNER = '// Pat Example walks\nmove();\nmove();\nturnRight();\nmove();\nmove();\n';
const TAG_NAME = '<img src=x onerror="window.__madeUpRobotRan=1">Made-up Coder';
const BROKEN_CODERS = {
  coder_null: null,
  coder_words: 'not a coder',
  coder_nested: { name: { nested: 'object' }, solved: { 'first-steps': { stars: 3, lines: 4 } } },
  coder_list: { name: ['a', 'list'], solved: 'lots' },
  coder_tag: { name: TAG_NAME, solved: { 'first-steps': { stars: 'many', lines: -5, code: { not: 'words' } } } },
  coder_junk_level: { name: 'Junk Level Example', solved: { 'no-such-level': { stars: 3 } } },
};

const scriptRan = (page) => page.evaluate(() => window.__madeUpRobotRan === 1);

export async function runCodeRobotRedTeam(t, winId) {
  const { pat, sam, check } = t;

  await check('hunt', 'a loop that never ends is stopped with a plain sentence', async ({ shot }) => {
    const win = winId();
    const started = Date.now();
    await runProgram(pat.page, win, 'while (true) {}\n');
    const said = await outcomeOf(pat.page, win, 10_000);
    const took = Date.now() - started;
    await shot(pat.page, 'pat-endless-loop');
    if (!/too long/.test(said)) throw new Error(`the window says "${said}"`);
    if (took > 8000) throw new Error(`it took ${Math.round(took / 1000)} seconds to stop`);
    return `in ${(took / 1000).toFixed(1)} seconds the window says "${said}"`;
  });

  await check('hunt', 'a typo shows an error in words and Run still works after it', async () => {
    const win = winId();
    await runProgram(pat.page, win, 'move(;\n');
    const said = await outcomeOf(pat.page, win);
    if (/Solved/.test(said) || !said) throw new Error(`the typo run says "${said}"`);
    await runProgram(pat.page, win, CORNER);
    const fixed = await outcomeOf(pat.page, win);
    if (!/Solved/.test(fixed)) throw new Error(`the fixed program says "${fixed}"`);
    return `the typo says "${said}", and the fixed program says "${fixed.replace(/Next level$/, '').trim()}"`;
  });

  await check('hunt', 'both press Run at the same moment: both solves are kept', async ({ shot }) => {
    const win = winId();
    // Pat has level 2 already; Sam presses Run while Pat runs it again with a new program.
    await Promise.all([
      runProgram(sam.page, win, CORNER.replace('Pat Example', 'Sam Example')),
      runProgram(pat.page, win, 'move();\nmove();\nturnRight();\nmove();\nmove();\n'),
    ]);
    await Promise.all([outcomeOf(pat.page, win), outcomeOf(sam.page, win)]);
    await pat.page.waitForTimeout(2000);
    const rows = await Promise.all([classOf(pat.page, win), classOf(sam.page, win)]);
    await sideBySide(t, 'both-run-at-once', shot);
    const twoEach = rows.map((list) => ['Pat Example', 'Sam Example'].every((n) => list.some((r) => r === `${n}: 2 of 10 levels`)));
    if (!twoEach.every(Boolean)) throw new Error(`Pat's list: ${JSON.stringify(rows[0])}; Sam's: ${JSON.stringify(rows[1])}`);
    return `both lists read "${rows[0].join('; ')}"`;
  });

  await check('redteam', 'a program cannot reach the internet', async () => {
    const win = winId();
    await runProgram(sam.page, win, "fetch('https://example.com/made-up');\nmove();\n");
    const said = await outcomeOf(sam.page, win);
    if (/Solved/.test(said)) throw new Error('the program ran fetch and carried on');
    if (!/fetch/.test(said)) throw new Error(`the window says "${said}"`);
    return `the run stops at once and says "${said}"`;
  });

  await check('redteam', 'broken class records planted on the board do not break Sam\'s window', async ({ shot }) => {
    const win = winId();
    await updateWindow(pat.page, win, BROKEN_CODERS);
    await sam.page.waitForTimeout(2500);
    const alive = await robotOf(sam.page, win).isVisible().catch(() => false);
    const words = alive ? await robotOf(sam.page, win).getByTestId('robot-class').innerText().catch(() => '') : '';
    await shot(sam.page, 'sam-after-broken-class-records');
    if (await scriptRan(sam.page)) throw new Error('a planted name ran as a script on Sam\'s screen');
    if (!alive) throw new Error('Sam\'s Code Robot window stopped showing after the broken records');
    if (!words.includes('Sam Example') || !words.includes('Pat Example')) throw new Error(`Sam's class list lost a real person (it reads "${words.replace(/\s+/g, ' ').slice(0, 160)}")`);
    if (/\[object Object\]|NaN|undefined|a,list/.test(words)) throw new Error(`the class list shows junk: "${words.replace(/\s+/g, ' ').slice(0, 200)}"`);
    return 'Sam\'s window stays up, both real people show and the planted names stay plain words';
  });

  await check('redteam', 'after the broken records, Sam can still solve a level', async () => {
    const win = winId();
    await updateWindow(pat.page, win, Object.fromEntries(Object.keys(BROKEN_CODERS).map((k) => [k, null])));
    await runProgram(sam.page, win, CORNER.replace('Pat Example', 'Sam Example'));
    const said = await outcomeOf(sam.page, win);
    if (!/Solved/.test(said)) throw new Error(`Sam's run says "${said}"`);
    return `Sam's run says "${said.replace(/Next level$/, '').trim()}"`;
  });
}
