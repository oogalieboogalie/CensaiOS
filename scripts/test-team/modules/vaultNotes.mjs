// Vault notes opens on your own notes, not a stranger's. Pat Example opens
// Vault notes from the Add menu and finds an empty vault with a New note
// button, the recipe only under Examples (labelled as one) and no made-up
// computer path. Pat names and writes a note, Sam Example sees it on the
// shared board, and after a reload both still have it. The example opens
// read-only on Pat's screen only (Sam keeps the note open) and "Copy to my
// notes" makes it a note Pat can change. Bug hunt: Pat and Sam type in the
// same note at the same moment and both keep their words; they each start a
// note at the same moment and both are kept; Delete asks first, "Keep it"
// keeps the note and "Delete it" removes it for both; and on a brand-new vault
// both of their first notes show. (Two first notes made in the very same
// instant are covered by a unit test: browsers cannot click that closely.)
// All people are made up.

import { openBoard, windowFrame } from '../../e2e/board.mjs';
import { addFromMenu } from '../addMenu.mjs';
import { sideBySide } from '../sideBySide.mjs';

const TITLE = 'Made-up shopping list';
const BODY = '- made-up apples\n- made-up flour';
const EXAMPLE = 'Brown butter nectarine tart';
const PAT_ADDS = '- made-up pears';
const SAM_ADDS = '- made-up milk';
// The old vault's breadcrumbs looked like a real person's computer.
const STRANGER = /\balma\b|Users\s*\/\s*\w+\s*\/\s*Desktop/;

/** What one person's Vault notes window shows. */
const view = (page, id) => page.evaluate((wid) => {
  const frame = document.querySelector(`[data-win-id="${wid}"]`);
  if (!frame) return null;
  const list = (name) => [...(frame.querySelector(`ul[aria-label="${name}"]`)?.querySelectorAll('li') || [])]
    .map((li) => li.textContent.trim());
  const title = frame.querySelector('input[aria-label="Note title"]');
  const body = frame.querySelector('textarea[aria-label="Note text"]');
  return {
    text: frame.textContent.replace(/\s+/g, ' '),
    vault: (frame.querySelector('[data-testid="vault-notes"]')?.textContent || '').replace(/\s+/g, ' '),
    mine: list('Notes'),
    examples: list('Examples'),
    title: title ? title.value : null,
    body: body ? body.value : null,
    readOnly: body ? body.readOnly : null,
    crumbs: frame.querySelector('[aria-label="Breadcrumb"]')?.textContent.replace(/\s+/g, ' ') ?? null,
    titleHasCursor: Boolean(title) && document.activeElement === title,
  };
}, id);

const showsNote = (page, id, title, timeout = 10_000) => page.waitForFunction(([wid, t]) => {
  const items = document.querySelector(`[data-win-id="${wid}"] ul[aria-label="Notes"]`)?.querySelectorAll('li') || [];
  return [...items].some((li) => li.textContent.trim() === t);
}, [id, title], { timeout, polling: 250 }).then(() => true, () => false);

const lost = (page, id, title, timeout = 10_000) => page.waitForFunction(([wid, t]) => {
  const items = document.querySelector(`[data-win-id="${wid}"] ul[aria-label="Notes"]`)?.querySelectorAll('li') || [];
  return ![...items].some((li) => li.textContent.trim() === t);
}, [id, title], { timeout, polling: 250 }).then(() => true, () => false);

async function closeWindow(page, wid) {
  await windowFrame(page, wid).locator('[data-window-control="close"]').click({ timeout: 5_000 });
  await windowFrame(page, wid).waitFor({ state: 'detached', timeout: 5_000 });
  await page.waitForTimeout(500);
}

const said = (v) => (v ? `"${v.vault.slice(0, 160)}"` : 'no Vault notes window');

