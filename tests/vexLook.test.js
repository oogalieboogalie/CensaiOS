// The UI team marked Vex Orchestrator 63 of 100 on 2026-11-09: one flat sheet,
// tabs that did nothing when pointed at, small grey words too faint to read,
// and gaps typed in by hand. Its tab row is now a bar, its lists are sunken
// trays of raised cards, its tabs, run cards and boxes answer the pointer, and
// its words use the readable tokens. This keeps those from quietly going away.
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const css = read('src/components/windows/vex/vex.css');
const sources = {
  window: read('src/components/VexWindow.jsx'),
  parts: read('src/components/windows/vex/VexComponents.jsx'),
  tabs: read('src/components/windows/vex/VexTabs.jsx'),
};

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
const count = (text, piece) => text.split(piece).length - 1;

describe('Vex Orchestrator look', () => {
  test('the tab row is a bar, and a tab answers the pointer and shows which one is chosen', () => {
    expect(sources.window).toContain('className="hb-bar vex-tabs"');
    expect(rule('.vex-tab').transition).toMatch(/background var\(--dur-fast\)/);
    expect(rule('.vex-tab:hover').background).toBe('var(--layer-panel)');
    expect(rule('.vex-tab:hover').color).toBe('var(--ink)');
    expect(rule('.vex-tab:focus-visible').outline).toBe('2px solid var(--accent-line)');
    const chosen = rule('.vex-tab[aria-pressed="true"]');
    expect(chosen['border-bottom-color']).toBe('var(--accent)');
    // The chosen tab's name is plain ink: the accent colour alone is too faint on white.
    expect(chosen.color).toBe('var(--ink)');
  });

  test('agents and past runs are raised cards in a sunken tray', () => {
    expect(count(sources.tabs, 'className="hb-well vex-tray"')).toBe(2);
    expect(sources.parts).toContain('className="hb-panel vex-agent"');
    expect(sources.parts).toContain('className="hb-panel hb-lift vex-runcard"');
  });

  test('a past run is a real button: it sinks when pressed, shows a focus ring and keeps its chosen look under the pointer', () => {
    expect(sources.parts).toMatch(/<button\s+type="button"\s+className="hb-panel hb-lift vex-runcard"/);
    // Both are written with .hb-lift, so they beat the shared lift rule whichever stylesheet loads first.
    expect(rule('.hb-lift.vex-runcard').transition).toMatch(/box-shadow var\(--dur-fast\)/);
    expect(rule('.hb-lift.vex-runcard:active').transform).toBe('scale(var(--press-scale))');
    // Some browsers shrink a button's children to their own width: stretch keeps the count at the right edge.
    expect(rule('.vex-runcard')['align-items']).toBe('stretch');
    expect(rule('.vex-runcard:focus-visible').outline).toBe('2px solid var(--accent-line)');
    const on = rule('.vex-runcard[aria-current="true"]');
    const onUnderPointer = rule('.vex-runcard[aria-current="true"]:hover');
    expect(on.background).toBe('var(--accent-soft)');
    expect(onUnderPointer.background).toBe(on.background);
    expect(onUnderPointer['border-color']).toBe(on['border-color']);
    // On the chosen card's tint the green count is too faint, so it turns to ink.
    expect(rule('.vex-runcard[aria-current="true"] .vex-runcard-count').color).toBe('var(--ink)');
  });

  test('the event log scrolls inside its well, so what is running stays in view above it', () => {
    expect(rule('.vex-run').height).toBe('100%');
    expect(rule('.vex-run-head')['flex-shrink']).toBe('0');
    expect(rule('.vex-log').overflow).toBe('auto');
    expect(rule('.vex-log').flex).toBe('1');
  });

  test('the boxes on Config are sunken and answer the pointer', () => {
    expect(rule('.vex-input').background).toBe('var(--layer-well)');
    expect(rule('.vex-input')['box-shadow']).toBe('var(--well-shadow)');
    expect(rule('.vex-input').transition).toMatch(/border-color var\(--dur-fast\)/);
    expect(rule('.vex-input:hover')['border-color']).toBe('var(--hairline-strong)');
    expect(rule('.vex-input:focus-visible').outline).toBe('2px solid var(--accent-line)');
  });

  test('the event log and the result sit in wells, and an empty tab uses the shared empty state', () => {
    expect(sources.tabs).toContain('className="hb-well vex-log"');
    expect(sources.tabs).toContain('className="hb-well vex-aggregate"');
    for (const piece of ['className="hb-empty"', 'className="hb-empty-icon"', 'className="hb-empty-title"']) {
      expect(sources.tabs).toContain(piece);
    }
  });

  test('small grey words use the token that stays readable', () => {
    const grey = [
      '.vex-agent-text', '.vex-cap', '.vex-agent-meta', '.vex-runcard-id', '.vex-runcard-task',
      '.vex-run-id', '.vex-log-time', '.vex-log-msg', '.vex-field-label', '.vex-tip',
    ];
    for (const selector of grey) expect(rule(selector).color).toBe('var(--ink-soft)');
    // The type badge is ink on a tint, not the tint's own colour on itself.
    expect(rule('.vex-badge').color).toBe('var(--ink)');
    expect(css).not.toMatch(/[;{ ]color: var\(--ink-faint\)/);
  });

  test('green, amber and red words use the tokens that stay readable on white', () => {
    expect(rule('.vex-run-state[data-tone="good"]').color).toBe('var(--success-text)');
    expect(rule('.vex-run-state[data-tone="warn"]').color).toBe('var(--warning-text)');
    expect(rule('.vex-result-mark[data-ok="true"]').color).toBe('var(--success-text)');
    expect(rule('.vex-result-mark').color).toBe('var(--danger-text)');
    expect(rule('.vex-log-mark[data-level="error"]').color).toBe('var(--danger-text)');
    expect(rule('.vex-warn').color).toBe('var(--warning-text)');
    expect(rule('.vex-error').color).toBe('var(--danger-text)');
  });

  test('nothing is sized, spaced or coloured by hand any more', () => {
    for (const source of Object.values(sources)) expect(source).not.toMatch(/style=\{/);
    const typed = css.split('\n').filter((l) => /(?:padding|margin|gap)[a-z-]*: [^;]*\b\d+px/.test(l));
    expect(typed).toEqual([]);
  });
});
