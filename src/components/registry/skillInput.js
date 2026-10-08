// Parses the Publish form's skill field into advertised skills.
//   "write migration #database #sql, summarize #writing"
//   → [{ id: 'write-migration', name: 'write migration', tags: ['database', 'sql'] }, …]
// Tags are what the agent network's discovery matches on.

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function parseSkillInput(raw) {
  const seen = new Set();
  const skills = [];
  for (const part of String(raw || '').split(',')) {
    const tags = [...part.matchAll(/#([\w-]+)/g)].map((match) => match[1].toLowerCase());
    const name = part.replace(/#[\w-]+/g, '').replace(/\s+/g, ' ').trim();
    const id = slug(name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    skills.push({ id, name, tags: [...new Set(tags)] });
  }
  return skills;
}
