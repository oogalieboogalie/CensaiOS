// Steps for trying a board as a share-link guest: open the link in a fresh
// browser with no account, read what the guest's browser holds, and knock on
// the app's doors (API calls and sockets) the way a curious guest could.

import { callApi } from '../e2e/board.mjs';

const VIEW = { width: 1440, height: 900 };

/** Opens a share link in a new browser with no account and joins with a made-up name. */
export async function openGuest(t, token, name) {
  const ctx = await t.browser.newContext({ viewport: VIEW, colorScheme: t.report.theme || 'dark' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).split('\n')[0].slice(0, 200)));
  await page.goto(`${t.web}/?join=${encodeURIComponent(token)}`);
  await page.getByTestId('guest-name').fill(name);
  await page.getByTestId('guest-join-submit').click();
  await page.getByTestId('guest-board').waitFor({ timeout: 30_000 });
  // Vite serves the app's own files, so the page can hand over its store.
  await page.evaluate(async () => {
    const { useWorkspaceStore } = await import('/src/lib/store.js');
    window.__e2eStore = useWorkspaceStore;
  });
  return { ctx, page, errors, name };
}

/** Calls the app as this guest (the guest's own cookie, past the browser's guard). */
export const guestApi = (t, guest, method, url, data) => callApi(guest.ctx, t.web, method, url, data);

/** Waits until a check on a page's board copy passes; returns what it saw last. */
export async function waitOnPage(page, test, arg, ms = 10_000) {
  const until = Date.now() + ms;
  for (;;) {
    const seen = await page.evaluate(test, arg);
    if (seen?.ok || Date.now() > until) return seen;
    await page.waitForTimeout(250);
  }
}

/**
 * Opens a socket from the guest's browser, sends one message if it opens, and
 * reports whether it opened and what came back.
 */
export function trySocket(page, path, message) {
  return page.evaluate(([p, msg]) => new Promise((resolve) => {
    const out = { opened: false, replies: [], closed: null };
    const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}${p}`);
    const done = () => { try { ws.close(); } catch { /* already shut */ } resolve(out); };
    const timer = setTimeout(done, 4000);
    ws.onopen = () => { out.opened = true; if (msg) ws.send(JSON.stringify(msg)); };
    ws.onmessage = (event) => { out.replies.push(String(event.data).slice(0, 300)); };
    ws.onerror = () => { out.closed = out.closed || 'error'; };
    ws.onclose = (event) => { out.closed = `closed ${event.code}`; clearTimeout(timer); resolve(out); };
  }), [path, message]);
}
