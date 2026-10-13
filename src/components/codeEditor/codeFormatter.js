// Prettier-backed formatting for the code editor. Prettier is loaded with
// dynamic imports so it only enters the bundle when the user formats.
// Prettier v3 `format()` is async — callers must await these helpers.

import { prettierParserForLanguage } from './languageDetect.js';

// Maps a prettier parser name to the plugin module specifier(s) it needs.
// Each arm uses a static import string so Vite can bundle the chunks.
async function loadPluginsForParser(parser) {
  const estree = await import('prettier/plugins/estree');
  switch (parser) {
    case 'babel':
      return [estree, await import('prettier/plugins/babel')];
    case 'typescript':
      return [estree, await import('prettier/plugins/typescript')];
    case 'html':
      return [await import('prettier/plugins/html')];
    case 'css':
    case 'scss':
    case 'less':
      return [await import('prettier/plugins/postcss')];
    case 'json':
      return [estree, await import('prettier/plugins/babel')];
    case 'markdown':
      return [await import('prettier/plugins/markdown')];
    case 'yaml':
      return [await import('prettier/plugins/yaml')];
    case 'graphql':
      return [await import('prettier/plugins/graphql')];
    default:
      return null;
  }
}

function normalizeError(err) {
  const msg = String(err?.message || err || 'Formatting failed');
  // Prettier syntax errors are verbose — keep the first meaningful line.
  const first = msg.split('\n').map((l) => l.trim()).find((l) => l.length > 0) || msg;
  return first.length > 220 ? `${first.slice(0, 220)}…` : first;
}

// Formats a whole document. Returns { ok: true, code } or { ok: false, error }.
export async function formatDocument(text, language, { tabWidth = 2, useTabs = false } = {}) {
  const parser = prettierParserForLanguage(language);
  if (!parser) return { ok: false, error: `No formatter for ${language || 'this language'} yet` };
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, error: 'Nothing to format' };
  }
  try {
    const plugins = await loadPluginsForParser(parser);
    if (!plugins) return { ok: false, error: `No formatter for ${language} yet` };
    const { format } = await import('prettier/standalone');
    const code = await format(text, { parser, plugins, tabWidth, useTabs });
    return { ok: true, code };
  } catch (err) {
    return { ok: false, error: normalizeError(err) };
  }
}

// Formats a selected fragment with the same parser. Partial statements may
// not parse — callers should fall back to formatDocument in that case.
export async function formatSelectionFragment(fragment, language, opts) {
  const res = await formatDocument(fragment, language, opts);
  if (!res.ok) return res;
  // Whole-document formatters add a trailing newline; fragments splice back
  // into the line, so strip exactly one trailing newline.
  return { ok: true, code: res.code.replace(/\n$/, '') };
}
