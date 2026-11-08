// Live cursors in a Workflow step for two people. Pat Example opens a step
// and types its instructions; Sam Example opens the same step and puts the
// cursor after "Write a". Pat must see a line with Sam's name at that spot,
// and when Pat types in front of it the line must move with Sam's words.
// When Sam clicks away, it leaves Pat's screen. Nothing is written by the AI,
// so no key is needed. All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const WORDS = 'Write a short plan for the made-up open house';
const SPOT = 'Write a'.length;
const PAT_WORDS = 'First: ';

const box = (page, id) => windowFrame(page, id).locator('.hb-wf-inspector textarea').first();
const markOf = (b, name) => b.locator('xpath=..').locator(`[data-teammate-caret="${name}"]`);
const wordsOf = async (page, id) => String((await readWindow(page, id))?.graph?.nodes?.find((n) => n.id === 'draft')?.instructions ?? '');

async function waitFor(fn, ms, page) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await page.waitForTimeout(200);
  }
}

async function pick(page, id) {
  await windowFrame(page, id).locator('[data-wf-node="draft"] .hb-wf-node-title').click({ timeout: 15_000 });
  await box(page, id).waitFor({ timeout: 10_000 });
}

const markAt = async (page, id, name) => {
  const m = markOf(box(page, id), name);
  return (await m.count()) ? m.getAttribute('data-at') : null;
};

export default {
  id: 'workflowStepCursors',
  label: "Workflow: see a teammate's cursor in a step",
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(WORDS, PAT_WORDS.trim());
    let win;

    await check('walk', "Pat types a made-up step's instructions, and Sam opens the step", async ({ shot }) => {
      win = await spawnWindow(pat.page, 'workflow', {
        title: 'Made-up open house',
        graph: {
          nodes: [
            { id: 'start', type: 'trigger', x: 24, y: 120, title: 'Start', mode: 'manual', everyMinutes: 60, windowKind: 'doc', input: 'Made-up open house.' },
            { id: 'draft', type: 'agent', x: 250, y: 120, title: 'Draft', agentId: 'censai', instructions: '' },
            { id: 'result', type: 'output', x: 476, y: 120, title: 'Result card' },
          ],
          edges: [{ id: 'e1', from: 'start', to: 'draft' }, { id: 'e2', from: 'draft', to: 'result' }],
        },
      }, { x: 40, y: 40 }, { w: 1100, h: 640 });
      await pick(pat.page, win);
      await box(pat.page, win).pressSequentially(WORDS, { delay: 8 });
      const ok = await waitFor(async () => (await wordsOf(sam.page, win)) === WORDS, 15_000, pat.page);
      await pick(sam.page, win);
      await shot(sam.page, 'sam-sees-the-step');
      if (!ok) throw new Error("Sam's copy of the step does not match");
      return 'Sam has the same step open';
    });

    await check('walk', "Sam puts the cursor after 'Write a'; Pat sees Sam's name there", async ({ shot }) => {
      await box(pat.page, win).evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await box(pat.page, win).press('End');
      await box(sam.page, win).evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, SPOT);
      await box(sam.page, win).press('Shift');
      const at = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === String(SPOT) ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'pat-sees-sams-cursor', shot);
      if (!at) throw new Error(`Pat sees Sam's cursor at ${(await markAt(pat.page, win, 'Sam Example')) ?? 'nowhere'}, not ${SPOT}`);
      if (!(await markOf(box(sam.page, win), 'Pat Example').count())) throw new Error("Sam does not see Pat's cursor");
      return "Pat sees a line with Sam's name right after \"Write a\", and Sam sees Pat's";
    });

    await check('walk', "Pat types in front; Sam's cursor moves with Sam's words", async ({ shot }) => {
      const patBox = box(pat.page, win);
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await patBox.pressSequentially(PAT_WORDS, { delay: 40 });
      const want = String(SPOT + PAT_WORDS.length);
      const ok = await waitFor(async () => ((await markAt(pat.page, win, 'Sam Example')) === want ? 'ok' : null), 15_000, pat.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'cursor-moves-with-the-words', shot);
      if (!ok) throw new Error(`Sam's cursor sits at ${await markAt(pat.page, win, 'Sam Example')}, not ${want}`);
      return `Sam's line still sits after "Write a" (now letter ${want})`;
    });

    await check('walk', "Sam clicks away; Sam's cursor leaves Pat's screen", async ({ shot }) => {
      await box(sam.page, win).evaluate((el) => el.blur());
      const gone = await waitFor(async () => (await markOf(box(pat.page, win), 'Sam Example').count()) === 0, 15_000, pat.page);
      await shot(pat.page, 'sams-cursor-gone');
      if (!gone) throw new Error("Sam's cursor is still on Pat's screen");
      return "Sam's line is gone from Pat's screen";
    });
  },
};
