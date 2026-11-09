// Code Robot for one and for two. Pat Example opens Code Robot from the Add
// menu and finds the first level with an empty class list. Pat writes four
// moves, presses Run and the robot solves it with three stars; Sam Example's
// class list shows Pat straight away. Sam solves it too, both names stay on
// both screens after a reload, and Next level moves Pat on. The bug hunt and
// red team live in codeRobotRedTeam.mjs. All names are made up.

import { openBoard } from '../../e2e/board.mjs';
import { addFromMenu } from '../addMenu.mjs';
import { sideBySide } from '../sideBySide.mjs';
import { runCodeRobotRedTeam } from './codeRobotRedTeam.mjs';
import { classOf, classShows, outcomeOf, robotOf, runProgram, squish } from './codeRobotSteps.mjs';

const FOUR_MOVES = '// Pat Example walks\nmove();\nmove();\nmove();\nmove();\n';
const SAM_MOVES = '// Sam Example walks\nfor (let i = 0; i < 4; i++) {\n  move();\n}\n';

export default {
  id: 'codeRobot',
  label: 'Code Robot: solve levels alone, then as a class',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push('Pat Example walks', 'Sam Example walks');
    let win;

    await check('walk', 'Pat opens Code Robot from the Add menu and sees the first level', async ({ shot }) => {
      const opened = await addFromMenu(pat.page, 'Code Robot');
      if (opened.kind !== 'codeRobot') throw new Error(`the Add menu opened ${opened.kind || 'nothing'}`);
      win = opened.id;
      const robot = robotOf(pat.page, win);
      await robot.locator('.cm-content').first().waitFor({ timeout: 15_000 });
      const words = squish(await robot.innerText());
      await shot(pat.page, 'pat-opens-code-robot');
      if (!words.includes('First steps')) throw new Error(`the window does not open on "First steps" (it reads "${words.slice(0, 120)}")`);
      if (!/Solve a level and you'll show up here/.test(words)) throw new Error('the class list is not empty');
      return 'the window opens on level 1, "First steps", with an empty class list';
    });

    await check('walk', 'Pat writes four moves and presses Run: solved with three stars', async ({ shot }) => {
      await runProgram(pat.page, win, FOUR_MOVES);
      const said = await outcomeOf(pat.page, win);
      const stars = await robotOf(pat.page, win).locator('.hb-robot-stars').getAttribute('aria-label').catch(() => '');
      await shot(pat.page, 'pat-solves-level-1');
      if (!/Solved in 4 lines/.test(said)) throw new Error(`after Run the window says "${said}"`);
      if (stars !== '3 of 3 stars') throw new Error(`the stars read "${stars}"`);
      return `the window says "${said.replace(/Next level$/, '').trim()}" with ${stars}`;
    });

    await check('walk', 'Sam\'s class list shows Pat as soon as Pat solves the level', async ({ shot }) => {
      const rows = await classShows(sam.page, win, ['Pat Example']);
      await sideBySide(t, 'sam-sees-pat-in-the-class', shot);
      if (!rows) throw new Error(`Sam's class list reads ${JSON.stringify(await classOf(sam.page, win))}`);
      return `Sam's class list reads "${rows.join('; ')}"`;
    });

    await check('walk', 'Sam solves it with a loop: both names are on both screens', async ({ shot }) => {
      await runProgram(sam.page, win, SAM_MOVES);
      const said = await outcomeOf(sam.page, win);
      const both = await Promise.all([classShows(pat.page, win, ['Pat Example', 'Sam Example']), classShows(sam.page, win, ['Pat Example', 'Sam Example'])]);
      await sideBySide(t, 'both-in-the-class', shot);
      if (!/Solved/.test(said)) throw new Error(`Sam's run says "${said}"`);
      if (!both.every(Boolean)) throw new Error(`both names on Pat's screen: ${Boolean(both[0])}, on Sam's: ${Boolean(both[1])}`);
      return `Sam's run says "${said.replace(/Next level$/, '').trim()}" and both class lists read "${both[0].join('; ')}"`;
    });

    await check('walk', 'after a reload both still see both names, and the board opens on level 2', async ({ shot }) => {
      await Promise.all([openBoard(pat.page, t.workspaceId, t.web), openBoard(sam.page, t.workspaceId, t.web)]);
      const kept = await Promise.all([pat, sam].map((p) => classShows(p.page, win, ['Pat Example', 'Sam Example'], 20_000)));
      const level = squish(await robotOf(pat.page, win).locator('.hb-robot-brief .hb-game-title').innerText().catch(() => ''));
      await shot(pat.page, 'pat-after-reload');
      if (!kept.every(Boolean)) throw new Error(`after the reload: Pat ${kept[0] ? 'has' : 'lost'} the class list, Sam ${kept[1] ? 'has' : 'lost'} it`);
      if (level !== 'Turn the corner') throw new Error(`Pat's window opened on "${level}", not the next level`);
      return 'both class lists kept both names, and Pat\'s window opens on "Turn the corner"';
    });

    await check('walk', 'Pat goes back to level 1 and on with Next level; Sam\'s screen is not moved', async () => {
      await robotOf(pat.page, win).getByRole('tab', { name: '1', exact: true }).click();
      await runProgram(pat.page, win, FOUR_MOVES);
      await outcomeOf(pat.page, win);
      await robotOf(pat.page, win).getByTestId('robot-next').click({ timeout: 10_000 });
      const titles = await Promise.all([pat, sam].map((p) => robotOf(p.page, win).locator('.hb-robot-brief .hb-game-title').innerText().catch(() => '')));
      if (squish(titles[0]) !== 'Turn the corner') throw new Error(`Next level took Pat to "${squish(titles[0])}"`);
      if (squish(titles[1]) !== 'Turn the corner') throw new Error(`Sam's own level changed to "${squish(titles[1])}"`);
      return 'Pat went back to level 1 and on to "Turn the corner" with Next level, while Sam\'s window stayed on Sam\'s own level';
    });

    await runCodeRobotRedTeam(t, () => win);
  },
};
