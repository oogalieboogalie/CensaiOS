// "Keep working on it with any model": hand a design block's code to the
// chosen model with a plain-language change request and take back the full
// rewritten code in the same format.

export const MAX_REMIX_SOURCE_BYTES = 400 * 1024;
export const REMIX_SOURCE_TYPES = Object.freeze(['html', 'tailwind', 'react', 'svg', 'css']);

const FORMAT_HINT = {
  html: 'a complete standalone HTML document with inline CSS',
  tailwind: 'HTML that uses Tailwind CSS utility classes (the Tailwind CDN is injected for you)',
  react: 'a single React function component in JSX (React and ReactDOM are globals; no imports needed)',
  svg: 'a single standalone <svg> element',
  css: 'a CSS stylesheet',
};

export function normalizeRemixSourceType(value) {
  const type = String(value || '').trim().toLowerCase();
  return REMIX_SOURCE_TYPES.includes(type) ? type : 'html';
}

export function buildRemixMessages({ source, sourceType, instruction }) {
  const type = normalizeRemixSourceType(sourceType);
  return [
    {
      role: 'system',
      content: [
        'You are a senior product designer who writes production UI code.',
        `The user is editing ${FORMAT_HINT[type]} that renders live on a design canvas.`,
        'Apply the requested change, keep everything else as it is, and keep the visual quality high:',
        'consistent spacing, a clear type scale, accessible contrast, and real-looking content.',
        'Keep data-name attributes on elements that still exist.',
        'Reply with the complete updated code in one fenced code block and nothing else.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Change request: ${instruction}\n\nCurrent code:\n\`\`\`${type === 'react' ? 'jsx' : type}\n${source}\n\`\`\``,
    },
  ];
}

/** Take the first fenced block (or the whole reply when the model skipped fences). */
export function extractRemixedCode(reply) {
  const text = String(reply || '').trim();
  const fenced = text.match(/```[\w-]*\s*\n([\s\S]*?)```/);
  const code = (fenced ? fenced[1] : text).trim();
  return code;
}
