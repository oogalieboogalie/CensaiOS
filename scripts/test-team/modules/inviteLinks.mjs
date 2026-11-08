// Invite links: one-time join links for someone with no account yet. Pat
// Example opens Share, More options, and under "Invite to this board" makes a
// link with no email. A newcomer (Lee Example, made up, in a fresh browser with
// no account) opens it, sees who asked and which board, types a name and lands
// on Pat's board, where Pat sees Lee arrive and lists Lee as a plain member.
// Inviting Sam's email says Sam already has the board. Bug hunt: the used link
// opened again, a made-up and a broken code, an empty and a huge name, and two
// newcomers using one link at the same moment. Red team: Sam (a teammate, not
// an owner), a signed-out visitor and Lee cannot make links or read invites
// that are not theirs, the preview never shows Pat's email, the raw code never
// reaches the app log, and a stranger guessing codes is slowed down.


const VIEW = { width: 1440, height: 900 };
// The join routes allow 5 tries a minute from one address. The newcomers' own
// browsers skip that limit so a two-theme run is not refused for the wrong
// reason; the last red-team step checks the limit itself without the skip.
const BYPASS = { 'x-bypass-rate-limit': '1' };

async function newcomer(t, { bypass = true } = {}) {
  const ctx = await t.browser.newContext({ viewport: VIEW, extraHTTPHeaders: bypass ? BYPASS : {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).split('\n')[0].slice(0, 200)));
  return { ctx, page, errors };
}

