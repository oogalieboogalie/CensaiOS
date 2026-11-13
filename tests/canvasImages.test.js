import { dragHasPicture, imageFilesFrom, imageUrlFrom, isTypingTarget, titleFor, windowSizeFor } from '../src/lib/canvasImages.js';

const file = (name, type) => ({ name, type, size: 10 });
const item = (f) => ({ kind: 'file', type: f.type, getAsFile: () => f });

describe('pictures pasted or dropped on the board', () => {
  test('picks only the images out of a paste', () => {
    const png = file('shot.png', 'image/png');
    const txt = file('notes.txt', 'text/plain');
    const clip = { items: [item(txt), item(png), { kind: 'string', type: 'text/plain' }] };
    expect(imageFilesFrom(clip)).toEqual([png]);
  });

  test('falls back to the file list on a drop', () => {
    const jpg = file('a.jpg', 'image/jpeg');
    expect(imageFilesFrom({ items: [], files: [file('b.zip', 'application/zip'), jpg] })).toEqual([jpg]);
    expect(imageFilesFrom(null)).toEqual([]);
  });

  test('takes an https image link dragged from a web page', () => {
    const drop = (text) => ({ getData: (t) => (t === 'text/uri-list' ? text : '') });
    expect(imageUrlFrom(drop('https://example.com/cat.webp?w=800'))).toBe('https://example.com/cat.webp?w=800');
    expect(imageUrlFrom(drop('# comment\nhttps://example.com/pic.PNG'))).toBe('https://example.com/pic.PNG');
    expect(imageUrlFrom(drop('https://example.com/page.html'))).toBeNull();
    expect(imageUrlFrom(drop('http://example.com/cat.png'))).toBeNull();
    expect(imageUrlFrom(drop('javascript:alert(1)'))).toBeNull();
  });

  test('only lets a drag through when it carries a file or a link', () => {
    expect(dragHasPicture({ types: ['Files'] })).toBe(true);
    expect(dragHasPicture({ types: ['text/uri-list'] })).toBe(true);
    expect(dragHasPicture({ types: ['text/plain'] })).toBe(false);
  });

  test('leaves Ctrl+V alone while someone is typing', () => {
    const el = (tagName, extra = {}) => ({ nodeType: 1, tagName, ...extra });
    expect(isTypingTarget(el('TEXTAREA'))).toBe(true);
    expect(isTypingTarget(el('INPUT', { type: 'text' }))).toBe(true);
    expect(isTypingTarget(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(isTypingTarget(el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(isTypingTarget(el('BUTTON'))).toBe(false);
    expect(isTypingTarget(el('BODY'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  test('sizes the window to the picture, within limits', () => {
    expect(windowSizeFor(1600, 900)).toEqual({ w: 420, h: 236 + 96 });
    expect(windowSizeFor(100, 2000).h).toBe(640 + 96); // very tall: capped
    expect(windowSizeFor(4000, 100).h).toBe(160 + 96); // very wide: floored
    expect(windowSizeFor(0, 0)).toEqual({ w: 420, h: 315 + 96 }); // unknown: 4:3
  });

  test('names the window after the file, or "Pasted picture"', () => {
    expect(titleFor(file('Screenshot 2026-11-11 093000.png', 'image/png'))).toBe('Screenshot 2026-11-11 093000');
    expect(titleFor(file('image.png', 'image/png'))).toBe('Pasted picture');
    expect(titleFor({})).toBe('Pasted picture');
  });
});
