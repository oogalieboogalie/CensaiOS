// The UI team marked Jules Tasks 70 of 100 on 2026-11-12: one flat sheet, a
// Refresh button that did nothing when pointed at, amber words too faint to
// read on white, and gaps typed in by hand. Refresh and the "completed" box now
// sit on a bar, each list is a sunken tray of raised cards, the button, the box,
// the cards and the links answer the pointer, and the words use the readable
// tokens. This keeps those from quietly going away.
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const css = read('src/components/jules/jules.css');
const sources = {
  window: read('src/components/JulesTasksWindow.jsx'),
  queue: read('src/components/jules/JulesQueuePanel.jsx'),
  waves: read('src/components/jules/JulesWavesPanel.jsx'),
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

describe('Jules Tasks look', () => {
  test('the window brings its own stylesheet', () => {
    expect(sources.window).toMatch(/^import '\.\/jules\/jules\.css';$/m);
  });

  test('Refresh sits on a bar, and it answers the pointer, a press and the keyboard', () => {
    expect(sources.window).toContain('className="hb-bar jules-bar"');
    expect(sources.window).toMatch(/<button\s+type="button"\s+className="hb-btn hb-press jules-refresh"/);
    // Written with .hb-btn, so these beat the shared button rule whichever stylesheet loads first.
    expect(rule('.hb-btn.jules-refresh').transition).toMatch(/background var\(--dur-fast\)/);
    expect(rule('.hb-btn.jules-refresh')['box-shadow']).toBe('var(--control-raise)');
    expect(rule('.hb-btn.jules-refresh:hover')['border-color']).toBe('var(--hairline-strong)');
    expect(rule('.hb-btn.jules-refresh:hover')['box-shadow']).toBe('var(--control-raise-hot)');
    expect(rule('.hb-btn.jules-refresh:focus-visible').outline).toBe('2px solid var(--accent-line)');
    expect(rule('.hb-btn.jules-refresh:active:not(:disabled)').transform).toBe('scale(var(--press-scale))');
    // While it is loading the button waits, and says so with the pointer.
    expect(rule('.hb-btn.jules-refresh:disabled').cursor).toBe('wait');
  });

  test('the "completed" box answers the pointer and shows a focus ring', () => {
    expect(sources.window).toContain('<label className="jules-check">');
    expect(rule('.jules-check').transition).toMatch(/background var\(--dur-fast\)/);
    expect(rule('.jules-check:hover').color).toBe('var(--ink)');
    expect(rule('.jules-check-box').transition).toMatch(/var\(--dur-fast\)/);
    expect(rule('.jules-check-box:focus-visible').outline).toBe('2px solid var(--accent-line)');
  });

  test('every list is a sunken tray, and each task, wave and session is a raised card', () => {
    expect(sources.queue).toContain('className="hb-well jules-tray"');
    expect(sources.queue).toContain('className="hb-panel jules-item"');
    expect(sources.window).toContain('className="hb-well jules-tray"');
    expect(sources.window).toContain('className="hb-panel jules-item"');
    expect(sources.waves).toContain('className="hb-well jules-wave-row"');
    expect(sources.waves).toContain('className="hb-panel jules-wave"');
    // A list with nothing in it still shows its tray, with the note inside.
    expect(sources.queue).toContain('className="jules-tray-empty"');
  });

  test('a card answers the pointer', () => {
    // Written with .hb-panel, so these beat the shared card rule whichever stylesheet loads first.
    for (const card of ['.hb-panel.jules-item', '.hb-panel.jules-wave']) {
      expect(rule(card).transition).toMatch(/box-shadow var\(--dur-fast\)/);
      expect(rule(`${card}:hover`)['box-shadow']).toBe('var(--panel-shadow-hover)');
    }
    expect(rule('.hb-panel.jules-item:hover')['border-color']).toBe('var(--hairline-strong)');
  });

  test('a locked wave lies flat with a dashed edge, and stays readable', () => {
    const locked = rule('.hb-panel.jules-wave[data-state="locked"]');
    expect(locked['border-style']).toBe('dashed');
    expect(locked['box-shadow']).toBe('none');
    expect(css).not.toMatch(/opacity: 0\.[0-5]/);
  });

  test('the key note is a raised card with an amber tint, and nothing at all shows the shared empty state', () => {
    expect(sources.window).toContain('<div role="status" className="hb-panel jules-notice">');
    expect(rule('.hb-panel.jules-notice').background).toMatch(/var\(--warning\)/);
    for (const piece of ['className="hb-empty"', 'className="hb-empty-icon"', 'className="hb-empty-title"']) {
      expect(sources.window).toContain(piece);
    }
  });

  test('a link in a session answers the pointer and shows a focus ring', () => {
    expect(sources.window.split('className="jules-link"').length - 1).toBe(2);
    expect(rule('.jules-link').transition).toMatch(/background var\(--dur-fast\)/);
    expect(rule('.jules-link:hover').background).toBe('var(--accent-soft)');
    expect(rule('.jules-link:focus-visible').outline).toBe('2px solid var(--accent-line)');
    // Ink with an accent underline: the accent colour alone is too faint on white.
    expect(rule('.jules-link').color).toBe('var(--ink)');
  });

  test('small grey words use the token that stays readable', () => {
    const grey = [
      '.jules-loaded', '.jules-counts', '.jules-note', '.jules-label', '.jules-tray-empty', '.jules-item-meta',
      '.jules-item-note', '.jules-session-meta', '.jules-notice-text', '.jules-wave-label', '.jules-wave-stage',
      '.jules-wave-summary',
    ];
    for (const selector of grey) expect(rule(selector).color).toBe('var(--ink-soft)');
    // A status pill is ink on a tint, not the tint's own colour on itself.
    expect(rule('.jules-pill').color).toBe('var(--ink)');
    expect(css).not.toMatch(/[;{ ]color: var\(--ink-faint\)/);
  });

  test('green, amber and red words use the tokens that stay readable on white', () => {
    expect(rule('.jules-item-note[data-tone="good"]').color).toBe('var(--success-text)');
    expect(rule('.jules-item-note[data-tone="warn"]').color).toBe('var(--warning-text)');
    expect(rule('.jules-item-note[data-tone="bad"]').color).toBe('var(--danger-text)');
    expect(rule('.jules-wave-task[data-stage="needs-fix"] .jules-wave-stage').color).toBe('var(--danger-text)');
    expect(rule('.jules-error').color).toBe('var(--danger-text)');
    // The old bright status colours are too faint as words on white: none is left.
    expect(css).not.toMatch(/var\(--ps-/);
    for (const source of Object.values(sources)) expect(source).not.toMatch(/var\(--ps-/);
  });

  test('nothing is sized, spaced or coloured by hand any more', () => {
    for (const source of Object.values(sources)) expect(source).not.toMatch(/style=\{/);
    const typed = css.split('\n').filter((l) => /(?:padding|margin|gap)[a-z-]*: [^;]*\b\d+px/.test(l));
    expect(typed).toEqual([]);
    // "margin: auto" pushes things apart by an odd number of pixels; stretch the neighbour instead.
    expect(css).not.toMatch(/margin[a-z-]*: [^;]*auto/);
  });
});
