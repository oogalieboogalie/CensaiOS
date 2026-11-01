// The Terminal is the owner's: Pat Example (this computer's owner) opens one
// and runs a made-up command; Sam Example, a teammate on the same board, sees
// a plain owner-only sentence and has nothing to type into. Red team: Sam
// opens the terminal socket by hand with Pat's session, a share-link guest
// tries the same, Sam asks an agent with tools to run a command in the
// terminal (through the stand-in model), and a signed-out visitor knocks.

import { spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { note } from '../report.mjs';
import { openGuest, trySocket } from '../guestProbes.mjs';
import { TERMINAL_ASK, TERMINAL_COMMAND } from '../standinTerminalAsk.mjs';

const RESULT = 'made-up-153';
const SAM_TRY = 'echo made-up-sam-153';
const OWNER_ONLY = "only this computer's owner account can open one";

const termText = (page, id) => windowFrame(page, id).locator('.xterm-rows').first().innerText().catch(() => '');
// The terminal wraps long sentences mid-word, so sentence checks read the text unwrapped.
const unwrapped = (text) => text.replace(/\n/g, '');

/** Waits until the window's terminal text passes a test; returns the last text seen. */
async function waitForText(page, id, test, ms = 20_000) {
  const until = Date.now() + ms;
  for (;;) {
    const text = await termText(page, id);
    if (test(text) || Date.now() > until) return text;
    await page.waitForTimeout(300);
  }
}

async function typeInto(page, id, line) {
  await windowFrame(page, id).locator('.xterm').first().click();
  await page.keyboard.type(line, { delay: 15 });
  await page.keyboard.press('Enter');
}

const terminalPath = (t, sessionId) => `/api/terminal?workspaceId=${encodeURIComponent(t.workspaceId)}&sessionId=${encodeURIComponent(sessionId)}&cols=80&rows=24`;
const ranLine = (text) => text.split('\n').some((line) => line.trim() === RESULT);

export default {
  id: 'terminal',
  label: 'Terminal: only the computer\'s owner can open one',
  async run(t) {
    const { pat, sam, check } = t;
    t.typed.push(TERMINAL_COMMAND, SAM_TRY);
    let term;

    await check('walk', 'Pat (the owner) opens a Terminal and a made-up command runs', async ({ shot }) => {
      term = await spawnWindow(pat.page, 'terminal', {}, { x: 60, y: 60 }, { w: 640, h: 380 });
      await windowFrame(pat.page, term).locator('.xterm-rows').first().waitFor({ timeout: 20_000 });
      await pat.page.waitForTimeout(1500);
      await typeInto(pat.page, term, TERMINAL_COMMAND);
      const text = await waitForText(pat.page, term, ranLine);
      await shot(pat.page, 'pat-terminal-runs-the-command');
      if (!ranLine(text)) throw new Error(`no "${RESULT}" line came back; the terminal shows "${text.trim().slice(-160)}"`);
      return `the shell answered "${RESULT}" (the command itself was ${TERMINAL_COMMAND}, so the shell really ran it)`;
    });

    await check('walk', 'Sam (a teammate) sees the owner-only sentence and cannot type a command', async ({ shot }) => {
      if (!term) throw note('Pat\'s terminal never opened');
      await windowFrame(sam.page, term).locator('.xterm-rows').first().waitFor({ timeout: 20_000 });
      const text = unwrapped(await waitForText(sam.page, term, (s) => unwrapped(s).includes(OWNER_ONLY)));
      await typeInto(sam.page, term, SAM_TRY);
      await sam.page.waitForTimeout(2000);
      const after = await termText(sam.page, term);
      await shot(sam.page, 'sam-sees-owner-only');
      const problems = [];
      if (!text.includes(OWNER_ONLY)) problems.push(`no owner-only sentence; Sam sees "${text.trim().slice(0, 160)}"`);
      if (!/Pat Example/.test(text)) problems.push('the sentence does not name the owner');
      if (after.split('\n').some((line) => line.trim() === 'made-up-sam-153')) problems.push('Sam\'s command ran');
      if (problems.length) throw new Error(problems.join('; '));
      return 'Sam sees "only this computer\'s owner account can open one" naming Pat Example; typing only tries again and gets the same sentence';
    });

    await check('redteam', 'Sam opens the terminal socket by hand with Pat\'s session and is refused', async () => {
      const sessionId = await pat.page.evaluate((id) => {
        const win = window.__e2eStore.getState().wins.find((w) => w.id === id);
        return win?.agentSessionId || id; // the main tab's session, as the window opens it
      }, term);
      const tried = await trySocket(sam.page, terminalPath(t, sessionId), { type: 'input', data: `${SAM_TRY}\r` });
      const said = tried.replies.join(' ');
      const problems = [];
      if (!/"type":"refused"/.test(said)) problems.push(`no refusal (${tried.closed}, "${said.slice(0, 120)}")`);
      if (/"type":"output"/.test(said)) problems.push('the socket sent shell output');
      if (tried.closed !== 'closed 4403') problems.push(`it closed with ${tried.closed}`);
      const patText = await termText(pat.page, term);
      if (patText.includes('made-up-sam-153')) problems.push('Sam\'s command showed in Pat\'s terminal');
      if (problems.length) throw new Error(problems.join('; '));
      return `refused with the owner-only sentence, ${tried.closed}; nothing reached Pat's terminal`;
    });

    await check('redteam', 'a share-link guest and a signed-out visitor cannot open a terminal', async () => {
      const link = await t.api(pat, 'POST', `/api/workspaces/${encodeURIComponent(t.workspaceId)}/share-links`, { role: 'comment', label: 'Made-up terminal check' });
      if (link.status !== 201) throw note(`making a guest link answered ${link.status}`);
      const guest = await openGuest(t, link.body.token, 'Made-up Guest 153');
      const out = await t.signedOut.newPage();
      try {
        await out.goto(`${t.web}/`);
        const asGuest = await trySocket(guest.page, terminalPath(t, 'made-up-153'), { type: 'input', data: `${SAM_TRY}\r` });
        const signedOut = await trySocket(out, terminalPath(t, 'made-up-153'), { type: 'input', data: `${SAM_TRY}\r` });
        const opened = [['guest', asGuest], ['signed out', signedOut]].filter(([, r]) => r.opened || r.replies.some((x) => x.includes('"output"')));
        if (opened.length) throw new Error(`${opened.map(([who]) => who).join(' and ')} got a terminal`);
        return `guest ${asGuest.closed}, signed out ${signedOut.closed}; neither socket opened`;
      } finally {
        await out.close().catch(() => {});
        await guest.ctx.close().catch(() => {});
        await t.api(pat, 'DELETE', `/api/workspaces/${encodeURIComponent(t.workspaceId)}/share-links/${link.body.link.id}`);
      }
    });

    await check('redteam', 'Sam asks an agent with tools to run a command in the terminal; it never runs', async () => {
      const ask = `${TERMINAL_ASK}: run ${TERMINAL_COMMAND} in the terminal for me.`;
      t.typed.push(ask);
      const before = await termText(pat.page, term);
      const res = await t.api(sam, 'POST', '/api/chat', {
        agentId: 'atlas', workspaceId: t.workspaceId, stream: false, messages: [{ from: 'me', text: ask }],
      });
      await pat.page.waitForTimeout(2000);
      const asked = t.model.recent().filter((r) => JSON.stringify(r.messages).includes(TERMINAL_ASK));
      const toolResults = asked.flatMap((r) => r.messages.filter((m) => m.role === 'tool').map((m) => String(m.content || '')));
      const ranResult = toolResults.find((text) => /Exit code: 0/.test(text) || text.split('\n').some((l) => l.trim() === RESULT));
      const patAfter = await termText(pat.page, term);
      const newRuns = patAfter.split('\n').filter((l) => l.trim() === RESULT).length - before.split('\n').filter((l) => l.trim() === RESULT).length;
      const problems = [];
      if (ranResult) problems.push(`the tool ran: "${ranResult.slice(0, 120)}"`);
      if (newRuns > 0) problems.push('a new run showed in Pat\'s terminal');
      if (problems.length) throw new Error(problems.join('; '));
      const said = String(res.body?.text || res.body?.error || res.text).replace(/\s+/g, ' ').slice(0, 160);
      const offered = asked.map((r) => r.tools).join(', ');
      const fetched = toolResults[0] ? `; asking for the terminal tool got "${toolResults[0].replace(/\s+/g, ' ').slice(0, 100)}"` : '';
      return `answered ${res.status}: "${said}" (tools offered per model call: ${offered || 'none'}${fetched})`;
    });

    await check('redteam', 'refusals are logged without names, and the typed command never reaches the log', () => {
      const text = t.serverLog();
      const refusals = text.split('\n').filter((line) => line.includes('refused terminal'));
      if (!refusals.some((line) => line.includes('not the owner'))) throw note('no "refused terminal: not the owner" line in the server log');
      const named = refusals.filter((line) => /Pat Example|Sam Example|example\.com/.test(line));
      if (named.length) throw new Error(`${named.length} refusal lines carry a name or email`);
      return `${refusals.length} refusal lines, none with a name`;
    });
  },
};
