import { useEffect, useState } from 'react';

// Starting containers is for this computer's owner only (the server refuses
// anyone else), so teammates don't see the button. Until the session answers,
// the button stays hidden.
export function useComputerOwner(fetchImpl = typeof fetch === 'undefined' ? null : fetch) {
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    let live = true;
    if (!fetchImpl) return undefined;
    fetchImpl('/api/auth/session', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => { if (live) setOwner(body?.user?.role === 'admin'); })
      .catch(() => {});
    return () => { live = false; };
  }, [fetchImpl]);
  return owner;
}
