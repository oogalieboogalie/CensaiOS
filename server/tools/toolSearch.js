function tokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function scoreTool(tool, queryTokens) {
  const name = String(tool.name || '').toLowerCase();
  const label = String(tool.label || '').toLowerCase();
  const type = String(tool.type || '').toLowerCase();
  const kit = String(tool.kit || '').toLowerCase();
  const category = String(tool.category || '').toLowerCase();
  const tags = (tool.tags || []).map(tag => String(tag).toLowerCase());
  const description = String(tool.description || '').toLowerCase();

  return queryTokens.reduce((score, token) => {
    if (name === token || name.replaceAll('_', ' ') === token) return score + 100;
    if (name.includes(token)) score += 35;
    if (label.includes(token)) score += 24;
    if (type.includes(token)) score += 20;
    if (kit.includes(token)) score += 18;
    if (category.includes(token)) score += 14;
    if (tags.some(tag => tag === token)) score += 16;
    else if (tags.some(tag => tag.includes(token))) score += 8;
    if (description.includes(token)) score += 4;
    return score;
  }, 0);
}

export function searchToolCatalog(tools, query, options = {}) {
  const queryTokens = tokens(query);
  const kit = String(options.kit || '').trim().toLowerCase();
  const type = String(options.type || '').trim().toLowerCase();
  const limit = Math.min(Math.max(Number(options.limit) || 8, 1), 20);

  return tools
    .filter(tool => !kit || String(tool.kit || '').toLowerCase() === kit)
    .filter(tool => !type || String(tool.type || '').toLowerCase() === type)
    .map(tool => ({ tool, score: queryTokens.length ? scoreTool(tool, queryTokens) : 1 }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
    .slice(0, limit)
    .map(({ tool, score }) => ({ ...tool, relevance: score }));
}

