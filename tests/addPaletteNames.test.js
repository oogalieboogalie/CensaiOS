import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from '@babel/parser';
import { buildAddSections, EXCLUDED_KINDS, PROPS_BY_KIND } from '../src/lib/modules/addPaletteItems.js';
import { MODULE_MENU_MANIFESTS } from '../src/lib/windowManifest.js';
import { LAUNCHPAD_BOARDS, LAUNCHPAD_STARTS } from '../src/lib/launchpadStarts.js';

// Add (Ctrl+K) finds a window by every name the board shows for it: its own,
// the empty board's starting button's and the title its header shows.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const search = (query) => buildAddSections({ query, manifests: MODULE_MENU_MANIFESTS });
const rows = (query) => search(query).flatMap((s) => s.items);
const first = (query) => rows(query)[0];
const IN_ADD = MODULE_MENU_MANIFESTS.filter((m) => !EXCLUDED_KINDS.has(m.kind));
const KINDS_IN_ADD = new Set(IN_ADD.map((m) => m.kind));
const ownName = new Map(IN_ADD.map((m) => [m.label.toLowerCase(), m.kind]));

const START_TILES = LAUNCHPAD_STARTS.filter((s) => KINDS_IN_ADD.has(s.kind)).map((s) => [s.label, s.kind]);

/**
 * The titles a window's code gives it in its header: label="X", or
 * label={win.title || 'X'} (`named`: what it shows until something names it).
 */
function titlesIn(file) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'JSXOpeningElement' && node.name.name === 'WindowTitle') {
      const value = node.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === 'label')?.value;
      const ex = value?.type === 'JSXExpressionContainer' ? value.expression : value;
      if (ex?.type === 'StringLiteral') found.push({ title: ex.value });
      if (ex?.type === 'LogicalExpression' && ex.operator === '||' && ex.right.type === 'StringLiteral' && ex.left.property?.name === 'title') {
        found.push({ title: ex.right.value, named: true });
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'loc') continue;
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  };
  visit(parse(fs.readFileSync(path.join(ROOT, file), 'utf8'), { sourceType: 'module', plugins: ['jsx'] }).program);
  return found;
}

// [title, kind]: what each window's header says when Add opens it.
const TITLES = IN_ADD.filter((m) => m.componentPath && fs.existsSync(path.join(ROOT, m.componentPath)))
  .flatMap((m) => titlesIn(m.componentPath).map(({ title, named }) => [(named && PROPS_BY_KIND[m.kind]?.title) || title, m.kind]));

test('"Project files", the title Files shows, finds Files first, named as typed', () => {
  for (const typed of ['Project files', 'project files', 'PROJECT FILES']) {
    const sections = search(typed);
    expect(sections[0]).toMatchObject({ id: 'best', label: 'Best match' });
    expect(sections[0].items[0]).toMatchObject({ label: 'Project files', hint: 'Files · VS Code-style', action: { type: 'spawn', kind: 'files' } });
    // Still offered once, and "Make a new module" stays last, not first.
    expect(rows(typed).filter((r) => r.id === 'kind:files')).toHaveLength(1);
    expect(sections.at(-1).items[0].action.type).toBe('make');
  }
});

test('a word of another name lists the row by that name, after the rows found by their own', () => {
  const sections = search('project');
  const also = sections.findIndex((s) => s.id === 'also');
  expect(sections[also]).toMatchObject({ label: 'Also known as' });
  expect(sections[also].items.find((r) => r.id === 'kind:files')).toMatchObject({ label: 'Project files', hint: 'Files · VS Code-style' });
  // Windows whose own name or description says "project" come first.
  expect(sections.slice(0, also).flatMap((s) => s.items).map((r) => r.id)).toEqual(expect.arrayContaining(['kind:finderFiles', 'kind:todos']));
  expect(rows('proj fil').find((r) => r.id === 'kind:files')).toMatchObject({ label: 'Project files' });
  expect(rows('files').find((r) => r.id === 'kind:files')).toMatchObject({ label: 'Files', hint: 'VS Code-style' });
  expect(first('Files')).toMatchObject({ label: 'Files', action: { kind: 'files' } });
});

