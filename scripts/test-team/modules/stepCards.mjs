// Step cards for two people. Pat Example opens a made-up .todo file with
// three cards and hands one to a board agent; Sam Example sees the same cards
// and who has the card, ticks a step (pastes what was done and presses Check
// this step; the stand-in model reads it over) and Pat sees the step finished.
// Hunt: Pat removes a card at the moment Sam checks it (both screens must
// agree it is gone), and a card whose title carries a script tag shows it as
// words. The log keeps counts, never card words.

import { spawnWindow, windowFrame, readWindow } from '../../e2e/board.mjs';
import { note } from '../report.mjs';
import { STEP_DONE } from '../standinStepCheck.mjs';

const SCRIPT = '<script>window.__madeUpPwned = 168</script><img src=x onerror="window.__madeUpPwned = 168"> made-up card';

function todoFile(run) {
  let n = 0;
  const card = (title, steps) => [`== Card ${n += 1}: ${title}`, 'Goal: Made-up goal for a made-up shop.', '', ...steps.flatMap((s, i) => [`-- Step ${i + 1}: ${s}`, `Made-up words for ${s.toLowerCase()}.`, `[ ] ask ${s} is done`, ''])];
  return [
    'censaiOS to-do file', `Title: Made-up shop cards ${run}`, '',
    ...card(`Made-up paint the sign ${run}`, ['Buy the paint', 'Paint the sign']),
    ...card(`Made-up fix the shelf ${run}`, ['Find the screws', 'Fix the shelf']),
    ...card(`${SCRIPT} ${run}`, ['Sweep up', 'Lock the door']),
  ].join('\n');
}

const cardsOn = async (page, id) => (await readWindow(page, id))?.cards || [];
const titles = (cards) => cards.map((c) => c.title).sort().join(' | ');

async function waitCards(page, id, test, ms = 15_000) {
  const until = Date.now() + ms;
  let cards = [];
  while (Date.now() < until) {
    cards = await cardsOn(page, id);
    if (test(cards)) return cards;
    await page.waitForTimeout(300);
  }
  return cards;
}

async function pick(page, id, title) {
  await windowFrame(page, id).locator('.hb-sc-card-main', { hasText: title }).first().click({ timeout: 10_000 });
}

