import React from 'react';

// Who is signed in on this board ({ id, name }), for "Me" in the To-do Assign
// menu and the bottom-bar reminder. One /api/auth/session call per page load,
// shared by every caller; null until it answers or when nobody is signed in.

let pending = null;
let known;

export function loadMe(fetchImpl = typeof fetch === 'undefined' ? null : fetch) {
  if (known !== undefined) return Promise.resolve(known);
  if (!fetchImpl) return Promise.resolve(null);
  if (!pending) {
    pending = fetchImpl('/api/auth/session', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        const user = body?.authenticated && body.user?.id != null ? body.user : null;
        known = user ? { id: user.id, name: user.name || String(user.email || '').split('@')[0] || 'Me' } : null;
        return known;
      })
      .catch(() => null)
      .finally(() => { pending = null; });
  }
  return pending;
}

/** Test helper. */
export function resetMe() {
  pending = null;
  known = undefined;
}

export function useMe() {
  const [me, setMe] = React.useState(known ?? null);
  React.useEffect(() => {
    let live = true;
    loadMe().then((value) => { if (live) setMe(value); });
    return () => { live = false; };
  }, []);
  return me;
}
