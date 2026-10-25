// Shared board steps for the end-to-end checks and the test team: signing a
// made-up person in, sharing a board, opening it in the browser, putting a
// window on it and calling the API as that person.

export const PAT = { email: 'pat@example.com', name: 'Pat Example' };
export const SAM = { email: 'sam@example.com', name: 'Sam Example' };

export async function signIn(context, person, web) {
  const res = await context.request.post(`${web}/api/auth/developer`, {
    data: person,
    headers: { Origin: web },
  });
  if (!res.ok()) throw new Error(`sign-in for ${person.name} answered ${res.status()}`);
}

export async function shareBoard(context, withPerson, web) {
  const res = await context.request.post(`${web}/api/workspaces/personal`, { headers: { Origin: web } });
  if (!res.ok()) throw new Error(`personal board answered ${res.status()}`);
  const { workspace } = await res.json();
  const invite = await context.request.post(`${web}/api/workspaces/${workspace.id}/members`, {
    data: { email: withPerson.email },
    headers: { Origin: web },
  });
  if (!invite.ok()) throw new Error(`sharing the board answered ${invite.status()}`);
  return workspace.id;
}

export async function openBoard(page, workspaceId, web) {
  await page.goto(`${web}/?workspace=${workspaceId}`);
  // Vite serves the app's own files, so the page can hand over its live store.
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.evaluate(async () => {
    const { useWorkspaceStore } = await import('/src/lib/store.js');
    window.__e2eStore = useWorkspaceStore;
  });
  await page.waitForFunction((id) => window.__e2eStore.getState().workspaceId === id, workspaceId, {
    timeout: 60_000,
    polling: 500,
  });
  // Let the shared board connect before anyone writes on it.
  await page.waitForTimeout(1500);
}

/** Puts a window on the board the way the dock does; returns its id. */
export async function spawnWindow(page, kind, props = {}, at = { x: 80, y: 80 }, size) {
  return page.evaluate(([k, p, a, s]) => window.__e2eStore.getState().spawnAt(k, p, a, s), [kind, props, at, size]);
}

/** The board's copy of one window, as this person's browser sees it. */
export async function readWindow(page, id) {
  return page.evaluate((wid) => {
    const win = window.__e2eStore.getState().wins.find((w) => w.id === wid);
    return win ? JSON.parse(JSON.stringify(win)) : null;
  }, id);
}

/** Calls the app's API as the person signed in to this browser context. */
export async function callApi(context, web, method, path, data) {
  const res = await context.request.fetch(`${web}${path}`, {
    method,
    data,
    headers: { Origin: web },
    failOnStatusCode: false,
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status(), text, body };
}

/** Changes a window's saved fields from this person's browser, as the app does. */
export async function updateWindow(page, id, patch) {
  await page.evaluate(([wid, p]) => window.__e2eStore.getState().onUpdate(wid, p), [id, patch]);
}

/** The window's frame on the page. */
export const windowFrame = (page, id) => page.locator(`[data-win-id="${id}"]`).first();
