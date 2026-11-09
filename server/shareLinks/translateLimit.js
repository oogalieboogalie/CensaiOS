// How many translations one member, or one share link, may ask for in a
// minute. Guest calls count against the link, so leaving and rejoining
// does not start the count over.

const WINDOW_MS = 60_000;
const MAX_CALLS = 20;

export function createTranslateLimiter({ windowMs = WINDOW_MS, max = MAX_CALLS, now = () => Date.now() } = {}) {
  const hits = new Map();
  return {
    allow(key) {
      const t = now();
      const id = String(key || 'unknown');
      if (hits.size > 10_000) hits.clear();
      let rec = hits.get(id);
      if (!rec || t - rec.start >= windowMs) {
        rec = { start: t, count: 0 };
        hits.set(id, rec);
      }
      if (rec.count >= max) return false;
      rec.count += 1;
      return true;
    },
    reset() { hits.clear(); },
  };
}

export const commentTranslateLimiter = createTranslateLimiter();
