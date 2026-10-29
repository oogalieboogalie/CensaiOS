import { buildAddSections } from '../src/lib/modules/addPaletteItems.js';
import { MODULE_MENU_MANIFESTS } from '../src/lib/windowManifest.js';

const first = (query) => buildAddSections({ query, manifests: MODULE_MENU_MANIFESTS }).find((s) => s.items.length)?.items[0];

test('typing a module\'s exact name puts that module first, so Enter opens it', () => {
  expect(first('Document')).toMatchObject({ label: 'Document', action: { type: 'spawn', kind: 'doc' } });
  expect(first('document')).toMatchObject({ label: 'Document' });
  expect(first('Writer')).toMatchObject({ label: 'Writer' });
});

test('the best match is moved, not listed twice', () => {
  const sections = buildAddSections({ query: 'Document', manifests: MODULE_MENU_MANIFESTS });
  const ids = sections.flatMap((s) => s.items.map((i) => i.id));
  expect(ids.filter((id) => id === 'kind:doc')).toHaveLength(1);
  expect(sections[0]).toMatchObject({ id: 'best', label: 'Best match' });
});

test('a search with no exact name keeps the usual order', () => {
  const sections = buildAddSections({ query: 'docu', manifests: MODULE_MENU_MANIFESTS });
  expect(sections.some((s) => s.id === 'best')).toBe(false);
});
