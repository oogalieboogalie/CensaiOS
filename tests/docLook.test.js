// The UI team marked Document 70 of 100 on 2026-11-12: one flat sheet with
// nothing above or below anything else, a comments column of faint grey words,
// buttons that did nothing when pointed at, and gaps typed in by hand. Its
// words now sit on a raised page on a sunken desk, its comments are raised
// cards in a side bar, its buttons and boxes answer the pointer, and its small
// words use the readable tokens. This keeps those from quietly going away.
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const css = read('src/components/doc/docWindow.css');
const sources = {
  window: read('src/components/DocWindow.jsx'),
  card: read('src/components/doc/AnnotationCard.jsx'),
  picker: read('src/components/doc/AnnotationUI.jsx'),
  backlinks: read('src/components/doc/BacklinksBox.jsx'),
  graph: read('src/components/doc/NoteGraph.jsx'),
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

describe('Document look', () => {
  test('the words sit on a raised page, and the page on a sunken desk', () => {
    expect(sources.window).toMatch(/className="hb-well doc-desk"/);
    expect(sources.window).toMatch(/data-doc-body className="hb-panel doc-page"/);
    // The page scrolls inside the desk, and a click on the desk beside it still counts.
    expect(rule('.hb-panel.doc-page')['overflow-y']).toBe('auto');
    expect(sources.window).toMatch(/className="hb-well doc-desk"[^>]*onMouseUp=\{isEditing \? undefined : onBodyMouseUp\}/);
    // The desk runs edge to edge under the header: no frame of its own.
    expect(rule('.hb-well.doc-desk')['border-width']).toBe('0');
    expect(rule('.hb-well.doc-desk')['border-radius']).toBe('0');
  });

  test('the box you type in fills the page, keeps its name and shows when it is read-only', () => {
    expect(sources.window).toMatch(/aria-label="Document text"/);
    expect(sources.window).toContain('className="doc-editor"');
    expect(rule('.doc-edit').height).toBe('100%');
    expect(rule('.doc-editor').height).toBe('100%');
    expect(rule('.doc-editor').width).toBe('100%');
    expect(rule('.doc-editor').transition).toMatch(/opacity var\(--dur-base\)/);
    expect(rule('.doc-editor[readonly]').opacity).toBe('0.75');
    expect(rule('.doc-editor::placeholder').color).toBe('var(--ink-soft)');
    expect(rule('.hb-panel.doc-page[data-editing="true"]:focus-within')['border-color']).toBe('var(--hairline-strong)');
  });

  test('an empty note and an empty comments bar use the shared empty state, with the same words', () => {
    expect(sources.window).toContain('className="hb-empty doc-blank"');
    expect(sources.window).toContain('<div className="hb-empty-title">Click anywhere to start writing</div>');
    expect(sources.window).toContain('className="hb-empty doc-rail-empty"');
    expect(sources.window).toContain('<div className="hb-empty-text">select words<br/>to add a comment</div>');
    expect(sources.window.split('className="hb-empty-icon"').length - 1).toBe(2);
  });

  test('comments are raised cards in a side bar, and a card lifts under the pointer', () => {
    expect(sources.window).toContain('<div data-doc-comments className="hb-bar doc-rail">');
    expect(rule('.hb-bar.doc-rail')['border-left']).toBe('1px solid var(--hairline)');
    expect(sources.card).toContain('className="hb-panel hb-lift doc-note"');
    // The kind's own colour marks the card's edge, and rings the one picked out.
    expect(sources.card).toContain('style={kindVars(ann.kind)}');
    expect(rule('.hb-panel.doc-note')['border-left']).toBe('3px solid var(--doc-kind-ring)');
    expect(rule('.hb-panel.doc-note[data-active="true"]')['border-color']).toBe('var(--doc-kind-ring)');
  });

  test('the small buttons answer the pointer, sink when pressed and show a focus ring', () => {
    expect(sources.card).toContain('title="Remove" className="doc-x"><Icon.Close size={10}/></button>');
    for (const name of ['.doc-x', '.doc-selbtn', '.doc-agent', '.doc-commit']) {
      expect(rule(name).transition).toMatch(/var\(--dur-fast\)/);
      expect(rule(`${name}:focus-visible`).outline).toBe('2px solid var(--accent-line)');
      expect(rule(`${name}:active`).transform).toBe('scale(var(--press-scale))');
    }
    expect(rule('.doc-x:hover').background).toBe('var(--glass-hover)');
    expect(rule('.doc-x:hover').color).toBe('var(--ink)');
    // The bar over picked words is ink-coloured, so its hover tint is mixed from the surface: it shows in dark and in light.
    expect(rule('.doc-selbtn:hover').background).toBe('color-mix(in oklab, var(--surface) 16%, transparent)');
    expect(sources.picker).not.toMatch(/onMouseEnter|onMouseLeave/);
    expect(sources.backlinks).not.toMatch(/onMouseEnter|onMouseLeave/);
  });

  test('the box for a new note is sunken, and its button is dark words on the kind\'s pale colour', () => {
    expect(rule('.doc-composer-input').background).toBe('var(--layer-well)');
    expect(rule('.doc-composer-input')['box-shadow']).toBe('var(--well-shadow)');
    expect(rule('.doc-composer-input:hover')['border-color']).toBe('var(--hairline-strong)');
    expect(rule('.doc-composer-input:focus-visible')['border-color']).toBe('var(--accent-line)');
    // White words on the amber, blue or green were too faint to read.
    expect(rule('.doc-commit').background).toBe('var(--doc-kind-bg)');
    expect(rule('.doc-commit').color).toBe('var(--doc-kind-ink)');
    // The helper you picked keeps its ring under the pointer.
    const picked = rule('.doc-agent[aria-pressed="true"]');
    expect(picked['box-shadow']).toBe('0 0 0 2px var(--doc-kind-ring)');
    expect(rule('.doc-agent[aria-pressed="true"]:hover')['box-shadow']).toBe(picked['box-shadow']);
    expect(sources.picker).toContain('aria-pressed={agentId === a.id}');
  });

  test('a backlink is a real button that lifts, and the hint shows [[ as code', () => {
    expect(sources.backlinks).toMatch(/<button type="button" key=\{i\} className="hb-panel hb-lift doc-backlink"/);
    // Written with .hb-lift, so these beat the shared lift rule whichever stylesheet loads first.
    expect(rule('.hb-lift.doc-backlink').transition).toMatch(/box-shadow var\(--dur-fast\)/);
    expect(rule('.hb-lift.doc-backlink:hover')['border-color']).toBe('var(--accent-line)');
    expect(rule('.hb-lift.doc-backlink:active').transform).toBe('scale(var(--press-scale))');
    expect(rule('.doc-backlink:focus-visible').outline).toBe('2px solid var(--accent-line)');
    expect(sources.backlinks).toContain('<code className="hb-code">[[</code>');
    expect(sources.backlinks).toContain('data-testid="backlinks-hint"');
  });

  test('the note graph sits in a well and a note answers the pointer', () => {
    expect(sources.graph).toContain('className="hb-well doc-graph"');
    expect(sources.graph).toContain('className="doc-graph-node"');
    expect(rule('.doc-graph-node:hover circle').stroke).toBe('var(--accent)');
    expect(rule('.doc-graph-name')['font-size']).toBe('var(--text-xs)');
    expect(sources.graph).not.toMatch(/fontSize=/);
  });

  test('small grey words use the token that stays readable', () => {
    const grey = [
      '.doc-loading', '.doc-label', '.doc-quote', '.doc-note-lost', '.doc-hint', '.doc-capped',
      '.hb-panel.doc-backlink', '.doc-composer-tip', '.doc-x',
    ];
    for (const selector of grey) expect(rule(selector).color).toBe('var(--ink-soft)');
    expect(rule('.doc-graph-name').fill).toBe('var(--ink-soft)');
    expect(css).not.toMatch(/var\(--ink-faint\)/);
    for (const source of Object.values(sources)) expect(source).not.toMatch(/--ink-faint/);
  });

  test('nothing is sized, spaced or coloured by hand any more', () => {
    // The only inline styles left carry data: where the pop-ups sit, and a note kind's colours.
    const inline = Object.values(sources).flatMap((source) => source.match(/style=\{[^\n]*?\}\}?/g) || []);
    expect(inline).toEqual([
      'style={kindVars(ann.kind)}',
      'style={{ left: x, top: y - 36 }}',
      'style={{ left: Math.min(x, 400), top: y + 14, ...kindVars(kind) }}',
    ]);
    const typed = css.split('\n').filter((l) => /(?:padding|margin|gap)[a-z-]*: [^;]*\b\d+px/.test(l));
    expect(typed).toEqual([]);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|oklch\(/i);
  });
});
