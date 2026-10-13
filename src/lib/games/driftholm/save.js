// Each player's Driftholm progress (skills, health, pack, bank) lives in the shared window record under
// their own field (`drift_<name>`), so two players writing at once never
// overwrite each other. Only you write your field. Anything that doesn't
// look like a save is dropped before it reaches the game.

// Item art colours are a data palette (like music skins), not UI colours.
export const ITEMS = {
  pine_logs: { name: 'Pine logs', kind: 'log', bark: '#7a5230', grain: '#d9b47e' },
  birch_logs: { name: 'Birch logs', kind: 'log', bark: '#ece5d4', grain: '#e3c48f' },
  raw_sardine: { name: 'Raw sardine', kind: 'fish', body: '#9fb4c2', belly: '#dfe8ee' },
  raw_mackerel: { name: 'Raw mackerel', kind: 'fish', body: '#3f7d78', belly: '#d6e2dc' },
  raw_beef: { name: 'Raw beef', kind: 'meat', flesh: '#b8423a', fat: '#f1e3d3' },
  cowhide: { name: 'Cowhide', kind: 'hide', hide: '#d8c3a0', spot: '#6b4630' },
  cooked_sardine: { name: 'Sardine', kind: 'fish', body: '#c08a52', belly: '#ecd2a6', heals: 4 },
  cooked_mackerel: { name: 'Mackerel', kind: 'fish', body: '#8a6a3c', belly: '#e3c79a', heals: 6 },
  cooked_beef: { name: 'Cooked beef', kind: 'meat', flesh: '#8a4e2c', fat: '#d8b98f', heals: 3 },
  burnt_fish: { name: 'Burnt fish', kind: 'fish', body: '#2e2622', belly: '#4a3c34' },
  burnt_meat: { name: 'Burnt meat', kind: 'meat', flesh: '#2b211c', fat: '#4a3a30' },
};
export const SKILLS = ['attack', 'strength', 'defence', 'hitpoints', 'woodcutting', 'fishing', 'cooking'];
// Which skill each fighting style trains, in the order the panel shows them.
export const STYLES = [
  { id: 'accurate', trains: 'Attack' },
  { id: 'aggressive', trains: 'Strength' },
  { id: 'defensive', trains: 'Defence' },
];
export const PACK_SLOTS = 28;
const MAX_XP = 200_000_000;
const MAX_STACK = 1_000_000_000;

export function saveField(name) {
  const clean = String(name || 'Player').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  return `drift_${clean || 'player'}`;
}

export function cleanSave(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const xp = {};
  for (const skill of SKILLS) {
    const n = Number(raw.xp?.[skill]);
    if (Number.isFinite(n) && n > 0) xp[skill] = Math.min(MAX_XP, Math.floor(n));
  }
  const pack = Array.isArray(raw.pack) ? raw.pack.filter((id) => ITEMS[id]).slice(0, PACK_SLOTS) : [];
  const bank = {};
  for (const [id, count] of Object.entries(raw.bank && typeof raw.bank === 'object' ? raw.bank : {})) {
    const n = Number(count);
    if (ITEMS[id] && Number.isFinite(n) && n > 0) bank[id] = Math.min(MAX_STACK, Math.floor(n));
  }
  const out = { xp, pack, bank, run: raw.run === true };
  const hp = Number(raw.hp);
  if (Number.isInteger(hp) && hp >= 1 && hp <= 99) out.hp = hp;
  if (STYLES.some((s) => s.id === raw.style)) out.style = raw.style;
  if (Array.isArray(raw.tile) && raw.tile.length === 2 && raw.tile.every((v) => Number.isInteger(v) && v >= 0 && v < 64)) out.tile = raw.tile;
  return out;
}

export function readSave(win, name) {
  return cleanSave(win?.[saveField(name)]);
}

/** Everyone who has played on this board, best total level first. */
export function islanders(win) {
  return Object.entries(win || {})
    .filter(([key]) => key.startsWith('drift_'))
    .map(([key, raw]) => ({ key, save: cleanSave(raw), name: raw?.name || key.slice(6) }))
    .filter((row) => row.save)
    .map((row) => ({ name: row.name, xp: SKILLS.reduce((sum, s) => sum + (row.save.xp[s] || 0), 0), banked: Object.values(row.save.bank).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.xp - a.xp);
}

/** Share of the way from this level to the next, 0..1. */
export function levelProgress(line) {
  if (!line) return 0;
  const span = line.next_level - line.this_level;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (line.xp - line.this_level) / span));
}
