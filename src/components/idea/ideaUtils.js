export function initialIdeas(win) {
  if (Array.isArray(win.ideas) && win.ideas.length) return win.ideas;
  return String(win.content || '')
    .split('\n')
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

export function cleanIdeaList(items = []) {
  return items.map(item => String(item || '').trim()).filter(Boolean);
}

export function ideaSignature(items = []) {
  return JSON.stringify(cleanIdeaList(items));
}

// Bullets this tab added since its last save that the shared copy lacks,
// added onto the shared copy so a teammate's save can't wipe them.
export function keepUnsavedIdeas(shared = [], local = [], lastSaved = []) {
  const count = (list) => list.reduce((m, item) => m.set(item, (m.get(item) || 0) + 1), new Map());
  const saved = count(lastSaved);
  const have = count(shared);
  const extra = [];
  for (const item of local) {
    if ((saved.get(item) || 0) > 0) { saved.set(item, saved.get(item) - 1); continue; }
    if ((have.get(item) || 0) > 0) { have.set(item, have.get(item) - 1); continue; }
    extra.push(item);
  }
  return extra.length ? [...shared, ...extra] : shared;
}
