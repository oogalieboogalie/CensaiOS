// "Sam joined" pop-ups: Pat Example and Sam Example come and go on a shared
// board and each screen notes every "joined the canvas" and "left" pop-up it
// shows. Walk: Sam arrives while Pat is there, Sam arrives while Pat's board
// is still loading, both arrive at once, Sam reloads, Sam leaves. Bug hunt:
// Sam in three tabs at once, Pat's connection dropping for a moment, Sam
// leaving just before Pat's connection drops, both connections dropping at
// once (as when the server restarts) with Sam back much later than Pat, and
// Pat's connection staying down for a while. All people are made up.

import { openBoard, spawnWindow } from '../../e2e/board.mjs';
import { sideBySide } from '../sideBySide.mjs';

const GRACE_MS = 10_000; // src/lib/collaboration/presenceNotices.js LEAVE_GRACE_MS
// Long enough that Sam's screen counts Pat as gone: after a reconnect the
// server keeps Pat's presence until it goes stale (30 s), then the grace time.
const LONG_DROP_MS = 50_000;
const SETTLE_MS = 5_000;
// Longer than the grace time, so only "Sam may still be reconnecting" keeps
// Pat's screen quiet.
const RESTART_GAP_MS = 15_000;
const LIVE_LINKS = /\/(hocuspocus|ws\/workspace-collaboration)\b/;
const DOC_LINK = /\/hocuspocus\b/;

// Runs in each page before the app: notes every presence pop-up as it
// appears, and keeps the board's live links so a test can drop or hold them.
// `holdDoc` keeps the shared board from connecting until a test lets it.
function pageWatcher({ links, doc, holdDoc }) {
  window.__holdDoc = holdDoc;
  window.__popups = [];
  const seen = new WeakSet();
  const scan = (root) => {
    if (!root.querySelectorAll) return;
    for (const el of [root, ...root.querySelectorAll('span')]) {
      if (el.tagName !== 'SPAN' || seen.has(el) || el.children.length || !el.closest('[data-pane-cover]')) continue;
      const text = el.textContent.trim();
      if (!/ (joined the canvas|left)$/.test(text)) continue;
      seen.add(el);
      window.__popups.push(text);
    }
  };
  new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(scan)))
    .observe(document, { childList: true, subtree: true });
  const pattern = new RegExp(links);
  const docPattern = new RegExp(doc);
  const Native = window.WebSocket;
  window.__liveLinks = [];
  window.WebSocket = class extends Native {
    constructor(url, ...rest) {
      const live = pattern.test(String(url));
      // While held, the board's live links cannot get through (a long drop).
      const held = (live && window.__holdLinks) || (window.__holdDoc && docPattern.test(String(url)));
      super(held ? 'ws://127.0.0.1:9/held' : url, ...rest);
      if (live) window.__liveLinks.push(this);
    }
  };
}

async function arrive(t, who, { main = true, holdDoc = false } = {}) {
  const page = await who.ctx.newPage();
  await page.addInitScript(pageWatcher, { links: LIVE_LINKS.source, doc: DOC_LINK.source, holdDoc });
  page.on('pageerror', (e) => who.errors.push(String(e.message).split('\n')[0].slice(0, 200)));
  await openBoard(page, t.workspaceId, t.web);
  const skipMission = page.getByText('Skip mission');
  if (await skipMission.count()) await skipMission.first().click().catch(() => {});
  if (main) who.page = page;
  return page;
}

const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const popups = (page) => page.evaluate(() => [...window.__popups]);
const clearPopups = (...pages) => Promise.all(pages.map((page) => page.evaluate(() => { window.__popups = []; })));
const said = (list) => (list.length ? list.map((text) => `"${text}"`).join(', ') : 'nothing');
const joins = (list, name) => list.filter((text) => text === `${name} joined the canvas`).length;
const lefts = (list) => list.filter((text) => text.endsWith(' left')).length;

