/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render } from '@testing-library/react';
import { renderInline, renderMarkdown } from '../src/lib/renderMarkdown.jsx';

// Agent Console steps, chat messages, summaries and Docs all go through this
// renderer. An _ inside a word is part of the word (backlog 215: the console
// showed MADE_UP_KEY as "MADE", an italic "UP", then "KEY"), while _made-up_
// on its own is still italic. Made-up names only.

function shown(text) {
  const { container } = render(<div>{renderMarkdown(text)}</div>);
  return { text: container.textContent, italics: [...container.querySelectorAll('em')].map((em) => em.textContent) };
}

test('names with underscores keep them, and nothing in them turns italic', () => {
  const said = 'Done: MADE_UP_KEY and NEXT_PUBLIC_SITE_NAME stay as they were; see made_up_notes.md and __init__.py.';
  expect(shown(said)).toEqual({ text: said, italics: [] });
});

test('_made-up_ on its own is still italic, also beside a name with underscores', () => {
  expect(shown('_made-up_')).toEqual({ text: 'made-up', italics: ['made-up'] });
  expect(shown('Set MADE_UP_KEY, then _restart_ the (_made-up_) app.')).toEqual({
    text: 'Set MADE_UP_KEY, then restart the (made-up) app.',
    italics: ['restart', 'made-up'],
  });
});

test('words that only look like marks stay as written', () => {
  expect(shown('a _ b _ c, x__y__z and made_up_')).toEqual({ text: 'a _ b _ c, x__y__z and made_up_', italics: [] });
});

test('bold, *italic*, code and wiki links still work, and code keeps its underscores', () => {
  const { container } = render(<div>{renderInline('**Made-up** and *plain* and `made_up_notes.md` and [[Made_up Page]]')}</div>);
  expect(container.querySelector('strong').textContent).toBe('Made-up');
  expect(container.querySelector('em').textContent).toBe('plain');
  expect(container.querySelector('code').textContent).toBe('made_up_notes.md');
  expect(container.querySelector('[data-wiki-link]').textContent).toBe('Made_up Page');
});

test('a chat message with a picture keeps the underscores in the words around it', () => {
  const renderImage = ({ alt, src }) => <img alt={alt} src={src} />;
  const { container } = render(<div>{renderInline('MADE_UP_KEY ![made-up shop](/made_up_shop.png) _new_', null, renderImage)}</div>);
  expect(container.textContent).toBe('MADE_UP_KEY  new');
  expect(container.querySelector('img').getAttribute('src')).toBe('/made_up_shop.png');
  expect(container.querySelector('em').textContent).toBe('new');
});
