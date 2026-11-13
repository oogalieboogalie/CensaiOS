// Workflow for two people. Pat Example opens a step and types its
// instructions; Sam Example sees the words on the shared board as they are
// typed. Then, at the same moment, Pat types at the start of the step's
// instructions while Sam types at the end: both people's words must be whole
// on both screens, and Pat's cursor must stay right after Pat's own words.
// Last, Pat types in one step while Sam renames another: both changes stay.
// All words are made up.

import { readWindow, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const stepOf = async (page, id, sid) => (await readWindow(page, id))?.graph?.nodes?.find((n) => n.id === sid) || {};

async function bothSee(t, id, sid, test, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await Promise.all([t.pat, t.sam].map((p) => stepOf(p.page, id, sid)));
    if (seen.every(test) || Date.now() > until) return seen;
    await t.pat.page.waitForTimeout(250);
  }
}

// The inspector's boxes, found by place: a box's name grows with its words.
const BOXES = { 'What should it do?': 'textarea', Name: 'input.hb-wf-input' };
const box = (page, id, label) => windowFrame(page, id).locator(`.hb-wf-inspector ${BOXES[label]}`).first();
async function pick(page, id, sid) {
  await windowFrame(page, id).locator(`[data-wf-node="${sid}"] .hb-wf-node-title`).click({ timeout: 15_000 });
}

export default {
  id: 'workflowStepTyping',
  label: 'Workflow: two people type in one step',
  async run(t) {
    const { pat, sam, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const W = { start: `Plan for Sam Example ${run}`, pat: 'First: ', sam: ', in five lines', name: 'Plan card' };
    t.typed.push(...Object.values(W).map((w) => w.trim()));
    let win;

    await check('walk', "Pat types a step's instructions and Sam sees the words while Pat is still typing", async ({ shot }) => {
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
      await pick(pat.page, win, 'draft');
      await box(pat.page, win, 'What should it do?').pressSequentially(W.start, { delay: 10 });
      const [, samSaw] = await bothSee(t, win, 'draft', (n) => n.instructions === W.start);
      await pick(sam.page, win, 'draft');
      await shot(sam.page, 'sam-sees-the-words');
      if (samSaw.instructions !== W.start) throw new Error(`Sam's copy reads "${samSaw.instructions ?? ''}"`);
      return 'Sam has the same words, letter for letter, while Pat is still in the box';
    });

    await check('walk', 'Pat and Sam type in one step at once; both keep their words', async ({ shot }) => {
      const [patBox, samBox] = [box(pat.page, win, 'What should it do?'), box(sam.page, win, 'What should it do?')];
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(0, 0); });
      await samBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially(W.pat, { delay: 60 }),
        samBox.pressSequentially(W.sam, { delay: 15 }),
      ]);
      const want = `${W.pat}${W.start}${W.sam}`;
      const seen = await bothSee(t, win, 'draft', (n) => n.instructions === want);
      await sideBySide(t, 'both-typed-in-one-step', shot);
      const caret = await patBox.evaluate((el) => el.value.slice(0, el.selectionStart));
      const bad = seen.find((n) => n.instructions !== want);
      if (bad) throw new Error(`a screen's step reads "${bad.instructions}"`);
      if (caret !== W.pat) throw new Error(`Pat's cursor moved: it sits after "${caret.slice(-24)}"`);
      return "both screens read the same words with Pat's and Sam's whole; Pat's cursor stayed after Pat's words";
    });

    await check('walk', 'Pat types in one step while Sam renames another; both changes stay', async ({ shot }) => {
      await pick(sam.page, win, 'result');
      const samName = box(sam.page, win, 'Name');
      await samName.fill('');
      const patBox = box(pat.page, win, 'What should it do?');
      await patBox.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
      await Promise.all([
        patBox.pressSequentially('.', { delay: 30 }),
        samName.pressSequentially(W.name, { delay: 30 }),
      ]);
      const want = `${W.pat}${W.start}${W.sam}.`;
      const [draft] = [await bothSee(t, win, 'draft', (n) => n.instructions === want)];
      const result = await bothSee(t, win, 'result', (n) => n.title === W.name);
      await sideBySide(t, 'step-and-name-at-once', shot);
      if (draft.some((n) => n.instructions !== want)) throw new Error("Pat's words were lost");
      if (result.some((n) => n.title !== W.name)) throw new Error("Sam's new name was lost");
      return "Pat's words and Sam's new step name are on both screens";
    });
  },
};
