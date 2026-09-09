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
