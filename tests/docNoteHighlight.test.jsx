/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render } from '@testing-library/react';
import { renderMarkdown } from '../src/lib/renderMarkdown.jsx';
import { mapShownText, rawToRanges, selectionToRaw, caretToRaw } from '../src/components/doc/docTextMap.js';
import { noteAt } from '../src/components/doc/useNoteHighlights.js';

const RAW = '# Made-up plan\n\nWe meet **at noon** by the old mill on Friday.\n- See [[Made-up Plan B]] if the old mill is shut.';

function shown(raw = RAW) {
  const { container } = render(<div>{renderMarkdown(raw)}</div>);
  return container.firstChild;
}

function select(body, words, nth = 0) {
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const at = node.textContent.indexOf(words);
    if (at < 0 || seen++ < nth) continue;
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + words.length);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    return;
  }
  throw new Error(`no "${words}" on screen`);
}

test('a note on words after a bold word is saved at their place in the file', () => {
  const body = shown();
  select(body, 'old mill');
  const range = selectionToRaw(body, RAW);
  expect(RAW.slice(range.start, range.end)).toBe('old mill');
  expect(range.start).toBe(RAW.indexOf('old mill'));
});

test('a note after a wiki link and a list bullet lands on the right words', () => {
  const body = shown();
  select(body, 'old mill', 1);
  const range = selectionToRaw(body, RAW);
  expect(range.start).toBe(RAW.lastIndexOf('old mill'));
  expect(RAW.slice(range.start, range.end)).toBe('old mill');
});

test('a note is painted back over the same words, inside one line of the sentence', () => {
  const body = shown();
  const start = RAW.indexOf('old mill');
  const ranges = rawToRanges(mapShownText(body, RAW), start, start + 'old mill'.length);
  expect(ranges.map(String)).toEqual(['old mill']);
  const line = ranges[0].startContainer.parentElement.closest('div');
  expect(line.textContent).toBe('We meet at noon by the old mill on Friday.');
});

test('a note across bold words paints each run and skips the marks', () => {
  const body = shown();
  const start = RAW.indexOf('meet');
  const end = RAW.indexOf(' by the');
  const ranges = rawToRanges(mapShownText(body, RAW), start, end);
  expect(ranges.map(String).join('|')).toBe('meet |at noon');
});

test('the list bullet is drawn, not part of the text a note can cover', () => {
  const body = shown();
  const words = mapShownText(body, RAW).map(({ node }) => node.textContent).join('');
  expect(words).not.toContain('•');
});

test('a click on painted words finds that note', () => {
  const body = shown();
  select(body, 'mill');
  window.getSelection().collapseToStart();
  const at = caretToRaw(body, RAW);
  const notes = [{ id: 'n1', start: RAW.indexOf('old mill'), end: RAW.indexOf('old mill') + 8 }];
  expect(noteAt(notes, at)?.id).toBe('n1');
  expect(noteAt(notes, 0)).toBeNull();
});
