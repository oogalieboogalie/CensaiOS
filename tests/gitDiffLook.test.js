// The UI team marked Git Diff Viewer 60 of 100 on 2026-11-09: a flat grey slab,
// buttons that did nothing when pointed at, and green and red words too faint
// to read on white. Its panes are now sunken wells, its tool row a bar, its
// buttons answer the pointer, and its coloured words use the readable tokens.
// This keeps those from quietly going away.
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/git-diff.css'), 'utf8');

// One rule per line in this stylesheet: ".selector { property: value; ... }".
// Returns that rule's declarations by exact property name, so "color" never
// matches "border-color" or "outline-color".
const rule = (selector) => {
  const line = css.split('\n').find((l) => l.startsWith(`${selector} {`));
  if (!line) throw new Error(`no rule for ${selector}`);
  const body = line.slice(line.indexOf('{') + 1, line.lastIndexOf('}'));
  const declarations = {};
  for (const part of body.split(';')) {
    const at = part.indexOf(':');
    if (at > 0) declarations[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return declarations;
};

describe('Git Diff Viewer look', () => {
  test('each pane is a sunken well, and shows which box you are typing in', () => {
    expect(rule('.gdv-pane').background).toBe('var(--layer-well)');
    expect(rule('.gdv-pane')['box-shadow']).toBe('var(--well-shadow)');
    expect(rule('.gdv-pane:focus-within')['border-color']).toBe('var(--accent-line)');
  });

  test('the tool row is a bar and the wordmark a raised plate', () => {
    expect(rule('.gdv-bar').background).toBe('var(--layer-bar)');
    expect(rule('.gdv-mark').background).toBe('var(--layer-panel)');
    expect(rule('.gdv-mark')['box-shadow']).toBe('var(--panel-shadow)');
  });

  test('buttons answer the pointer: they lift on hover, sink when pressed and show a focus ring', () => {
    expect(rule('.gdv-btn').transition).toMatch(/box-shadow var\(--dur-fast\)/);
    expect(rule('.gdv-btn:hover:not(:disabled)')['box-shadow']).toBe('var(--panel-shadow-hover)');
    expect(rule('.gdv-btn:active:not(:disabled)').transform).toBe('scale(var(--press-scale))');
    expect(rule('.gdv-btn:focus-visible').outline).toBe('2px solid var(--accent-line)');
  });

  test('"Who typed what" keeps its switched-on look while the pointer is still on it', () => {
    const on = rule('.gdv-btn[aria-pressed="true"]');
    const onUnderPointer = rule('.gdv-btn[aria-pressed="true"]:hover:not(:disabled)');
    expect(on.background).toBe('var(--accent-soft)');
    expect(onUnderPointer.background).toBe(on.background);
    expect(onUnderPointer['border-color']).toBe(on['border-color']);
  });

  test('the picker and the paste boxes answer the pointer too', () => {
    expect(rule('.gdv-select').transition).toMatch(/border-color var\(--dur-fast\)/);
    expect(rule('.gdv-select:hover')['border-color']).toBe('var(--hairline-strong)');
    expect(rule('textarea.gdv-input').transition).toMatch(/background var\(--dur-fast\)/);
    expect(rule('textarea.gdv-input:focus').background).toBeTruthy();
  });

  test('a file chip keeps its chosen look under the pointer, and its focus ring is not cut off', () => {
    expect(rule('.gdv-file--on:hover')['border-color']).toBe(rule('.gdv-file--on')['border-color']);
    // The chips sit in a strip that scrolls sideways, which would clip a ring drawn outside them.
    expect(rule('.gdv-file:focus-visible')['outline-offset']).toBe('-2px');
  });

  test('a Compare that cannot be pressed yet stays readable instead of fading out', () => {
    expect(rule('.gdv-btn:disabled').color).toBe('var(--ink-soft)');
    expect(rule('.gdv-btn:disabled').opacity).toBeUndefined();
    expect(rule('.gdv-btn--go').color).toBe('var(--accent-contrast)');
    expect(rule('.gdv-btn--go').background).toBe('var(--accent)');
  });

  test('green and red words use the tokens that stay readable on white', () => {
    for (const selector of ['.gdv-mark-git', '.gdv-add', '.gdv-cell--add .gdv-text']) {
      expect(rule(selector).color).toBe('var(--success-text)');
    }
    for (const selector of ['.gdv-mark-diff', '.gdv-del', '.gdv-cell--del .gdv-text']) {
      expect(rule(selector).color).toBe('var(--danger-text)');
    }
  });

  test('its own spacing comes from the scale, not typed-in pixels', () => {
    const own = css.split('/* Inside the Agent Console')[0];
    const typed = own.split('\n').filter((l) => /(?:padding|margin|gap)[a-z-]*: [^;]*\b\d+px/.test(l));
    expect(typed).toEqual([]);
  });
});
