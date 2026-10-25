/**
 * src/lib/yorware/securityNames.js
 *
 * YorWare security names (diagram 11). Each Yor-* name labels a real
 * security piece of censaiOS, so the names mean something you can open:
 *   Yor-Thangorodrim     the gate: Open anywhere (this PC only unless you pair)
 *   Yor-NarsilCore-API   the engine: API Bar, one door for every API
 *   Yor-BombadilBox      the sandbox: where agents' coding tools run
 *   Yor-DuneDainSecurity the privacy watch: ad and tracker blocking
 */

export const YOR_SECURITY = Object.freeze([
  {
    id: 'thangorodrim',
    name: 'Yor-Thangorodrim',
    line: 'The fortress wall. Only this PC gets in, unless you hand another computer a code.',
    piece: 'Open anywhere',
    where: 'Settings > Open anywhere',
  },
  {
    id: 'narsil',
    name: 'Yor-NarsilCore-API',
    line: 'The engine. One door for every API: a doorman checks the key and signs every answer.',
    piece: 'API Bar',
    where: 'Add > API Bar',
  },
  {
    id: 'bombadil',
    name: 'Yor-BombadilBox',
    line: 'The sandbox. Agents and coding tools run in their own box, away from your files.',
    piece: 'AI coding assistants sandbox',
    where: 'Settings > Agents > Docker sandbox image',
  },
  {
    id: 'dunedain',
    name: 'Yor-DuneDainSecurity',
    line: 'The quiet watch. Blocks ads and trackers on the web pages you open.',
    piece: 'Block ads on web pages',
    where: 'Settings > Canvas > Block ads on web pages',
  },
]);

const BY_ID = new Map(YOR_SECURITY.map((entry) => [entry.id, entry]));

/** The YorWare name entry for a security piece, or null. */
export function yorSecurity(id) {
  return BY_ID.get(id) || null;
}