export default {
  id: 'vaultNotes',
  label: 'Vault notes opens on your own notes',
  async run(t) {
    const { pat, sam, check } = t;
    let id = null;
    const sidebar = (page) => windowFrame(page, id).getByLabel('Vault sidebar');
    t.typed.push(TITLE, 'made-up apples', 'made-up pears', 'made-up milk');

    await check('walk', 'Pat opens Vault notes from the Add menu: an empty vault with a "New note" button, the recipe only under Examples and labelled as one, and no made-up computer path', async ({ shot }) => {
      const opened = await addFromMenu(pat.page, 'Vault notes');
      if (opened.kind !== 'vaultNotes') throw new Error(`the Add menu opened ${opened.kind || 'nothing'}, not Vault notes`);
      id = opened.id;
      const v = await view(pat.page, id);
      await shot(pat.page, 'new-vault');
      if (!v) throw new Error('the Vault notes window is not on Pat\'s screen');
      if (STRANGER.test(v.text)) throw new Error(`the new vault shows a made-up computer path: ${said(v)}`);
      if (!/Your vault is empty/.test(v.text) || v.mine.length) throw new Error(`the new vault is not empty: ${said(v)}`);
      if (!(await sidebar(pat.page).getByRole('button', { name: 'New note' }).count())) throw new Error('there is no "New note" button');
      if (!v.examples.some((e) => e.startsWith(EXAMPLE) && /example/i.test(e))) throw new Error(`the recipe is not under Examples, labelled as one: ${said(v)}`);
      return `empty vault with "New note"; Examples lists "${EXAMPLE}", labelled "Example"`;
    });

    await check('walk', 'Pat clicks "New note", names it and writes in it; Sam sees the note and its words on the shared board', async ({ shot }) => {
      await sidebar(pat.page).getByRole('button', { name: 'New note' }).click();
      await pat.page.waitForTimeout(300);
      const fresh = await view(pat.page, id);
      if (fresh?.title !== 'Untitled' || !fresh.titleHasCursor) throw new Error(`after New note the title says "${fresh?.title}"${fresh?.titleHasCursor ? '' : ' and the cursor is not in it'}`);
      await pat.page.keyboard.type(TITLE, { delay: 10 });
      await windowFrame(pat.page, id).getByLabel('Note text').click();
      await pat.page.keyboard.type(BODY, { delay: 10 });
      const seen = await showsNote(sam.page, id, TITLE);
      await sam.page.waitForTimeout(800);
      await sideBySide(t, 'pat-writes-a-note-sam-sees-it', shot);
      const [p, s] = await Promise.all([view(pat.page, id), view(sam.page, id)]);
      if (p.title !== TITLE || p.body !== BODY) throw new Error(`Pat's note reads "${p.title}": "${p.body}"`);
      if (!p.mine.includes(TITLE) || !/^Vault\s*\/\s*\S/.test(p.crumbs || '')) throw new Error(`Pat's vault lists ${JSON.stringify(p.mine)} under "${p.crumbs}"`);
      if (!seen || s.body !== BODY) throw new Error(`Sam's screen shows ${said(s)}`);
      return `"${TITLE}" is under Notes on both screens, with Pat's two lines`;
    });

    await check('walk', 'after both reload, the note is still there and open on both screens', async ({ shot }) => {
      await Promise.all([pat, sam].map((p) => openBoard(p.page, t.workspaceId, t.web)));
      const back = await Promise.all([pat, sam].map((p) => showsNote(p.page, id, TITLE, 20_000)));
      await sideBySide(t, 'after-reload', shot);
      const [p, s] = await Promise.all([view(pat.page, id), view(sam.page, id)]);
      if (!back.every(Boolean)) throw new Error(`after the reload Pat's screen shows ${said(p)}; Sam's ${said(s)}`);
      if (p.body !== BODY || s.body !== BODY) throw new Error('after the reload the note\'s words are not open on both screens');
      return 'both screens list the note and show its words';
    });

    await check('walk', 'the example opens read-only and labelled, on Pat\'s screen only; "Copy to my notes" makes it a note Pat can change', async ({ shot }) => {
      const frame = windowFrame(pat.page, id);
      await frame.getByRole('list', { name: 'Examples' }).getByRole('button', { name: new RegExp(EXAMPLE) }).click();
      await pat.page.waitForTimeout(800);
      const [ex, s] = await Promise.all([view(pat.page, id), view(sam.page, id)]);
      await sideBySide(t, 'example-open-on-pats-screen', shot);
      if (!/This is an example note/.test(ex.text) || !ex.readOnly || !/^Examples\s*\/\s*\S/.test(ex.crumbs || '')) throw new Error(`the example is not shown as one (read-only: ${ex.readOnly}, breadcrumb "${ex.crumbs}"): ${said(ex)}`);
      if (s.body !== BODY) throw new Error(`Pat opening the example changed Sam's screen too: ${said(s)}`);
      await frame.getByLabel('Note text').click();
      await pat.page.keyboard.type('made-up change');
      if ((await view(pat.page, id)).body !== ex.body) throw new Error('typing changed the example');
      await frame.getByRole('button', { name: 'Copy to my notes' }).click();
      await pat.page.waitForTimeout(500);
      const copied = await view(pat.page, id);
      await shot(pat.page, 'example-copied');
      if (!copied.mine.includes(EXAMPLE) || copied.examples.length || copied.readOnly) throw new Error(`after the copy the vault shows ${said(copied)}`);
      return `"${EXAMPLE}" is now under Notes and can be typed in; Examples is empty`;
    });

    await check('hunt', 'Pat and Sam type in the same note at the same moment, Pat at the end and Sam at the top: both keep their words, on both screens', async ({ shot }) => {
      const notesList = (page) => windowFrame(page, id).getByRole('list', { name: 'Notes', exact: true });
      await Promise.all([pat, sam].map((p) => notesList(p.page).getByRole('button', { name: TITLE }).click()));
      await Promise.all([pat, sam].map((p) => windowFrame(p.page, id).getByLabel('Note text').click()));
      await pat.page.keyboard.press('Control+End');
      await sam.page.keyboard.press('Control+Home');
      await Promise.all([
        pat.page.keyboard.type(`\n${PAT_ADDS}`, { delay: 40 }),
        sam.page.keyboard.type(`${SAM_ADDS}\n`, { delay: 40 }),
      ]);
      const want = `${SAM_ADDS}\n${BODY}\n${PAT_ADDS}`;
      const settled = await Promise.all([pat, sam].map((p) => p.page.waitForFunction(([wid, w]) => document
        .querySelector(`[data-win-id="${wid}"] textarea[aria-label="Note text"]`)?.value === w, [id, want], { timeout: 10_000, polling: 250 })
        .then(() => true, () => false)));
      await sideBySide(t, 'both-type-in-one-note', shot);
      const [p, s] = await Promise.all([view(pat.page, id), view(sam.page, id)]);
      if (!settled.every(Boolean)) throw new Error(`the note reads ${JSON.stringify(p.body)} on Pat's screen and ${JSON.stringify(s.body)} on Sam's`);
      return 'the note has Sam\'s line at the top, Pat\'s at the end and the two first lines between, on both screens';
    });

    await check('hunt', 'Pat and Sam each click "New note" at the same moment: both new notes are kept on both screens', async ({ shot }) => {
      const before = (await view(pat.page, id)).mine.length;
      await Promise.all([pat, sam].map((p) => sidebar(p.page).getByRole('button', { name: 'New note' }).click()));
      await pat.page.waitForTimeout(3000);
      await sideBySide(t, 'both-start-a-note', shot);
      const [p, s] = await Promise.all([view(pat.page, id), view(sam.page, id)]);
      const added = [p.mine.length - before, s.mine.length - before];
      if (added[0] !== 2 || added[1] !== 2) throw new Error(`Pat's list gained ${added[0]} note(s), Sam's ${added[1]}`);
      return 'both lists gained the two new notes';
    });

    await check('hunt', 'Delete asks first: "Keep it" keeps the note, "Delete it" removes it from both screens', async ({ shot }) => {
      const frame = windowFrame(pat.page, id);
      await frame.getByRole('list', { name: 'Notes', exact: true }).getByRole('button', { name: TITLE }).click();
      await frame.getByRole('button', { name: 'Delete note' }).click();
      const asked = await frame.getByText('Delete this note?').count();
      await shot(pat.page, 'delete-asks-first');
      await frame.getByRole('button', { name: 'Keep it' }).click();
      const kept = (await view(pat.page, id)).mine.includes(TITLE);
      await frame.getByRole('button', { name: 'Delete note' }).click();
      await frame.getByRole('button', { name: 'Delete it' }).click();
      const gone = await Promise.all([lost(pat.page, id, TITLE), lost(sam.page, id, TITLE)]);
      if (!asked) throw new Error('Delete removed the note without asking');
      if (!kept) throw new Error('"Keep it" did not keep the note');
      if (!gone.every(Boolean)) throw new Error(`after "Delete it" the note is still on ${gone[0] ? 'Sam\'s' : 'Pat\'s'} screen`);
      return 'asked "Delete this note?"; Keep it kept it; Delete it removed it on both screens';
    });

    await check('hunt', 'On a brand-new vault from the Add menu, Pat and Sam each click "New note": both first notes show on both screens', async ({ shot }) => {
      await closeWindow(pat.page, id);
      const opened = await addFromMenu(pat.page, 'Vault notes');
      if (opened.kind !== 'vaultNotes') throw new Error(`the Add menu opened ${opened.kind || 'nothing'}, not Vault notes`);
      const fresh = opened.id;
      const seen = await sam.page.waitForFunction((wid) => Boolean(document.querySelector(`[data-win-id="${wid}"] [data-testid="vault-notes"]`)), fresh, { timeout: 10_000 })
        .then(() => true, () => false);
      if (!seen) throw new Error('the new vault never showed on Sam\'s screen');
      const newIn = (page) => windowFrame(page, fresh).getByLabel('Vault sidebar').getByRole('button', { name: 'New note' });
      await Promise.all([pat, sam].map((p) => newIn(p.page).click()));
      await pat.page.waitForTimeout(3000);
      await sideBySide(t, 'both-start-the-first-note', shot);
      const [p, s] = await Promise.all([view(pat.page, fresh), view(sam.page, fresh)]);
      if (p.mine.length !== 2 || s.mine.length !== 2) throw new Error(`Pat's new vault lists ${JSON.stringify(p.mine)}, Sam's ${JSON.stringify(s.mine)}`);
      return 'both screens list the two first notes';
    });
  },
};
