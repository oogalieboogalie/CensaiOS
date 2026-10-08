// Spec 6: the generator's instructions. The model gets the module format, the
// Module SDK, the theme tokens and the base kit, plus worked examples, and
// writes one module per request (or rewrites one for a change request).

import { MODULE_ICONS, MODULE_PERMISSIONS } from '../../src/lib/modules/moduleFormat.js';
import { loadModuleExamples } from './examples.js';

export const MAX_REQUEST_CHARS = 2000;
export const GENERATOR_MARKER = 'You build censaiOS modules.';

const RULES = `${GENERATOR_MARKER}
A module is a small single-purpose app that runs in a window on a shared canvas. People describe what they want in plain English; you return a working module.

Reply with exactly two fenced blocks and no other text:
1. \`\`\`json with the manifest: {"name": short title (max 4 words), "description": one sentence, "icon": one of ${MODULE_ICONS.join(', ')}, "size": {"w": 280-1200, "h": 220-900}, "permissions": [] or any of ${MODULE_PERMISSIONS.map(p => `"${p}"`).join(', ')}}
2. \`\`\`html with the module body: markup, then one <style>, then one <script>. No <html>, <head> or <body> tags; they are added for you.

The sandbox:
- No imports, no CDNs, no external fonts or images. Plain JavaScript (ES2020) only; no JSX, no frameworks.
- No network unless the manifest asks for "network" (fetch to https only). Never ask for permissions you don't need.
- Inline SVG is fine for icons and charts. No emoji anywhere.

The Module SDK is the global \`censai\`:
- censai.storage.get(key, fallback) returns saved data synchronously; censai.storage.set(key, value) saves JSON data. It is shared live with everyone on the canvas, so call censai.storage.onChange((key, value) => render()) and re-render from storage.
- censai.agent.ask(prompt) returns a Promise of the user's agent's text answer (needs "agent" permission; handle errors with a calm inline message).
- censai.presence.list() returns [{name}] of people on the canvas; censai.presence.onChange(fn).
- censai.toast(message) shows a small host notification. censai.resize(w, h) asks for a new window size.
- censai.theme.get('--accent') reads a token; censai.theme.onChange(fn) fires when the theme changes.

Look and feel (match the host; restrained like Linear or Figma):
- Use only the CSS variables for color, radius, type and spacing: --surface, --surface-2, --surface-3, --ink, --ink-soft, --ink-faint, --hairline, --hairline-strong, --accent, --accent-soft, --accent-ink, --danger, --success, --warning, --on-fill; --radius-xs|sm|md|lg|xl|full; --text-xs|sm|md|base|lg|xl|2xl; --space-1..8; --font-sans, --font-mono. Never hard-code colors, so the module restyles when the theme changes.
- The base kit already styles body, headings, button, input, select, textarea and table. Helper classes: .card .row .stack .grid .spread .pill .muted .faint .label .big .num; button.primary (one per view), button.ghost, button.danger.
- No gradients, no shadows beyond var(--elevation-1), one accent color, tight radii, generous whitespace, real-looking sample content, tabular numbers for figures.
- The body already has padding. Fit the window; let lists scroll inside their own area.
- Every control must work. Validate input. Empty states say what to do next.`;

const EDIT_RULES = `When you are given an existing module and a change request: apply the change, keep everything else (including storage keys, so saved data survives), and return the complete updated manifest and HTML in the same two-block format.`;

function exampleTurns(examples) {
  return examples.flatMap(example => [
    { role: 'user', content: `Request: ${example.request}` },
    { role: 'assistant', content: `\`\`\`json\n${JSON.stringify(example.manifest)}\n\`\`\`\n\n\`\`\`html\n${example.source}\n\`\`\`` },
  ]);
}

// Spec 9 "Make real": the sketch rides along as an image part.
const SKETCH_NOTE = 'The attached image is a hand-drawn sketch of the interface. Build what it shows: boxes are inputs, panels or buttons, handwriting is the real labels and text, arrows are flow. Keep its layout; make every control work.';

export async function buildGenerateMessages({ request, sketch = '' }) {
  const examples = await loadModuleExamples();
  const text = `Request: ${String(request).slice(0, MAX_REQUEST_CHARS)}`;
  return [
    { role: 'system', content: RULES },
    ...exampleTurns(examples),
    sketch
      ? { role: 'user', content: [{ type: 'text', text: `${text}\n\n${SKETCH_NOTE}` }, { type: 'image_url', image_url: { url: sketch } }] }
      : { role: 'user', content: text },
  ];
}

export async function buildEditMessages({ request, instruction, source, manifest }) {
  const examples = await loadModuleExamples();
  return [
    { role: 'system', content: `${RULES}\n\n${EDIT_RULES}` },
    ...exampleTurns(examples.slice(0, 2)),
    {
      role: 'user',
      content: [
        request ? `Original request: ${String(request).slice(0, MAX_REQUEST_CHARS)}` : null,
        `Current module:\n\`\`\`json\n${JSON.stringify(manifest || {})}\n\`\`\`\n\n\`\`\`html\n${source}\n\`\`\``,
        `Change request: ${String(instruction).slice(0, MAX_REQUEST_CHARS)}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

const ASK_SYSTEM = 'You answer questions from a small app on the user\'s canvas. Be brief and plain: a short paragraph or a short list, no preamble. If the app asks for a specific format (JSON, a list), follow it exactly.';

export function buildAskMessages({ prompt, moduleName }) {
  return [
    { role: 'system', content: `${ASK_SYSTEM}${moduleName ? ` The app is "${String(moduleName).slice(0, 60)}".` : ''}` },
    { role: 'user', content: String(prompt).slice(0, 4000) },
  ];
}
