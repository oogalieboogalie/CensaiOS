// Agent Company for two people. Agent Company is the board's idle clicker:
// everyone taps "Ship it" to earn credits for one shared wallet and spends
// them on hires (interns, agents, ...). Pat Example taps and hires two, and
// Sam Example sees the same company and Pat on the team. Sam plays too, and
// nothing Sam does changes Pat's own seat (taps, hires, what Pat spent).
// Hunt: Pat and Sam buy the same upgrade at the same moment (it must be paid
// for once). Red team: a second person also named "Pat Example" plays on the
// board and must get their own seat, never Pat's. The log keeps no names.

import { openBoard, readWindow, signIn, spawnWindow, windowFrame } from '../../e2e/board.mjs';
import { companyAt, readSeats } from '../../../src/lib/games/idle/economy.js';
import { note } from '../report.mjs';
import { sideBySide } from '../sideBySide.mjs';

const VIEW = { width: 1440, height: 900 };
const TWIN = { email: 'pat.twin@example.com', name: 'Pat Example' };
// Sign-in is rate limited, so the second Pat signs in once and the next
// theme's run reuses that browser sign-in.
let twinSignIn = null;
const now = () => Date.now() / 1000;

async function companyOn(page, id) {
  const seats = readSeats((await readWindow(page, id)) || {});
  return { seats, company: companyAt(seats, now()) };
}

async function tapTimes(page, id, n) {
  const button = windowFrame(page, id).getByTestId('idle-tap');
  for (let i = 0; i < n; i += 1) await button.click({ timeout: 5_000 });
  await page.waitForTimeout(700); // taps are written to the board a few times a second
}

async function waitFor(page, id, test, ms = 10_000) {
  const until = Date.now() + ms;
  let seen = await companyOn(page, id);
  while (!test(seen) && Date.now() < until) {
    await page.waitForTimeout(300);
    seen = await companyOn(page, id);
  }
  return seen;
}

const seatOf = (seats, name) => Object.entries(seats).filter(([, s]) => s.name === name);
const hiredBy = (seat) => Object.values(seat?.hires || {}).reduce((n, h) => n + h.n, 0);
const plain = (seat) => JSON.stringify({ taps: seat.taps, spent: seat.spent, hires: seat.hires, upgrades: seat.upgrades });

