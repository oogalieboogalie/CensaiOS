/**
 * @jest-environment jsdom
 */
import {
  buildExcalidrawScene,
  getExcalidrawStorageKey,
  persistExcalidrawScene,
  readExcalidrawScene,
} from '../src/components/excalidraw/state.js';

describe('excalidraw scene persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('prefers saved localStorage scene for the current window', () => {
    const win = { id: 'ex-1', title: 'Sketch', state: { excalidraw: { elements: [{ id: 'state' }] } } };
    const stored = buildExcalidrawScene([{ id: 'local' }], { name: 'Stored sketch' }, {}, 'Sketch');
    window.localStorage.setItem(getExcalidrawStorageKey(win.id), JSON.stringify(stored));

    expect(readExcalidrawScene(win).elements).toEqual([{ id: 'local' }]);
  });

  test('persists normalized scenes under the window storage key', () => {
    persistExcalidrawScene('ex-2', { elements: [{ id: 'a' }], appState: { name: 'Persisted' }, files: null });

    expect(JSON.parse(window.localStorage.getItem(getExcalidrawStorageKey('ex-2')))).toEqual({
      elements: [{ id: 'a' }],
      appState: { name: 'Persisted', viewBackgroundColor: 'transparent' },
      files: {},
    });
  });
});
