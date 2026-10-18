/**
 * src/lib/tools/toolSearch.js
 *
 * One tool search for agents (search_tools) and people (Agent Designer).
 * A tool scores on the words you typed first, then, at a third of the weight, on words
 * that mean the same job (toolMeaning.js). Each result says which meaning
 * matched (`why`), so "send a message" can show "send → mail".
 */
import { queryWords, relatedWords } from './toolMeaning.js';

function fields(tool) {
  return {
    name: String(tool.name || '').toLowerCase(),
    label: String(tool.label || '').toLowerCase(),
    type: String(tool.type || '').toLowerCase(),
    kit: String(tool.kit || '').toLowerCase(),
    category: String(tool.category || '').toLowerCase(),
    tags: (tool.tags || []).map((tag) => String(tag).toLowerCase()),
    description: String(tool.description || '').toLowerCase(),
  };
}

function wordScore(f, token, { loose = true } = {}) {
  let score = 0;
  if (f.name === token || f.name.replaceAll('_', ' ') === token) return 100;
  if (f.name.includes(token)) score += 35;
  if (f.label.includes(token)) score += 24;
  if (f.type.includes(token)) score += 20;
  if (f.kit.includes(token)) score += 18;
  if (f.category.includes(token)) score += 14;
  if (f.tags.some((tag) => tag === token)) score += 16;
  else if (f.tags.some((tag) => tag.includes(token))) score += 8;
  if (loose && f.description.includes(token)) score += 4;
  return score;
}

/** Score one tool: exact words full weight, same-meaning words a third. */
export function scoreTool(tool, words) {
  const f = fields(tool);
  let score = 0;
  const why = [];
  for (const word of words) {
    const direct = wordScore(f, word);
    if (direct) { score += direct; continue; }
    let best = 0;
    let via = null;
    for (const other of relatedWords(word)) {
      const s = wordScore(f, other, { loose: false });
      if (s > best) { best = s; via = other; }
    }
    if (best) {
      score += Math.ceil(best / 3);
      why.push(`${word} → ${via}`);
    }
  }
  return { score, why };
}

export function searchToolCatalog(tools, query, options = {}) {
  const words = queryWords(query);
  const kit = String(options.kit || '').trim().toLowerCase();
  const type = String(options.type || '').trim().toLowerCase();
  const limit = Math.min(Math.max(Number(options.limit) || 8, 1), options.maxLimit || 20);

  return tools
    .filter((tool) => !kit || String(tool.kit || '').toLowerCase() === kit)
    .filter((tool) => !type || String(tool.type || '').toLowerCase() === type)
    .map((tool) => ({ tool, ...(words.length ? scoreTool(tool, words) : { score: 1, why: [] }) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
    .slice(0, limit)
    .map(({ tool, score, why }) => ({ ...tool, relevance: score, ...(why.length ? { why } : {}) }));
}

/**
 * For a tool picker: keep each group (kit) but only its matching tools, best
 * first, plus the meanings that matched ("send → mail") to show the person.
 */
export function filterToolGroups(groups, query) {
  if (!queryWords(query).length) return { groups, meanings: [] };
  const all = groups.flatMap((group) => group.tools || []);
  const hits = searchToolCatalog(all, query, { limit: all.length || 1, maxLimit: all.length || 1 });
  const rank = new Map(hits.map((tool, i) => [tool.name, i]));
  const meanings = [...new Set(hits.flatMap((tool) => tool.why || []))].slice(0, 4);
  const kept = groups
    .map((group) => ({ ...group, tools: (group.tools || []).filter((t) => rank.has(t.name)).sort((a, b) => rank.get(a.name) - rank.get(b.name)) }))
    .filter((group) => group.tools.length > 0)
    .sort((a, b) => rank.get(a.tools[0].name) - rank.get(b.tools[0].name));
  return { groups: kept, meanings };
}
