import { jest } from '@jest/globals';
import { placePictures } from '../src/app/toolbar/extras/placePicture.js';

function file(type, name) {
  return { type, name };
}

function deps(extra = {}) {
  return {
    spawnAt: jest.fn(),
    log: jest.fn(),
    root: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
    pan: { x: 0, y: 0 },
    zoom: 1,
    screenToCanvas: (x, y) => ({ x, y }),
    pictureFromFile: async () => ({ src: 'data:image/png,pic', width: 400, height: 200 }),
    titleFor: (item) => item.name,
    windowSizeFor: () => ({ w: 420, h: 300 }),
    ...extra,
  };
}

test('a picture from the dock opens at the middle of the board', async () => {
  const used = deps();
  const placed = await placePictures([file('image/png', 'holiday.png')], used);
  expect(placed).toBe(1);
  expect(used.spawnAt).toHaveBeenCalledWith(
    'image',
    { title: 'holiday.png', src: 'data:image/png,pic', origin: 'file' },
    { x: 190, y: 150 },
    { w: 420, h: 300 },
  );
});

test('several pictures step aside so they do not stack exactly', async () => {
  const used = deps();
  await placePictures([file('image/png', 'a.png'), file('image/jpeg', 'b.jpg')], used);
  const first = used.spawnAt.mock.calls[0][2];
  const second = used.spawnAt.mock.calls[1][2];
  expect(second.x - first.x).toBe(32);
  expect(second.y - first.y).toBe(32);
});

test('a picture that is too big is skipped and its name is not written down', async () => {
  const used = deps({ pictureFromFile: async () => null });
  const placed = await placePictures([file('image/png', 'secret-shot.png')], used);
  expect(placed).toBe(0);
  expect(used.spawnAt).not.toHaveBeenCalled();
  expect(used.log).toHaveBeenCalledWith('warn', 'Board: a picture from the dock was too big to keep', { where: 'canvas' });
  expect(JSON.stringify(used.log.mock.calls)).not.toContain('secret-shot');
});

test('a picture that cannot be opened is skipped without its name', async () => {
  const used = deps({ pictureFromFile: async () => { throw new Error('secret-shot.png unreadable'); } });
  await placePictures([file('image/png', 'secret-shot.png')], used);
  expect(used.log).toHaveBeenCalledWith('warn', 'Board: could not open a picture from the dock', { where: 'canvas' });
  expect(JSON.stringify(used.log.mock.calls)).not.toContain('secret-shot');
});

test('files that are not pictures are ignored', async () => {
  const used = deps();
  expect(await placePictures([file('text/plain', 'notes.txt')], used)).toBe(0);
  expect(used.spawnAt).not.toHaveBeenCalled();
});

test('with no board to measure, the picture takes the next free spot', async () => {
  const used = deps({ root: null });
  await placePictures([file('image/png', 'a.png')], used);
  expect(used.spawnAt.mock.calls[0][2]).toBeNull();
});
