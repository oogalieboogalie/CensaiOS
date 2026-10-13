import * as Y from 'yjs';
import { applyTextDiff, diffText, mergeLocalEdit, rebaseCaret } from '../server/collab/textDiff.js';

describe('text diff for shared editing', () => {
  test('finds the single changed span', () => {
    expect(diffText('abc', 'abc')).toEqual({ index: 0, remove: 0, insert: '' });
    expect(diffText('hello world', 'hello brave world')).toEqual({ index: 6, remove: 0, insert: 'brave ' });
    expect(diffText('hello world', 'hello')).toEqual({ index: 5, remove: 6, insert: '' });
    expect(diffText('aaa', 'aaaa')).toEqual({ index: 3, remove: 0, insert: 'a' });
    expect(diffText('', 'new')).toEqual({ index: 0, remove: 0, insert: 'new' });
    expect(diffText(null, 'x')).toEqual({ index: 0, remove: 0, insert: 'x' });
  });

  test('applying the diff to a Y.Text reproduces the target', () => {
    const doc = new Y.Doc();
    const text = doc.getText('t');
    text.insert(0, 'The quick fox');
    for (const target of ['The quick brown fox', 'A quick fox!', '', 'fresh']) {
      applyTextDiff(text, diffText(text.toString(), target));
      expect(text.toString()).toBe(target);
    }
  });

  test('a caret before, inside and after a remote edit lands sensibly', () => {
    const op = diffText('hello world', 'hello brave world');
    expect(rebaseCaret(2, op)).toBe(2);
    expect(rebaseCaret(6, op)).toBe(6);
    expect(rebaseCaret(11, op)).toBe(17);
    const del = diffText('abcdefgh', 'abgh');
    expect(rebaseCaret(4, del)).toBe(2);
    expect(rebaseCaret(8, del)).toBe(4);
  });
});

describe('replaying a keystroke onto newer shared text', () => {
  test('is a plain write when nothing else changed', () => {
    expect(mergeLocalEdit('abc', 'abXc', 'abc')).toBe('abXc');
    expect(mergeLocalEdit('abc', 'abXc', undefined)).toBe('abXc');
  });

  test('keeps a remote edit the editor had not shown yet', () => {
    // Someone added ", again" at the end; my editor still showed the old text
    // when I typed " brave" in the middle.
    expect(mergeLocalEdit('Hello world', 'Hello brave world', 'Hello world, again')).toBe('Hello brave world, again');
    // Their edit landed before mine: my insert shifts with it.
    expect(mergeLocalEdit('a b', 'a b!', 'XX a b')).toBe('XX a b!');
    // A delete replays too.
    expect(mergeLocalEdit('// from A', '//from A', '// from A\n// B')).toBe('//from A\n// B');
  });
});