/** Drops (or holds down) every live link of the board in this page. */
async function dropLinks(page, { hold = false } = {}) {
  return page.evaluate((h) => {
    window.__holdLinks = h;
    let closed = 0;
    for (const ws of window.__liveLinks) if (ws.readyState <= 1) { ws.close(); closed += 1; }
    return closed;
  }, hold);
}

/** Lets this page's shared board connect, and waits until it has. */
async function letDocConnect(page) {
  await page.evaluate(() => { window.__holdDoc = false; });
  await page.waitForFunction((doc) => window.__liveLinks.some((ws) => new RegExp(doc).test(ws.url) && ws.readyState === 1), DOC_LINK.source, { timeout: 40_000, polling: 250 });
  await page.waitForTimeout(2000);
}

/** True once a window Sam puts on the board shows up on Pat's screen. */
async function boardIsLive(t, timeout = 20_000) {
  const id = await spawnWindow(t.sam.page, 'doc', { title: 'Made-up check note', text: 'Made-up' }, { x: 900, y: 500 });
  const reached = await t.pat.page.waitForFunction((wid) => window.__e2eStore.getState().wins.some((w) => w.id === wid), id, { timeout, polling: 250 })
    .then(() => true, () => false);
  await t.sam.page.evaluate((wid) => window.__e2eStore.getState().onClose(wid), id);
  return reached;
}

