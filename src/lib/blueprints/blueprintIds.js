// Pure: blueprint IDs from diagram 08. An ID reads
//   <shelf><number><code>^<year>     e.g. 14h7*skyFs^2026
// shelf 1 = Finance, the 4th blueprint on that shelf, code h7*skyFs, 2026.
// The code always starts with a lowercase letter so the number before it
// can grow past 9 and the ID still reads back the same way.

export const BLUEPRINT_SHELVES = Object.freeze([
  { number: 1, name: 'Finance' },
  { number: 2, name: 'Real Estate' },
  { number: 3, name: 'Wildcard' },
  { number: 4, name: 'Accounting' },
  { number: 5, name: 'Insurance' },
]);

const SHELF_BY_NUMBER = new Map(BLUEPRINT_SHELVES.map((shelf) => [shelf.number, shelf]));
const CODE_FIRST = 'abcdefghijkmnpqrstuvwxyz';
const CODE_REST = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789*';
const ID_PATTERN = /^([1-9])(\d{1,6})([a-z][A-Za-z0-9*]{7})\^(\d{4})$/;

export function shelfName(number) {
  return SHELF_BY_NUMBER.get(Number(number))?.name || '';
}

/** Shelf number from a number or a name ("real estate", "3", 4). Wildcard if unknown. */
export function shelfNumber(value) {
  const n = Number(value);
  if (SHELF_BY_NUMBER.has(n)) return n;
  const wanted = String(value || '').trim().toLowerCase();
  const found = BLUEPRINT_SHELVES.find((shelf) => shelf.name.toLowerCase() === wanted);
  return found ? found.number : 3;
}

/** An 8-character code like h7*skyFs. `random` returns [0, 1). */
export function blueprintCode(random = Math.random) {
  let code = CODE_FIRST[Math.floor(random() * CODE_FIRST.length)];
  for (let i = 1; i < 8; i += 1) code += CODE_REST[Math.floor(random() * CODE_REST.length)];
  return code;
}

export function makeBlueprintId({ shelf, number, year, code }) {
  return `${shelfNumber(shelf)}${Math.max(1, Math.floor(Number(number) || 1))}${code || blueprintCode()}^${year}`;
}

/** { shelf, shelfName, number, code, year } or null when it isn't a blueprint ID. */
export function parseBlueprintId(id) {
  const match = ID_PATTERN.exec(String(id || '').trim());
  if (!match) return null;
  const shelf = Number(match[1]);
  return { shelf, shelfName: shelfName(shelf), number: Number(match[2]), code: match[3], year: Number(match[4]) };
}

export function isBlueprintId(id) {
  return ID_PATTERN.test(String(id || '').trim());
}

const ORDINAL = (n) => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${tail}`;
};

/** "Finance shelf, the 4th one, code h7*skyFs, made in 2026" */
export function describeBlueprintId(id) {
  const parts = parseBlueprintId(id);
  if (!parts) return '';
  return `${parts.shelfName || `Shelf ${parts.shelf}`} shelf, the ${ORDINAL(parts.number)} one, code ${parts.code}, made in ${parts.year}`;
}
