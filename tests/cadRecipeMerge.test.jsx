/**
 * @jest-environment jsdom
 */
// Real-time editing, CAD recipe slice: Pat and Sam change one part's recipe
// at the same time. Before, the recipe was saved as one piece: whoever ran
// last wiped the other's change. Now the board keeps the recipe as merging
// text, and a person's unsaved copy takes in a teammate's run as it lands.
import * as Y from 'yjs';
import { act, renderHook } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { codePatch, readCad } from '../src/lib/yorware/cadModel.js';
import { rebaseDraft, startDraft, typeInDraft, draftValue } from '../src/lib/collaboration/draftText.js';
import { useCadDraft } from '../src/components/yorware/cad/useCadDraft.js';

const RECIPE = [
  'const params = [];',
  'function main(r, p) {',
  '  return r.makeBaseBox(40, 20, 10);',
  '}',
].join('\n');
const PAT_RECIPE = RECIPE.replace('const params = [];', "const params = [{ name: 'width', default: 40 }];");
const SAM_RECIPE = RECIPE.replace('makeBaseBox(40, 20, 10)', 'makeBaseBox(40, 20, 12)');

function twoBoards() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  const base = { wins: [{ id: 'cad-1', kind: 'yorCad', x: 0, y: 0, w: 900, h: 600, ...codePatch(RECIPE) }] };
  writeStateToDoc(a, null, base, 'local');
  sync();
  const run = (doc, code) => writeStateToDoc(doc, base, { wins: [{ ...base.wins[0], ...codePatch(code) }] }, 'local');
  return { a, b, sync, run };
}

test('two people running recipe changes at the same moment both land, on both screens', () => {
  const { a, b, sync, run } = twoBoards();
  run(a, PAT_RECIPE);
  run(b, SAM_RECIPE);
  sync();
  const pat = readCad(readDocState(a).wins[0]).code;
  const sam = readCad(readDocState(b).wins[0]).code;
  expect(pat).toBe(sam);
  expect(pat).toContain("name: 'width'");
  expect(pat).toContain('makeBaseBox(40, 20, 12)');
});

test('an unsaved copy takes in a teammate\'s run and keeps my edits', () => {
  const copy = startDraft(RECIPE);
  // Pat types her new size line letter by letter, Sam runs his change meanwhile.
  typeInDraft(copy, RECIPE.replace('[]', '[{]'), 17);
  expect(rebaseDraft(copy, SAM_RECIPE)).toBe(SAM_RECIPE.replace('[]', '[{]'));
  typeInDraft(copy, draftValue(copy).replace('[{]', "[{ name: 'width', default: 40 }]"), 47);
  expect(draftValue(copy)).toBe(SAM_RECIPE.replace('[]', "[{ name: 'width', default: 40 }]"));
  // Sam runs again; my copy still has both.
  const again = SAM_RECIPE.replace('makeBaseBox', 'makeBaseBox /* Sam */');
  expect(rebaseDraft(copy, again)).toBe(again.replace('[]', "[{ name: 'width', default: 40 }]"));
});

test('the CAD window\'s recipe editor merges a teammate\'s run into my unsaved edits, so my Run keeps both', () => {
  const { result, rerender } = renderHook(({ code }) => useCadDraft(code, 'cad-1'), { initialProps: { code: RECIPE } });
  act(() => result.current.setDraft(PAT_RECIPE, 47));
  expect(result.current.draft).toBe(PAT_RECIPE);
  rerender({ code: SAM_RECIPE });
  const both = SAM_RECIPE.replace('const params = [];', "const params = [{ name: 'width', default: 40 }];");
  expect(result.current.draft).toBe(both);
  // My Run writes my copy onto the board as it is now: Sam's change stays.
  const { a, b, sync, run } = twoBoards();
  run(b, SAM_RECIPE);
  sync();
  writeStateToDoc(a, { wins: [{ ...readDocState(a).wins[0], ...codePatch(SAM_RECIPE) }] },
    { wins: [{ ...readDocState(a).wins[0], ...codePatch(result.current.draft) }] }, 'local');
  sync();
  expect(readCad(readDocState(b).wins[0]).code).toBe(both);
  act(() => result.current.clear());
  expect(result.current.draft).toBeNull();
});

test('with no unsaved copy, a teammate\'s run just shows', () => {
  const { result, rerender } = renderHook(({ code }) => useCadDraft(code, 'cad-1'), { initialProps: { code: RECIPE } });
  rerender({ code: SAM_RECIPE });
  expect(result.current.draft).toBeNull();
});
