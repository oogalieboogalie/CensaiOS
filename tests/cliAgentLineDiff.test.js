import { diffLines, parsePatch } from '../src/components/agentConsole/lineDiff.js';

describe('Agent Console diffs', () => {
  test('diffLines keeps shared lines and marks changes', () => {
    expect(diffLines('a\nb\nc', 'a\nB\nc')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'add', text: 'B' },
      { type: 'same', text: 'c' },
    ]);
    expect(diffLines('', 'new')).toEqual([{ type: 'add', text: 'new' }]);
  });

  test('parsePatch splits a git diff into files and hunks', () => {
    const patch = [
      'diff --git a/src/a.js b/src/a.js',
      'index 1..2 100644',
      '--- a/src/a.js',
      '+++ b/src/a.js',
      '@@ -1,2 +1,2 @@',
      ' keep',
      '-old',
      '+new',
      'diff --git a/img.png b/img.png',
      'Binary files a/img.png and b/img.png differ',
    ].join('\n');
    const files = parsePatch(patch);
    expect(files.map((f) => f.path)).toEqual(['src/a.js', 'img.png']);
    expect(files[0].hunks[0].lines).toEqual([
      { type: 'same', text: 'keep' },
      { type: 'del', text: 'old' },
      { type: 'add', text: 'new' },
    ]);
    expect(files[1].binary).toBe(true);
  });
});
