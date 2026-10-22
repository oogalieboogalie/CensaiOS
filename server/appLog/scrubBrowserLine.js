/**
 * Browser lines lose what a person typed before they reach the log file.
 *
 * A console warning can quote a value straight from the page (React's
 * "blocked a javascript: URL" warning carries the typed link), so the board's
 * lines keep their fixed words and lose:
 *   - links of any kind (web, javascript:, data:, mailto: and the like); a
 *     web link to a code file keeps its path, so stack lines still say where
 *   - anything in quotes ("...", '...', `...`, “...”)
 */
// Script and data links run to the next space; the rest stop at brackets so a
// stack line's "(...)" stays whole. A bare "javascript:" with nothing after it
// is a fixed word and stays.
const SCRIPT_LINK = /\b(?:javascript|vbscript|data):\S+/gi;
const LINK = /\b(?:https?|wss?|ftp|file|blob|mailto|tel):[^\s'"`<>()[\]{}]+/gi;
const CODE_FILE = /^https?:\/\/[^/\s]+(\/[^?#\s]*\.(?:m?jsx?|tsx?|css))(?:[?#][^:\s]*)?((?::\d+){0,2})$/i;
const QUOTED = [
  /(^|[^\w])"[^"\n]*"/g,
  /(^|[^\w])'[^'\n]*'(?!\w)/g,
  /(^|[^\w])`[^`\n]*`/g,
  /(^|[^\w])“[^”\n]*”/g,
];

function link(match) {
  const code = CODE_FILE.exec(match);
  return code ? `${code[1]}${code[2]}` : '<link>';
}

/** One browser message or detail with quoted values and links taken out. */
export function scrubBrowserLine(value) {
  let text = String(value ?? '');
  for (const re of QUOTED) text = text.replace(re, '$1<value>');
  return text.replace(SCRIPT_LINK, '<link>').replace(LINK, link);
}
