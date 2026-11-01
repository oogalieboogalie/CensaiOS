// Example notes for the Obsidian-like vault window. A new vault starts empty;
// these sit under "Examples", read-only until someone copies one into their
// own notes.

export const EXAMPLE_NOTES = Object.freeze([
  Object.freeze({
    id: 'example-tart',
    title: 'Brown butter nectarine tart',
    text: [
      '- Brown the butter until nutty and fragrant',
      '- Toss sliced nectarines with sugar and a pinch of salt',
      '- Blind-bake a flaky tart shell until pale gold',
      '- Fold nectarines into the browned butter custard',
      '- Bake until the center just sets, then cool before slicing',
    ].join('\n'),
  }),
]);

export function noteStats(text = '') {
  const trimmed = String(text);
  const words = trimmed.trim() ? trimmed.trim().split(/\s+/).length : 0;
  return { words, characters: trimmed.length };
}