async function call(t, ctx, method, url, data) {
  const res = await ctx.request.fetch(`${t.web}${url}`, {
    method, data, headers: { Origin: t.web, ...BYPASS }, failOnStatusCode: false,
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status(), text, body };
}

async function makeLink(t, who = t.pat) {
  const res = await t.api(who, 'POST', `/api/workspaces/${t.workspaceId}/invites`, { email: '' });
  if (res.status !== 201 || res.body?.kind !== 'link') throw new Error(`making a join link answered ${res.status}`);
  t.typed.push(res.body.code);
  return res.body.code;
}

async function members(t) {
  const res = await t.api(t.pat, 'GET', `/api/workspaces/${t.workspaceId}/members`);
  return res.body?.members || [];
}

const invitePage = (t, code) => `${t.web}/?invite=${encodeURIComponent(code)}`;
const screen = (page) => page.getByTestId('invite-screen');
const alertText = (page) => page.getByRole('alert').first().innerText({ timeout: 10_000 }).catch(() => '');

export default {
  id: 'inviteLinks',
  label: 'Invite links: someone with no account joins one board, once',
  async run(t) {
    const { pat, check } = t;
    const run = Date.now().toString(36).slice(-4);
    const LEE = `Lee Example ${run}`;
    const ROB = `Rob Example ${run}`;
    const KIM = `Kim Example ${run}`;
    t.typed.push(LEE, ROB, KIM);
    const opened = [];
    let lee = null;
    let usedCode = null;

    try {
      await check('walk', 'Pat opens Share, More options, and makes a join link with no email under "Invite to this board"', async ({ shot }) => {
        await pat.page.getByTestId('share-button').click();
        await pat.page.getByText('More options', { exact: false }).first().click();
        const box = pat.page.getByTestId('invite-to-board');
        await box.waitFor({ timeout: 10_000 });
        await box.getByRole('button', { name: 'Make a link' }).click();
        const field = box.getByLabel('Join link');
        await field.waitFor({ timeout: 10_000 });
        const url = await field.inputValue();
        await shot(pat.page, 'pat-join-link');
        const code = new URL(url).searchParams.get('invite') || '';
        if (!/^[A-Za-z0-9_-]{32}$/.test(code)) throw new Error('the link shown has no one-time code in it');
        if (!(await box.getByText('It works once, for 7 days').count())) throw new Error('the link has no line saying it works once, for 7 days');
        usedCode = code;
        t.typed.push(code);
        return 'a link with a one-time code shows, with "It works once, for 7 days"';
      });

      await check('walk', 'Lee, with no account, opens the link, sees who asked and which board, types a name and lands on Pat\'s board', async ({ shot }) => {
        if (!usedCode) throw new Error('no link from the step before');
        lee = await newcomer(t);
        opened.push(lee);
        await lee.page.goto(invitePage(t, usedCode));
        await screen(lee.page).getByText('invited you to').waitFor({ timeout: 15_000 });
        const said = await screen(lee.page).innerText();
        if (!said.includes('Pat Example')) throw new Error('the invite does not say Pat Example asked');
        await shot(lee.page, 'lee-invite-screen');
        await lee.page.getByRole('textbox', { name: 'Your name' }).fill(LEE);
        await lee.page.getByRole('button', { name: 'Join the board' }).click();
        await lee.page.waitForURL((u) => u.searchParams.get('workspace') === t.workspaceId, { timeout: 20_000 });
        if (lee.page.url().includes('invite=')) throw new Error('the used code is still in Lee\'s address bar');
        await lee.page.waitForFunction(() => document.readyState === 'complete');
        await lee.page.evaluate(async () => {
          const { useWorkspaceStore } = await import('/src/lib/store.js');
          window.__e2eStore = useWorkspaceStore;
        });
        await lee.page.waitForFunction((id) => window.__e2eStore.getState().workspaceId === id, t.workspaceId, { timeout: 30_000, polling: 500 });
        await lee.page.waitForTimeout(1500);
        await shot(lee.page, 'lee-on-the-board');
        return 'Lee is on Pat\'s board and the code is gone from the address bar';
      });

      await check('walk', 'Pat sees Lee arrive and lists Lee as a plain member, not an owner', async ({ shot }) => {
        if (!lee) throw new Error('Lee never joined');
        const arrived = await pat.page.getByText(`${LEE} joined the canvas`).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
        await shot(pat.page, 'pat-sees-lee');
        const row = (await members(t)).find((m) => m.name === LEE);
        if (!row) throw new Error('Lee is not in the board\'s member list');
        if (row.role !== 'member') throw new Error(`Lee joined as ${row.role}, not member`);
        if (!arrived) throw new Error('Pat\'s screen never said Lee joined');
        return 'Pat\'s screen said Lee joined, and Lee is listed as member';
      });

      await check('walk', 'Pat types Sam\'s email under "Invite to this board" and is told Sam already has the board', async ({ shot }) => {
        const box = pat.page.getByTestId('invite-to-board');
        await box.getByLabel('Their email, if they have an account here').fill('sam@example.com');
        await box.getByRole('button', { name: 'Invite' }).click();
        const said = await box.getByRole('status').innerText({ timeout: 10_000 }).catch(() => '');
        await shot(pat.page, 'pat-invites-sam');
        if (!/already has this board/.test(said)) throw new Error(`the answer was "${said.slice(0, 80)}"`);
        const inbox = await t.api(t.sam, 'GET', '/api/invites/mine');
        if ((inbox.body?.invites || []).some((i) => i.workspaceId === t.workspaceId)) throw new Error('Sam got an Inbox invite for a board Sam already has');
        return `"${said}", and nothing new in Sam's Inbox`;
      });

      await check('hunt', 'the used link opened again in a new browser says plainly it was used, with no name box', async ({ shot }) => {
        if (!usedCode) throw new Error('no used link to try');
        const again = await newcomer(t);
        opened.push(again);
        await again.page.goto(invitePage(t, usedCode));
        const said = await alertText(again.page);
        await shot(again.page, 'used-link-again');
        if (!/used already or has run out/.test(said)) throw new Error(`the screen said "${said.slice(0, 80)}"`);
        if (await again.page.getByRole('textbox', { name: 'Your name' }).count()) throw new Error('a name box still shows for a used link');
        const res = await call(t, again.ctx, 'POST', '/api/invites/redeem', { code: usedCode, name: ROB });
        if (res.status !== 410) throw new Error(`using the code again by hand answered ${res.status}`);
        if ((await members(t)).some((m) => m.name === ROB)) throw new Error('a second person got in with a used link');
        return 'plain "used already" words, and the server refuses it with 410';
      });

      await check('hunt', 'a made-up code says it was used or ran out; a broken code just opens the sign-in', async ({ shot }) => {
        const odd = await newcomer(t);
        opened.push(odd);
        await odd.page.goto(invitePage(t, 'A'.repeat(32)));
        const said = await alertText(odd.page);
        await shot(odd.page, 'made-up-code');
        if (!/used already or has run out/.test(said)) throw new Error(`a made-up code showed "${said.slice(0, 80)}"`);
        await odd.page.goto(invitePage(t, 'short<script>'));
        await odd.page.waitForTimeout(2000);
        await shot(odd.page, 'broken-code');
        if (await screen(odd.page).count()) throw new Error('a broken code still opened the invite screen');
        if (odd.errors.length) throw new Error(`the page crashed: ${odd.errors[0]}`);
        return 'made-up code: plain words; broken code: the normal start screen, no crash';
      });

      await check('hunt', 'an empty name is refused and leaves the link working; a huge name is cut to 60 letters', async () => {
        const code = await makeLink(t);
        const kim = await newcomer(t);
        opened.push(kim);
        const empty = await call(t, kim.ctx, 'POST', '/api/invites/redeem', { code, name: '  \n\t ' });
        if (empty.status !== 400) throw new Error(`a blank name answered ${empty.status}`);
        const preview = await call(t, kim.ctx, 'GET', `/api/invites/preview?code=${code}`);
        if (preview.status !== 200) throw new Error(`after a blank name the link answered ${preview.status}, it was used up`);
        const huge = `${KIM} ${'x'.repeat(500)}`;
        const ok = await call(t, kim.ctx, 'POST', '/api/invites/redeem', { code, name: huge });
        if (ok.status !== 200) throw new Error(`a long name answered ${ok.status}`);
        const row = (await members(t)).find((m) => String(m.name || '').startsWith(KIM));
        if (!row) throw new Error('Kim is not on the board');
        if (row.name.length > 60) throw new Error(`the name kept ${row.name.length} letters`);
        return `blank refused (400), link still good; long name kept as ${row.name.length} letters`;
      });

      await check('hunt', 'two newcomers use one link at the same moment: exactly one gets in', async () => {
        const code = await makeLink(t);
        const [a, b] = [await newcomer(t), await newcomer(t)];
        opened.push(a, b);
        const names = [`Ana Example ${run}`, `Bo Example ${run}`];
        t.typed.push(...names);
        const answers = await Promise.all([a, b].map((p, i) => call(t, p.ctx, 'POST', '/api/invites/redeem', { code, name: names[i] })));
        const statuses = answers.map((r) => r.status).sort();
        const onBoard = (await members(t)).filter((m) => names.includes(m.name)).length;
        if (statuses.join() !== '200,410' || onBoard !== 1) throw new Error(`answers ${statuses.join(' and ')}, ${onBoard} of them on the board`);
        return 'one got in (200), the other was told it was used (410)';
      });

      await check('redteam', 'Sam, a teammate and not an owner, cannot make a join link for Pat\'s board', async () => {
        const res = await t.api(t.sam, 'POST', `/api/workspaces/${t.workspaceId}/invites`, { email: '' });
        if (res.status < 400) throw new Error(`Sam's link was made (${res.status})`);
        if (res.body?.code) throw new Error('the refusal still carried a code');
        return `refused with ${res.status}`;
      });

      await check('redteam', 'Lee, who joined by link, cannot make links or add people to Pat\'s board', async () => {
        if (!lee) throw new Error('Lee never joined');
        const link = await call(t, lee.ctx, 'POST', `/api/workspaces/${t.workspaceId}/invites`, { email: '' });
        const add = await call(t, lee.ctx, 'POST', `/api/workspaces/${t.workspaceId}/members`, { email: 'sam@example.com' });
        if (link.status < 400 || link.body?.code) throw new Error(`Lee made a link (${link.status})`);
        if (add.status < 400) throw new Error(`Lee added a person (${add.status})`);
        return `link refused ${link.status}, adding refused ${add.status}`;
      });

      await check('redteam', 'a signed-out visitor cannot make links, list invites or open or dismiss one', async () => {
        const asks = [
          ['POST', `/api/workspaces/${t.workspaceId}/invites`, { email: '' }],
          ['GET', '/api/invites/mine'],
          ['POST', '/api/invites/made-up-id/open', {}],
          ['POST', '/api/invites/made-up-id/dismiss', {}],
        ];
        const answers = [];
        for (const [method, url, body] of asks) answers.push((await call(t, t.signedOut, method, url, body)).status);
        const let_in = answers.filter((s) => s < 400);
        if (let_in.length) throw new Error(`answers ${answers.join(', ')}`);
        return `all refused: ${answers.join(', ')}`;
      });

      await check('redteam', 'the preview a stranger sees names Pat but never shows Pat\'s email', async () => {
        const code = await makeLink(t);
        const res = await call(t, t.signedOut, 'GET', `/api/invites/preview?code=${code}`);
        if (res.status !== 200) throw new Error(`preview answered ${res.status}`);
        if (res.text.includes('@')) throw new Error('the preview carries an email address');
        return `"${res.body?.byName}" invited you to "${res.body?.boardName}", no email`;
      });

      await check('redteam', 'no one-time code reaches the app log', async () => {
        const text = t.serverLog();
        const leaked = t.typed.filter((w) => /^[A-Za-z0-9_-]{32}$/.test(w) && text.includes(w));
        if (leaked.length) throw new Error(`${leaked.length} one-time code(s) found in the server log`);
        return 'none of the codes made in this run are in the server log';
      });

      await check('redteam', 'a stranger guessing codes is slowed down after a few tries', async () => {
        const guesser = await newcomer(t, { bypass: false });
        opened.push(guesser);
        const answers = [];
        for (let i = 0; i < 8; i += 1) {
          const res = await guesser.ctx.request.get(`${t.web}/api/invites/preview?code=${String(i).repeat(32).slice(0, 32)}`, { failOnStatusCode: false });
          answers.push(res.status());
        }
        if (!answers.includes(429)) throw new Error(`8 guesses in a row were all answered (${answers.join(', ')})`);
        return `answers ${answers.join(', ')}`;
      });

      await check('walk', 'the newcomers\' browsers did not crash', async () => {
        const crashes = opened.flatMap((p) => p.errors);
        if (crashes.length) throw new Error(`${crashes.length} page errors, first: ${crashes[0]}`);
        return `${opened.length} newcomer browsers, no page errors`;
      });
    } finally {
      await pat.page.keyboard.press('Escape').catch(() => {});
      await Promise.all(opened.map((p) => p.ctx.close().catch(() => {})));
    }
  },
};
