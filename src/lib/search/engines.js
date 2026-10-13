// Search engines for Add > Search engines. Pure data plus URL helpers.
//
// `embed` says whether the engine lets other apps show its result page in a
// frame. The desktop app ignores it: it shows every engine's real page in a
// native view (src/lib/nativeBrowserPane.js). In a web browser, engines that
// refuse framing get an honest "opens in your browser" panel instead.
//
//   kind     'web' (search in the window), 'research' (opens the Research
//            window: Tavily lives there already), 'network' (Tor)

export const DEFAULT_SEARXNG = 'https://searx.be';
export const SEARXNG_DIRECTORY = 'https://searx.space';
export const DDG_ONION = 'https://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion';
export const TOR_DOWNLOAD = 'https://www.torproject.org/download/';

export const SEARCH_ENGINES = Object.freeze([
  { id: 'duckduckgo', label: 'DuckDuckGo', hint: 'Private search, results right in the window', kind: 'web', embed: true, url: 'https://html.duckduckgo.com/html/?q=' },
  { id: 'google', label: 'Google', hint: 'Opens results in your browser on the web', kind: 'web', embed: false, url: 'https://www.google.com/search?q=' },
  { id: 'tavily', label: 'Tavily', hint: 'AI search with sources, in the Research window', kind: 'research' },
  { id: 'searxng', label: 'SearXNG', hint: 'Open-source metasearch, pick your own server', kind: 'web', embed: true },
  { id: 'brave', label: 'Brave Search', hint: 'Independent index, no tracking', kind: 'web', embed: false, url: 'https://search.brave.com/search?q=' },
  { id: 'bing', label: 'Bing', hint: 'Microsoft search', kind: 'web', embed: false, url: 'https://www.bing.com/search?q=' },
  { id: 'startpage', label: 'Startpage', hint: 'Google results without the tracking', kind: 'web', embed: true, url: 'https://www.startpage.com/do/search?q=' },
  { id: 'kagi', label: 'Kagi', hint: 'Paid, ad-free search (needs a Kagi account)', kind: 'web', embed: false, url: 'https://kagi.com/search?q=' },
  { id: 'ecosia', label: 'Ecosia', hint: 'Search that plants trees', kind: 'web', embed: false, url: 'https://www.ecosia.org/search?q=' },
  { id: 'mojeek', label: 'Mojeek', hint: 'Its own crawler, no tracking', kind: 'web', embed: false, url: 'https://www.mojeek.com/search?q=' },
  { id: 'tor', label: 'Tor', hint: 'Onion sites through the Tor Browser', kind: 'network' },
]);

export const SEARCH_ENGINE_BY_ID = Object.freeze(Object.fromEntries(SEARCH_ENGINES.map(e => [e.id, e])));

/** The engine record for an id, DuckDuckGo when unknown. */
export function engineFor(id) {
  return SEARCH_ENGINE_BY_ID[id] || SEARCH_ENGINE_BY_ID.duckduckgo;
}

/** A SearXNG server address cleaned up: https by default, no trailing slash. */
export function normalizeInstance(raw) {
  let s = String(raw || '').trim();
  if (!s) return DEFAULT_SEARXNG;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return DEFAULT_SEARXNG;
  }
}

/** The result page for a query on an engine, or '' when the engine has none. */
export function resultsUrl(engineId, query, { instance } = {}) {
  const q = String(query || '').trim();
  const engine = engineFor(engineId);
  if (!q || engine.kind !== 'web') return '';
  if (engine.id === 'searxng') return `${normalizeInstance(instance)}/search?q=${encodeURIComponent(q)}`;
  return `${engine.url}${encodeURIComponent(q)}`;
}

/** Add-palette rows for the Search engines section. */
export function searchPaletteEntries() {
  return SEARCH_ENGINES.map(e => ({
    id: `search:${e.id}`,
    label: e.label,
    hint: e.hint,
    brand: e.id === 'tor' ? 'torproject' : e.id,
    kind: e.kind === 'research' ? 'research' : 'searchEngine',
    props: e.kind === 'research' ? {} : { engine: e.id, title: e.label },
  }));
}
