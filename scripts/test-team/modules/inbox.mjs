// Inbox for two people. The Inbox is not mail: it lists what needs a person
// (pull requests, coding agents, error reports, invites and the to-dos handed
// to them). The window is shared on the board, but each screen asks the
// server for its own list. Pat Example hands one made-up to-do to Pat and one
// to Sam Example; each sees only their own in the Inbox. Red team: Sam never
// gets Pat's to-do or Pat's address (on the screen, in any answer, in the
// to-do reminder), Pat's acknowledge leaves no address on the shared window,
// and the server log keeps no to-do words or addresses. The cloud runner has
// no GitHub token and no coding CLIs, so pull requests and agents stay empty.

import { spawnWindow, windowFrame, readWindow, PAT } from '../../e2e/board.mjs';
import { note } from '../report.mjs';

const myId = (page) => page.evaluate(async () => (await (await fetch('/api/auth/session', { credentials: 'include' })).json())?.user?.id ?? null);

function listen(page) {
  const bodies = [];
  page.on('response', async (res) => {
    try { bodies.push(await res.text()); } catch { /* streamed or gone */ }
  });
  return bodies;
}

/** Presses Refresh until the Inbox on this screen lists `words`, or time runs out. */
async function inboxShows(page, id, words, ms = 40_000) {
  const frame = windowFrame(page, id);
  const until = Date.now() + ms;
  let text = '';
  while (Date.now() < until) {
    text = await frame.innerText().catch(() => '');
    if (text.includes(words)) return text;
    await frame.getByRole('button', { name: /^Refresh/ }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  return text;
}

export default {
  id: 'inbox',
  label: 'Inbox: two people, each sees only their own',
  async run(t) {
    const { pat, sam, check } = t;
    // Each run (dark, then light) gets its own words.
    const run = Date.now().toString(36).slice(-4);
    const FOR_PAT = `Made-up: order the blue paint ${run}`;
    const FOR_SAM = `Made-up: sweep the porch ${run}`;
    t.typed.push(FOR_PAT, FOR_SAM);
    const samHeard = listen(sam.page);
    let win;

    await check('walk', 'Pat hands one made-up to-do to each person and both open the Inbox', async ({ shot }) => {
      const [patId, samId] = await Promise.all([myId(pat.page), myId(sam.page)]);
      const list = await spawnWindow(pat.page, 'todos', { title: 'Made-up chores' }, { x: 40, y: 60 }, { w: 380, h: 300 });
      await pat.page.evaluate(({ id, items }) => window.__e2eStore.getState().onUpdate(id, { items }), {
        id: list,
        items: [
          { id: `pat-${run}`, text: FOR_PAT, done: false, assignee: `user:${patId}`, assigneeName: 'Pat Example' },
          { id: `sam-${run}`, text: FOR_SAM, done: false, assignee: `user:${samId}`, assigneeName: 'Sam Example' },
        ],
      });
      win = await spawnWindow(pat.page, 'inbox', {}, { x: 440, y: 60 }, { w: 900, h: 560 });
      const [patSaw, samSaw] = await Promise.all([inboxShows(pat.page, win, FOR_PAT), inboxShows(sam.page, win, FOR_SAM)]);
      await shot(pat.page, 'pat-sees-own-to-do');
      await shot(sam.page, 'sam-sees-own-to-do');
      const problems = [];
      if (!patSaw.includes(FOR_PAT)) problems.push('Pat\'s Inbox does not list Pat\'s to-do');
      if (!samSaw.includes(FOR_SAM)) problems.push('Sam\'s Inbox does not list Sam\'s to-do');
      if (problems.length) throw new Error(problems.join('; '));
      return 'Pat\'s Inbox lists Pat\'s to-do and Sam\'s lists Sam\'s, in the same window on the board';
    });

    await check('redteam', 'Sam never gets Pat\'s to-do or Pat\'s address', async () => {
      if (!win) throw note('the Inbox never opened');
      const screen = await windowFrame(sam.page, win).innerText().catch(() => '');
      const inbox = await t.api(sam, 'GET', '/api/inbox');
      const mine = await t.api(sam, 'GET', '/api/inbox/my-todos');
      const patInbox = await t.api(pat, 'GET', '/api/inbox');
      const places = [['Sam\'s Inbox window', screen], ['Sam\'s Inbox answer', inbox.text], ['Sam\'s to-do reminder answer', mine.text],
        ['the answers Sam\'s browser got', samHeard.join('\n')]];
      const seen = places.filter(([, text]) => String(text).includes(FOR_PAT) || String(text).includes(PAT.email)).map(([where]) => where);
      if (seen.length) throw new Error(`Pat's to-do or address shows in ${seen.join(', ')}`);
      if (String(patInbox.text).includes(FOR_SAM)) throw new Error('Pat\'s Inbox answer carries Sam\'s to-do');
      return `checked Sam's window, Sam's Inbox and reminder answers and ${samHeard.length} answers: no "${FOR_PAT.slice(0, 26)}…", no address; Pat's answer has nothing of Sam's either`;
    });

    await check('redteam', 'Pat acknowledges a to-do; the shared window keeps a name, never an address or the words', async ({ shot }) => {
      if (!win) throw note('the Inbox never opened');
      const frame = windowFrame(pat.page, win);
      await frame.locator('.hb-inbox-row', { hasText: FOR_PAT }).first().click({ timeout: 10_000 });
      await frame.locator('.hb-inbox-ack').first().click({ timeout: 10_000 });
      await pat.page.waitForTimeout(1500);
      const shared = JSON.stringify(await readWindow(sam.page, win));
      await shot(sam.page, 'sam-after-pats-acknowledge');
      const acks = Object.values((await readWindow(sam.page, win))?.inboxAcks || {});
      if (!acks.length) throw note('the acknowledge did not reach the shared window');
      const problems = [];
      if (shared.includes(PAT.email) || /@example\.com/.test(shared)) problems.push('an address is on the shared window');
      if (shared.includes(FOR_PAT)) problems.push('Pat\'s to-do words are on the shared window');
      const samSees = await inboxShows(sam.page, win, FOR_SAM, 5000);
      if (!samSees.includes(FOR_SAM)) problems.push('Sam\'s own to-do left Sam\'s Inbox');
      if (problems.length) throw new Error(problems.join('; '));
      return `the shared window holds ${acks.length} acknowledge(s) signed "${acks[0]?.by}"; no address, no to-do words; Sam's own to-do stays`;
    });

    await check('redteam', 'the server log keeps no to-do words or addresses', async () => {
      const lines = t.serverLog().split('\n').filter((line) => /inbox|todos|my-todos/i.test(line));
      const bad = lines.filter((line) => line.includes(FOR_PAT) || line.includes(FOR_SAM) || /@example\.com|Example/.test(line));
      if (bad.length) throw new Error(`${bad.length} log lines carry to-do words, a name or an address`);
      return `${lines.length} Inbox and to-do log lines; none carries to-do words, a name or an address`;
    });
  },
};