test('a few letters of another name never put that window ahead of one whose own name holds them', () => {
  expect(first('pad')).toMatchObject({ label: 'Sketchpad' });
  expect(rows('pad').find((r) => r.id === 'kind:idea')).toMatchObject({ label: 'Idea Pad' });
  expect(first('room')).toMatchObject({ label: 'Classroom' });
  for (const typed of ['pad', 'open', 'build', 'proj']) {
    const sections = search(typed).filter((s) => s.items.length);
    const also = sections.findIndex((s) => s.id === 'also');
    if (also >= 0) expect(sections.slice(also + 1).every((s) => !s.id.startsWith('cat:'))).toBe(true);
  }
});

test('letters inside a word are not another name, so names do not flicker while typing', () => {
  for (const typed of ['o', 'pen', 'it', 'ject', 'iles']) {
    expect(rows(typed).filter((r) => r.ownLabel)).toEqual([]);
  }
  expect(rows('ject').map((r) => r.id)).not.toContain('kind:files');
});

test('a module named exactly what was typed comes before a window that only shows that name', () => {
  const saved = [{ id: 'made-up', name: 'Project files', manifest: { description: 'A made-up saved module' } }];
  const best = buildAddSections({ query: 'Project files', manifests: MODULE_MENU_MANIFESTS, saved })[0];
  expect(best).toMatchObject({ id: 'best' });
  expect(best.items.map((r) => r.id)).toEqual(['saved:made-up', 'kind:files']);
  // Also when that module is listed further down (Templates come last) than
  // the window (Vault notes, whose header says "Notes").
  const templates = [{ id: 'made-up', manifest: { name: 'Notes', description: 'A made-up template' } }];
  const notes = buildAddSections({ query: 'Notes', manifests: MODULE_MENU_MANIFESTS, templates })[0];
  expect(notes.items.map((r) => r.id)).toEqual(['template:made-up', 'kind:vaultNotes']);
  expect(notes.items[1]).toMatchObject({ label: 'Notes', hint: expect.stringMatching(/^Vault notes · /) });
});

test('a module named exactly what was typed comes before another module that shows that name', () => {
  // The Image Generator's name starts with "Image"; Image stays first.
  expect(first('Image')).toMatchObject({ label: 'Image', action: { kind: 'image' } });
  expect(first('Settings')).toMatchObject({ label: 'Settings', action: { kind: 'appearance' } });
  expect(first('Document')).toMatchObject({ label: 'Document', action: { kind: 'doc' } });
});

test('with nothing typed, every row reads the module\'s own name', () => {
  const builtIn = buildAddSections({ manifests: MODULE_MENU_MANIFESTS }).flatMap((s) => s.items).filter((r) => r.id.startsWith('kind:'));
  for (const row of builtIn) expect(row.label).toBe(IN_ADD.find((m) => `kind:${m.kind}` === row.id).label);
});

test('the empty board\'s starting buttons are all checked', () => {
  expect(START_TILES).toEqual([['Chat with Censai', 'chat'], ['Find leads', 'leadHound'], ['Browse modules', 'marketplace']]);
});

test.each(START_TILES)('the starting button "%s" finds its window first, so Enter opens it', (name, kind) => {
  const row = first(name);
  expect(row.action).toMatchObject({ type: 'spawn', kind });
  expect(row.label.toLowerCase()).toBe(name.toLowerCase());
});

test.each(LAUNCHPAD_BOARDS.map((b) => [b.label, b.id]))('the empty board\'s "%s" chip finds that ready-made board first, as the best match', (name, id) => {
  const [best] = search(name);
  expect(best).toMatchObject({ id: 'best' });
  expect(best.items[0]).toMatchObject({ label: name, action: { type: 'boardTemplate', id } });
});

test('the windows\' own titles are all checked', () => {
  expect(TITLES.length).toBeGreaterThan(40);
  expect(TITLES).toEqual(expect.arrayContaining([['Project files', 'files'], ['Idea Pad', 'idea'], ['AI coding assistants', 'toolchainSettings']]));
});

test('the Image Generator\'s header says its own name, never just "Image" like the Image window', () => {
  expect(TITLES.filter(([, kind]) => kind === 'genImage')).toEqual([['Image Generator', 'genImage']]);
  expect(first('Image Generator')).toMatchObject({ label: 'Image Generator', action: { type: 'spawn', kind: 'genImage' } });
});

test.each(TITLES)('the title "%s" finds its window (first, unless another module has that name)', (title, kind) => {
  expect(rows(title).map((r) => r.id)).toContain(`kind:${kind}`);
  const other = ownName.get(title.toLowerCase());
  if (!other || other === kind) expect(first(title).action).toMatchObject({ type: 'spawn', kind });
});
