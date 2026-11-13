// A highlighter is the pen, washed out and wider. It uses the colour already
// chosen for the pen, so the dock does not grow a new palette.

export function highlightInk(penColor, penSize) {
  return {
    color: `color-mix(in oklab, ${penColor} 45%, transparent)`,
    size: Math.max(16, (penSize || 4) * 4),
  };
}
