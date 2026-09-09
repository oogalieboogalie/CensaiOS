import {
  addOrReplaceObject,
  deleteSelectedObject,
  makeStudioObject,
  moveObject,
  normalizeImageStudioState,
  updateDraftObject,
} from '../src/components/windows/imageStudio/model.js';

describe('Image Studio drawing model', () => {
  test('normalizes missing state with the default Imagen model', () => {
    expect(normalizeImageStudioState(null)).toMatchObject({
      objects: [],
      selectedObjectId: null,
      prompt: '',
      additionalInstructions: '',
      model: 'imagen-4.0-generate-001',
    });
  });

  test('creates and updates serializable drawing objects', () => {
    const rect = makeStudioObject('rect', { x: 20, y: 30 }, {
      id: 'shape-1',
      color: '#ffffff',
      strokeWidth: 5,
    });

    expect(updateDraftObject(rect, { x: 5, y: 10 })).toMatchObject({
      id: 'shape-1',
      type: 'rect',
      x: 20,
      y: 30,
      w: -15,
      h: -20,
      fill: 'transparent',
    });
  });

  test('adds, replaces, deletes, and moves selected objects', () => {
    const base = normalizeImageStudioState({ objects: [] });
    const text = makeStudioObject('text', { x: 10, y: 15 }, { id: 'label-1', text: 'Launch' });
    const added = addOrReplaceObject(base, text);

    expect(added.objects).toHaveLength(1);
    expect(added.selectedObjectId).toBe('label-1');

    const moved = moveObject(text, 8, -5);
    const replaced = addOrReplaceObject(added, moved);
    expect(replaced.objects).toEqual([expect.objectContaining({ x: 18, y: 10 })]);

    const deleted = deleteSelectedObject(replaced);
    expect(deleted.objects).toEqual([]);
    expect(deleted.selectedObjectId).toBeNull();
  });

  test('moves path objects without mutating the original points', () => {
    const path = { id: 'path-1', type: 'path', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] };
    const moved = moveObject(path, 10, 20);

    expect(moved.points).toEqual([{ x: 11, y: 22 }, { x: 13, y: 24 }]);
    expect(path.points).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
  });
});
