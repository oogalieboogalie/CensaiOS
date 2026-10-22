// What a window may load in its frame from a saved link. A board is shared,
// so any member's browser can write a window's link; a "javascript:" or
// "data:" link there would run as every other member who opens the board.
// Only plain web addresses get through; anything else loads nothing.

export function webOnlyFrameSrc(url) {
  const text = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(text)) return '';
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? text : '';
  } catch {
    return '';
  }
}