export default {
  id: 'joinNotices',
  label: '"Sam joined" shows once per person',
  async run(t) {
    const { pat, sam, check } = t;
    // Start with nobody on the board: other themes' tabs and the usual pages close.
    for (const other of Object.values(t.people)) {
      for (const who of [other.pat, other.sam]) await who.page?.close().catch(() => {});
    }
    await pause(1500);

    await check('walk', 'Sam opens the board while Pat is on it: Pat sees one "Sam Example joined" pop-up', async ({ shot }) => {
      await arrive(t, pat);
      await pat.page.waitForTimeout(2000);
      await arrive(t, sam);
      await pat.page.waitForTimeout(1500);
      await sideBySide(t, 'pat-sees-sam-join-once', shot);
      await pat.page.waitForTimeout(SETTLE_MS);
      const [onPat, onSam] = await Promise.all([popups(pat.page), popups(sam.page)]);
      if (joins(onPat, 'Sam Example') !== 1 || onPat.length !== 1) throw new Error(`Pat's screen said ${said(onPat)}`);
      if (onSam.length) throw new Error(`Sam's screen said ${said(onSam)} (Pat was already there)`);
      return 'Pat\'s screen said "Sam Example joined the canvas" once; Sam\'s screen said nothing';
    });

    await check('walk', 'Sam opens the board while Pat\'s board is still loading: Pat sees one "Sam Example joined" pop-up', async ({ shot }) => {
      await Promise.all([pat.page.close(), sam.page.close()]);
      await pause(1500);
      // Pat's board is slow to connect (a big board, a busy computer); Sam arrives meanwhile.
      await arrive(t, pat, { holdDoc: true });
      await arrive(t, sam, { holdDoc: true });
      await pause(1500);
      await sideBySide(t, 'sam-arrives-while-pats-board-loads', shot);
      await letDocConnect(pat.page);
      await letDocConnect(sam.page);
      await pat.page.waitForTimeout(500);
      await sideBySide(t, 'both-boards-finish-loading', shot);
      await pat.page.waitForTimeout(SETTLE_MS);
      const [onPat, onSam] = await Promise.all([popups(pat.page), popups(sam.page)]);
      if (joins(onPat, 'Sam Example') !== 1 || onPat.length !== 1) throw new Error(`Pat's screen said ${said(onPat)}`);
      if (onSam.length) throw new Error(`Sam's screen said ${said(onSam)} (Pat was already there)`);
      return 'Pat\'s screen said "Sam Example joined the canvas" once; Sam\'s screen said nothing';
    });

    await check('walk', 'Pat and Sam open the board at the same moment, three times: each sees the other arrive once at most, and nobody "left"', async ({ shot }) => {
      const rounds = [];
      for (let round = 1; round <= 3; round += 1) {
        await Promise.all([pat.page.close(), sam.page.close()]);
        await pause(1500);
        await Promise.all([arrive(t, pat), arrive(t, sam)]);
        await pat.page.waitForTimeout(SETTLE_MS);
        const [onPat, onSam] = await Promise.all([popups(pat.page), popups(sam.page)]);
        rounds.push(`round ${round}: Pat's screen ${said(onPat)}; Sam's screen ${said(onSam)}`);
        if (joins(onPat, 'Sam Example') > 1 || joins(onSam, 'Pat Example') > 1 || lefts(onPat) || lefts(onSam)) {
          await sideBySide(t, 'both-open-at-once', shot);
          throw new Error(rounds.join('; '));
        }
      }
      await sideBySide(t, 'both-open-at-once', shot);
      return rounds.join('; ');
    });

    await check('walk', 'Sam reloads the board: Pat\'s screen says neither "left" nor "joined"', async ({ shot }) => {
      await clearPopups(pat.page);
      await sam.page.reload();
      await sam.page.waitForFunction(() => document.readyState === 'complete');
      await sam.page.evaluate(async () => {
        const { useWorkspaceStore } = await import('/src/lib/store.js');
        window.__e2eStore = useWorkspaceStore;
      });
      await pat.page.waitForTimeout(GRACE_MS + 2000);
      const onPat = await popups(pat.page);
      await sideBySide(t, 'after-sam-reloads', shot);
      if (onPat.length) throw new Error(`Pat's screen said ${said(onPat)}`);
      return 'nothing on Pat\'s screen';
    });

    await check('walk', 'Sam closes the board: Pat sees one "Sam Example left", a few seconds later', async ({ shot }) => {
      await clearPopups(pat.page);
      await sam.page.close();
      await pat.page.waitForTimeout(GRACE_MS + 1500);
      await shot(pat.page, 'pat-after-sam-leaves');
      const onPat = await popups(pat.page);
      if (onPat.length !== 1 || onPat[0] !== 'Sam Example left') throw new Error(`Pat's screen said ${said(onPat)}`);
      return 'Pat\'s screen said "Sam Example left" once';
    });

    await check('hunt', 'Sam opens the board in three tabs at once: one "joined"; closing two says nothing; closing the last says "left" once', async ({ shot }) => {
      await clearPopups(pat.page);
      const tabs = await Promise.all([1, 2, 3].map(() => arrive(t, sam, { main: false })));
      await pat.page.waitForTimeout(SETTLE_MS);
      await shot(pat.page, 'pat-while-sam-has-three-tabs');
      const opened = await popups(pat.page);
      await Promise.all(tabs.slice(0, 2).map((page) => page.close()));
      await pat.page.waitForTimeout(GRACE_MS + 1500);
      const twoClosed = await popups(pat.page);
      await tabs[2].close();
      await pat.page.waitForTimeout(GRACE_MS + 1500);
      const allClosed = await popups(pat.page);
      const story = `three tabs: ${said(opened)}; two closed: ${said(twoClosed.slice(opened.length))}; last closed: ${said(allClosed.slice(twoClosed.length))}`;
      if (opened.length !== 1 || joins(opened, 'Sam Example') !== 1) throw new Error(story);
      if (twoClosed.length !== opened.length) throw new Error(story);
      if (allClosed.length !== twoClosed.length + 1 || allClosed.at(-1) !== 'Sam Example left') throw new Error(story);
      return story;
    });

    await check('hunt', 'Pat\'s connection drops for a moment and comes back: neither screen says anyone left or joined', async ({ shot }) => {
      await arrive(t, sam);
      await pat.page.waitForTimeout(SETTLE_MS);
      await clearPopups(pat.page, sam.page);
      const closed = await dropLinks(pat.page);
      await pat.page.waitForTimeout(GRACE_MS + 2000);
      const live = await boardIsLive(t);
      const [onPat, onSam] = await Promise.all([popups(pat.page), popups(sam.page)]);
      await sideBySide(t, 'after-pats-connection-blips', shot);
      if (!closed) throw new Error('no live link to drop on Pat\'s page');
      if (!live) throw new Error('Pat\'s board never came back: Sam\'s new window did not reach Pat');
      if (onPat.length || onSam.length) throw new Error(`Pat's screen said ${said(onPat)}; Sam's screen said ${said(onSam)}`);
      return `${closed} live links dropped and back; nothing on either screen`;
    });

    await check('hunt', 'Sam closes the board and Pat\'s connection drops a moment later: Pat still sees one "Sam Example left"', async ({ shot }) => {
      await clearPopups(pat.page);
      await sam.page.close();
      await pat.page.waitForTimeout(3000);
      const closed = await dropLinks(pat.page);
      await pat.page.waitForTimeout(GRACE_MS + 2000);
      await shot(pat.page, 'pat-after-sam-leaves-before-a-blip');
      const onPat = await popups(pat.page);
      if (!closed) throw new Error('no live link to drop on Pat\'s page');
      if (onPat.join('|') !== 'Sam Example left') throw new Error(`Pat's screen said ${said(onPat)}`);
      return 'Pat\'s screen said "Sam Example left" once';
    });

    await check('hunt', 'Both connections drop at once, as when the server restarts, and Sam\'s comes back well after Pat\'s: neither screen says anyone left or joined', async ({ shot }) => {
      await arrive(t, sam);
      await pat.page.waitForTimeout(SETTLE_MS);
      await clearPopups(pat.page, sam.page);
      await Promise.all([dropLinks(sam.page, { hold: true }), dropLinks(pat.page)]);
      await pat.page.waitForTimeout(RESTART_GAP_MS);
      await sam.page.evaluate(() => { window.__holdLinks = false; });
      const live = await boardIsLive(t, 45_000);
      await pat.page.waitForTimeout(SETTLE_MS);
      const [onPat, onSam] = await Promise.all([popups(pat.page), popups(sam.page)]);
      await sideBySide(t, 'after-both-connections-drop', shot);
      if (!live) throw new Error('the board never came back after both connections dropped');
      if (onPat.length || onSam.length) throw new Error(`Pat's screen said ${said(onPat)}; Sam's screen said ${said(onSam)}`);
      return `Sam was back ${RESTART_GAP_MS / 1000} seconds after Pat; nothing on either screen`;
    });

    await check('hunt', 'Pat\'s connection stays down for a while: Pat\'s screen never says Sam left or joined; Sam\'s says Pat left and came back', async ({ shot }) => {
      await clearPopups(pat.page, sam.page);
      await dropLinks(pat.page, { hold: true });
      await pat.page.waitForTimeout(LONG_DROP_MS);
      await pat.page.evaluate(() => { window.__holdLinks = false; });
      // The live links retry on their own; the board is live again once Sam's window reaches Pat.
      const live = await boardIsLive(t, 45_000);
      await pat.page.waitForTimeout(SETTLE_MS);
      const [onPat, onSam] = await Promise.all([popups(pat.page), popups(sam.page)]);
      await sideBySide(t, 'after-pats-long-drop', shot);
      if (!live) throw new Error('Pat\'s board never came back after the long drop');
      if (onPat.length) throw new Error(`Pat's screen said ${said(onPat)} although only Pat's own connection dropped`);
      if (onSam.join('|') !== 'Pat Example left|Pat Example joined the canvas') throw new Error(`Sam's screen said ${said(onSam)}`);
      return `Pat's screen said nothing; Sam's said ${said(onSam)}`;
    });
  },
};
