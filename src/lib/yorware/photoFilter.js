// Which photos the grid shows and in what order. Filters are yours alone (not
// saved on the board), so two people can look at the same library different
// ways.

export const SORTS = Object.freeze([
  ['added', 'Order added'],
  ['taken', 'Date taken'],
  ['name', 'Name'],
  ['stars', 'Stars'],
]);

export const DEFAULT_FILTER = Object.freeze({ stars: 0, flag: 'all', tag: '', text: '', sort: 'added' });

const takenAt = (photo) => {
  const t = Date.parse(photo?.meta?.taken || '');
  return Number.isFinite(t) ? t : Infinity;
};

/** The photo ids to show, filtered and sorted. */
export function visiblePhotos(lib, filter = DEFAULT_FILTER) {
  const f = { ...DEFAULT_FILTER, ...filter };
  const text = f.text.trim().toLowerCase();
  const ids = lib.order.filter((id) => {
    const r = lib.ratings[id];
    const p = lib.photos[id];
    if (!p || !r) return false;
    if (r.stars < f.stars) return false;
    if (f.flag === 'pick' && r.flag !== 'pick') return false;
    if (f.flag === 'reject' && r.flag !== 'reject') return false;
    if (f.flag === 'hide-rejects' && r.flag === 'reject') return false;
    if (f.tag && !r.tags.includes(f.tag)) return false;
    if (text) {
      const hay = [p.name, p.meta?.camera, p.meta?.lens, ...r.tags].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
  const pos = new Map(lib.order.map((id, i) => [id, i]));
  const by = {
    added: (a, b) => pos.get(a) - pos.get(b),
    taken: (a, b) => takenAt(lib.photos[a]) - takenAt(lib.photos[b]) || pos.get(a) - pos.get(b),
    name: (a, b) => lib.photos[a].name.localeCompare(lib.photos[b].name, undefined, { numeric: true }) || pos.get(a) - pos.get(b),
    stars: (a, b) => lib.ratings[b].stars - lib.ratings[a].stars || pos.get(a) - pos.get(b),
  }[f.sort] || ((a, b) => pos.get(a) - pos.get(b));
  return ids.sort(by);
}

/** Every tag in the library with how many photos carry it, most used first. */
export function allTags(lib) {
  const counts = new Map();
  for (const id of lib.order) for (const t of lib.ratings[id]?.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** One line about a photo's camera settings, e.g. "1/250 s · f/2.8 · ISO 400 · 35 mm". */
export function shotLine(meta = {}) {
  const parts = [];
  if (meta.shutter) parts.push(meta.shutter >= 1 ? `${meta.shutter} s` : `1/${Math.round(1 / meta.shutter)} s`);
  if (meta.aperture) parts.push(`f/${Math.round(meta.aperture * 10) / 10}`);
  if (meta.iso) parts.push(`ISO ${meta.iso}`);
  if (meta.focal) parts.push(`${Math.round(meta.focal)} mm`);
  return parts.join(' · ');
}
