export function parseOutlinks(text) {
  const matches = (text || '').match(/\[\[(.*?)\]\]/g) || [];
  return matches.map(m => {
    const name = m.slice(2, -2);
    return { name, path: name.includes('.') ? name : `${name}.md` };
  });
}
