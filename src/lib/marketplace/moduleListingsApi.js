// Client for the marketplace's module listings (spec 5b, "Copy to your
// board") and for promoting a module to a built-in window (spec 6).

async function jsonOrThrow(res, fallback) {
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const err = new Error(body?.error || fallback);
    err.code = body?.code;
    err.status = res.status;
    if (body?.checks) err.checks = body.checks;
    throw err;
  }
  return body;
}

function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
}

let sellerPromise = null;

/** Whether this person may publish. Asked once per page load. */
export function fetchSellerStatus({ fresh = false } = {}) {
  if (fresh || !sellerPromise) {
    sellerPromise = Promise.resolve()
      .then(() => fetch('/api/marketplace/seller', { credentials: 'include' }))
      .then(res => jsonOrThrow(res, 'The marketplace is unavailable.'))
      .catch((err) => { sellerPromise = null; throw err; });
  }
  return sellerPromise;
}

function moduleBody(win, extra = {}) {
  return { request: win.request || '', manifest: win.manifest, source: win.source, ...extra };
}

export async function checkModuleListing(win, { summary } = {}) {
  return jsonOrThrow(await post('/api/marketplace/modules/check', moduleBody(win, { summary })), 'The checks could not run.');
}

export async function publishModuleListing(win, { summary } = {}) {
  const body = await jsonOrThrow(await post('/api/marketplace/modules', moduleBody(win, { summary, listingId: win.listingId || null })), 'The module could not be published.');
  return body.listing;
}

export async function fetchModuleListings() {
  const body = await jsonOrThrow(await fetch('/api/marketplace/modules', { credentials: 'include' }), 'The marketplace is unavailable.');
  return body.listings || [];
}

export async function installModuleListing(id) {
  const body = await jsonOrThrow(await post(`/api/marketplace/modules/${encodeURIComponent(id)}/install`, {}), 'That module could not be added.');
  return body.listing;
}

export async function unlistModuleListing(id) {
  const res = await fetch(`/api/marketplace/modules/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
  return (await jsonOrThrow(res, 'The listing could not be removed.')).removed;
}

export async function promoteModule(win, { kind, label, hint, dryRun = false } = {}) {
  return jsonOrThrow(await post('/api/modules/promote', moduleBody(win, {
    kind: kind || undefined,
    label,
    hint,
    libraryId: win.libraryId || null,
    listingId: win.listingId || null,
    dryRun,
  })), dryRun ? 'The preview could not be made.' : 'The window could not be added.');
}