export default {
  id: 'stepCards',
  label: 'Step cards: two people on one stack',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const PAINT = `Made-up paint the sign ${run}`;
    const SHELF = `Made-up fix the shelf ${run}`;
    t.typed.push(PAINT, SHELF, STEP_DONE);
    let win;

    await check('walk', 'Pat opens a made-up .todo file with three cards and hands one to a board agent', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'stepCards', {}, { x: 50, y: 50 }, { w: 960, h: 620 });
      const frame = windowFrame(pat.page, win);
      await frame.locator('input[type="file"]').setInputFiles({ name: 'made-up-shop.todo', mimeType: 'text/plain', buffer: Buffer.from(todoFile(run)) });
      await frame.locator('.hb-sc-card-main', { hasText: SHELF }).waitFor({ timeout: 15_000 });
      const row = frame.locator('.hb-sc-card', { hasText: SHELF });
      await row.locator('.hb-sc-assign').click();
      const agent = pat.page.getByText('Board agents', { exact: true }).locator('xpath=following-sibling::*[1]');
      await agent.waitFor({ timeout: 10_000 }).catch(() => { throw note('the assign menu lists no board agent'); });
      await agent.click();
      const cards = await waitCards(pat.page, win, (list) => list.find((c) => c.title.endsWith(SHELF))?.assignee);
      await shot(pat.page, 'pat-hands-a-card-to-an-agent');
      if (cards.length !== 3) throw new Error(`the stack holds ${cards.length} card(s)`);
      const shelf = cards.find((c) => c.title.endsWith(SHELF));
      if (!shelf?.assignee || /^(user|cli):/.test(shelf.assignee)) throw new Error(`the shelf card went to "${shelf?.assignee || 'nobody'}"`);
      return `three cards; the shelf card is for ${shelf.assigneeName}`;
    });

    await check('walk', 'Sam sees the same cards and who has the shelf card', async ({ shot }) => {
      if (!win) throw note('the Step cards window never opened');
      const frame = windowFrame(sam.page, win);
      await frame.locator('.hb-sc-card-main', { hasText: SHELF }).waitFor({ timeout: 15_000 });
      await pick(sam.page, win, SHELF);
      const name = (await cardsOn(sam.page, win)).find((c) => c.title.endsWith(SHELF))?.assigneeName;
      await frame.getByText(`For ${name}`).first().waitFor({ timeout: 10_000 }).catch(() => {});
      await shot(sam.page, 'sam-sees-the-cards');
      const [patCards, samCards] = await Promise.all([cardsOn(pat.page, win), cardsOn(sam.page, win)]);
      if (titles(patCards) !== titles(samCards)) throw new Error('Sam\'s stack differs from Pat\'s');
      if (!(await frame.getByText(`For ${name}`).count())) throw new Error(`Sam's screen does not say the card is for ${name}`);
      return `Sam sees the same three cards, and "For ${name}" on the shelf card`;
    });

    await check('walk', 'Sam ticks a step and Pat sees it finished', async ({ shot }) => {
      await pick(sam.page, win, PAINT);
      const frame = windowFrame(sam.page, win);
      await frame.locator('.hb-sc-report textarea').fill(STEP_DONE);
      await frame.getByRole('button', { name: 'Check this step' }).click();
      const done = (cards) => cards.find((c) => c.title.endsWith(PAINT))?.steps?.[0]?.done;
      await waitCards(pat.page, win, done, 20_000);
      await pick(pat.page, win, PAINT);
      const pframe = windowFrame(pat.page, win);
      await pframe.getByText('1 of 2 steps finished').first().waitFor({ timeout: 10_000 }).catch(() => {});
      await shot(pat.page, 'pat-sees-sams-tick');
      if (!done(await cardsOn(pat.page, win))) throw new Error('the step did not finish on Pat\'s screen');
      if (!(await pframe.getByText('1 of 2 steps finished').count())) throw new Error('Pat\'s screen does not say 1 of 2 steps finished');
      return 'Sam\'s check turned the step green; Pat sees "1 of 2 steps finished"';
    });

    await check('hunt', 'a card title with a script tag shows as words and runs nowhere', async ({ shot }) => {
      await pick(sam.page, win, 'made-up card');
      await sam.page.waitForTimeout(500);
      await shot(sam.page, 'sam-sees-the-script-as-words');
      const problems = [];
      for (const [who, page] of [['Pat', pat.page], ['Sam', sam.page]]) {
        if (await page.evaluate(() => window.__madeUpPwned)) problems.push(`the script ran on ${who}'s screen`);
      }
      if (!(await windowFrame(sam.page, win).innerText()).includes('<script>')) problems.push('Sam does not see the tag as words');
      if (problems.length) throw new Error(problems.join('; '));
      return 'both screens show the tag as plain words; nothing ran';
    });

    await check('hunt', 'Pat removes a card at the moment Sam checks it; both screens agree it is gone', async ({ shot }) => {
      await Promise.all([pick(pat.page, win, SHELF), pick(sam.page, win, SHELF)]);
      await sam.page.waitForTimeout(800);
      await shot(sam.page, 'sam-opens-the-shelf-card');
      await windowFrame(sam.page, win).locator('.hb-sc-report textarea').fill('Made-up: half done', { timeout: 10_000 });
      await Promise.all([
        windowFrame(sam.page, win).getByRole('button', { name: 'Check this step' }).click(),
        pat.page.getByRole('button', { name: 'Remove this card' }).first().click({ timeout: 5000 }),
      ]);
      await pat.page.waitForTimeout(3000);
      const [patCards, samCards] = await Promise.all([cardsOn(pat.page, win), cardsOn(sam.page, win)]);
      await shot(sam.page, 'sam-after-pat-removes');
      const problems = [];
      if (titles(patCards) !== titles(samCards)) problems.push(`Pat has ${patCards.length} card(s) and Sam ${samCards.length}`);
      if (patCards.some((c) => c.title.endsWith(SHELF)) || samCards.some((c) => c.title.endsWith(SHELF))) problems.push('the removed card came back');
      if (problems.length) throw new Error(problems.join('; '));
      return `both screens hold the same ${patCards.length} cards; the removed one stays gone`;
    });

    await check('redteam', 'the log keeps counts, never card words or what was pasted', async () => {
      const words = [PAINT, SHELF, 'made-up card', STEP_DONE, 'half done', 'Buy the paint'];
      const bad = t.serverLog().split('\n').filter((line) => words.some((w) => line.includes(w)));
      if (bad.length) throw new Error(`${bad.length} log lines carry card words`);
      return 'no log line carries a card title, a step or a report';
    });
  },
};
