// Steps the Code Robot test-team module shares with its red team: type a
// program, press Run, read the outcome and the class list.

import { windowFrame } from '../../e2e/board.mjs';

export const robotOf = (page, id) => windowFrame(page, id).getByTestId('code-robot');
export const squish = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Replaces the program in this person's editor and presses Run. */
export async function runProgram(page, id, code) {
  const robot = robotOf(page, id);
  const editor = robot.locator('.cm-content').first();
  await editor.click({ timeout: 15_000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  // CodeMirror closes brackets on its own, so paste the program as one piece.
  await page.evaluate((text) => document.execCommand('insertText', false, text), code);
  await robot.getByTestId('robot-run').click();
}

/** What the outcome line says once the run (and its replay) is over. */
export async function outcomeOf(page, id, ms = 15_000) {
  const line = robotOf(page, id).getByTestId('robot-outcome');
  await line.waitFor({ timeout: ms });
  return squish(await line.innerText());
}

/** The class list as "name: levels solved" lines. */
export async function classOf(page, id) {
  const list = robotOf(page, id).getByTestId('robot-class');
  return list.locator('li').evaluateAll((rows) => rows.map((li) => {
    const name = li.querySelector('.hb-game-board-name')?.textContent || '';
    const pips = li.querySelector('.hb-robot-pips')?.getAttribute('aria-label') || '';
    return `${name}: ${pips}`;
  })).catch(() => []);
}

export async function classShows(page, id, names, ms = 10_000) {
  const until = Date.now() + ms;
  for (;;) {
    const rows = await classOf(page, id);
    if (names.every((n) => rows.some((r) => r.startsWith(`${n}:`) && !r.includes(': 0 of')))) return rows;
    if (Date.now() > until) return null;
    await page.waitForTimeout(300);
  }
}