export default {
  id: 'agentCompany',
  label: 'Agent Company: two people grow one company',
  async run(t) {
    const { pat, sam, check } = t;
    let win;
    let patSeat;

    await check('walk', 'Pat taps to earn credits and hires an intern and an agent', async ({ shot }) => {
      win = await spawnWindow(pat.page, 'agentCompany', {}, { x: 40, y: 40 }, { w: 760, h: 520 });
      await windowFrame(pat.page, win).getByTestId('idle-tap').waitFor({ timeout: 15_000 });
      await tapTimes(pat.page, win, 120);
      const frame = windowFrame(pat.page, win);
      await frame.getByTestId('idle-hire-intern').click({ timeout: 5_000 });
      await frame.getByTestId('idle-hire-agent').click({ timeout: 5_000 });
      const { seats, company } = await waitFor(pat.page, win, (s) => (s.company.owned.agent || 0) >= 1 && (s.company.owned.intern || 0) >= 1);
      await shot(pat.page, 'pat-hires-two');
      const mine = seatOf(seats, 'Pat Example');
      if (mine.length !== 1) throw new Error(`Pat has ${mine.length} seat(s)`);
      [, patSeat] = mine[0];
      if (company.owned.intern !== 1 || company.owned.agent !== 1) throw new Error(`the company owns ${JSON.stringify(company.owned)}`);
      return `Pat tapped ${patSeat.taps} times and hired an intern and an agent; the company earns ${company.rate.toFixed(1)} a second`;
    });

    await check('walk', 'Sam sees the same company and Pat on the team', async ({ shot }) => {
      if (!win) throw note('the Agent Company window never opened');
      const frame = windowFrame(sam.page, win);
      const { company } = await waitFor(sam.page, win, (s) => s.company.owned.agent === 1 && s.company.owned.intern === 1);
      await frame.getByTestId('idle-team').getByText('Pat Example').waitFor({ timeout: 10_000 }).catch(() => {});
      await shot(sam.page, 'sam-sees-pats-company');
      if (company.owned.agent !== 1 || company.owned.intern !== 1) throw new Error(`Sam's screen shows ${JSON.stringify(company.owned)}`);
      if (!(await frame.getByTestId('idle-team').getByText('Pat Example').count())) throw new Error('Sam\'s team list does not show Pat');
      return 'Sam sees the intern, the agent and Pat on the team';
    });

    await check('walk', 'Sam plays too, and nothing Sam does changes Pat\'s own seat', async ({ shot }) => {
      const before = plain(patSeat);
      await tapTimes(sam.page, win, 40);
      await windowFrame(sam.page, win).getByTestId('idle-hire-intern').click({ timeout: 5_000 });
      const { seats } = await waitFor(pat.page, win, (s) => seatOf(s.seats, 'Sam Example').some(([, x]) => hiredBy(x) === 1));
      await windowFrame(pat.page, win).getByTestId('idle-team').getByText('Sam Example').waitFor({ timeout: 10_000 }).catch(() => {});
      await sideBySide(t, 'sam-plays-pat-sees', shot);
      const problems = [];
      const samSeats = seatOf(seats, 'Sam Example');
      if (samSeats.length !== 1 || hiredBy(samSeats[0][1]) !== 1) problems.push('Pat\'s screen does not show Sam\'s own seat with one hire');
      const patNow = seatOf(seats, 'Pat Example')[0]?.[1];
      if (!patNow || plain(patNow) !== before) problems.push('Pat\'s seat changed when Sam played');
      if (problems.length) throw new Error(problems.join('; '));
      return 'Sam has a seat of their own with one hire; Pat\'s taps, hires and spending are exactly as before';
    });

    await check('hunt', 'Pat and Sam buy the same upgrade at the same moment and it is paid for once', async ({ shot }) => {
      await tapTimes(pat.page, win, 140);
      const start = await companyOn(pat.page, win);
      const t0 = now();
      const buy = (p) => windowFrame(p.page, win).getByTestId('idle-upgrade-keyboard').click({ timeout: 5_000 });
      await Promise.all([buy(pat), buy(sam)]);
      const paidTwice = (s) => Object.values(s.seats).filter((x) => x.upgrades.includes('keyboard')).length;
      const after = await waitFor(pat.page, win, (s) => s.company.upgrades.has('keyboard'));
      await pat.page.waitForTimeout(1500);
      const [patEnd, samEnd] = await Promise.all([companyOn(pat.page, win), companyOn(sam.page, win)]);
      await sideBySide(t, 'both-buy-the-keyboard', shot);
      const problems = [];
      if (!after.company.upgrades.has('keyboard')) problems.push('nobody got the upgrade');
      if (Math.abs(patEnd.company.wallet - samEnd.company.wallet) > 5) problems.push(`Pat's wallet shows ${patEnd.company.wallet.toFixed(0)} and Sam's ${samEnd.company.wallet.toFixed(0)}`);
      // What the wallet holds if the upgrade cost 100 once, plus what the hires made meanwhile.
      const once = start.company.wallet - 100 + start.company.rate * (now() - t0);
      if (patEnd.company.wallet < once - 3) problems.push(`the wallet went from ${start.company.wallet.toFixed(0)} to ${patEnd.company.wallet.toFixed(0)}: the one upgrade was paid for more than once`);
      if (problems.length) throw new Error(problems.join('; '));
      return `${paidTwice(patEnd)} purchase(s) went through and the company paid 100 once (wallet ${start.company.wallet.toFixed(0)} before, ${patEnd.company.wallet.toFixed(0)} after, same on both screens)`;
    });

    await check('redteam', 'a second person also named "Pat Example" gets their own seat, never Pat\'s', async ({ shot }) => {
      const ctx = await t.browser.newContext({ viewport: VIEW, colorScheme: t.report.theme || 'dark', storageState: twinSignIn || undefined });
      try {
        if (!twinSignIn) {
          // Only someone with an account can be invited, so the second Pat signs in first.
          await signIn(ctx, TWIN, t.web);
          twinSignIn = await ctx.storageState();
          const invited = await t.api(pat, 'POST', `/api/workspaces/${t.workspaceId}/members`, { email: TWIN.email });
          if (invited.status >= 400) throw note(`inviting a second person answered ${invited.status}`);
        }
        const page = await ctx.newPage();
        await openBoard(page, t.workspaceId, t.web);
        const before = plain(seatOf((await companyOn(pat.page, win)).seats, 'Pat Example')[0][1]);
        await windowFrame(page, win).getByTestId('idle-tap').waitFor({ timeout: 15_000 });
        await tapTimes(page, win, 30);
        const { seats } = await waitFor(pat.page, win, (s) => seatOf(s.seats, 'Pat Example').length === 2);
        await shot(page, 'second-pat-plays');
        const pats = seatOf(seats, 'Pat Example');
        const original = pats.find(([, s]) => plain(s) === before);
        const problems = [];
        if (pats.length !== 2) problems.push(`the board holds ${pats.length} seat(s) named Pat Example, not two`);
        if (!original) problems.push('the first Pat\'s seat changed when the second Pat played');
        if (pats.some(([field]) => !/^seat_u-/.test(field))) problems.push('a seat is keyed by name, not by account');
        if (problems.length) throw new Error(problems.join('; '));
        return 'two seats named Pat Example, one per account; the first Pat\'s taps, hires and spending did not move';
      } finally {
        await ctx.close().catch(() => {});
      }
    });

    await check('redteam', 'the log keeps no player names or seats', async () => {
      const bad = t.serverLog().split('\n').filter((line) => /seat_|Pat Example|Sam Example/.test(line));
      if (bad.length) throw new Error(`${bad.length} log lines carry a player's name or seat`);
      return 'no log line carries a player name or a seat';
    });
  },
};
