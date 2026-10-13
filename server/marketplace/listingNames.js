// Spec 5b name protection: a new listing can't use a name that reads as
// another seller's (look-alike letters, one-letter changes).

// Look-alike names: fold characters people swap to pass as someone else.
const LOOKALIKE = [[/0/g, 'o'], [/[1il|]/g, 'l'], [/rn/g, 'm'], [/vv/g, 'w'], [/5/g, 's'], [/3/g, 'e'], [/4/g, 'a'], [/\$/g, 's']];

export function nameKey(name) {
  let s = String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  for (const [from, to] of LOOKALIKE) s = s.replace(from, to);
  return s.replace(/[^a-z0-9]/g, '');
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** True when two listing names would read as the same name. */
export function namesTooClose(a, b) {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y) return false;
  return x === y || editDistance(x, y) <= 1;
}
