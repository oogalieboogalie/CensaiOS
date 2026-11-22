/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// The "Blurred" chat bubbles, picked per chat window in Window Style: the
// accent shapes behind are blurred, each message sits on a bubble with softly
// blurred edges, and the words stay sharp. The numbers are the owner's picks.
import React from 'react';
import fs from 'node:fs';
import { TextDecoder, TextEncoder } from 'node:util';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { WindowStyleMenu } from '../src/components/windows/WindowStyleMenu.jsx';
import { ChatWindow } from '../src/components/ChatWindow.jsx';

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const css = fs.readFileSync(new URL('../src/components/chat/blurredChat.css', import.meta.url), 'utf8');

function renderMenu(win) {
  const onUpdate = jest.fn();
  render(<WindowStyleMenu win={win} theme={{ hue: 225 }} onUpdate={onUpdate} onClose={jest.fn()} colorMenuRef={React.createRef()} />);
  return onUpdate;
}

describe('the Chat bubbles choice in Window Style', () => {
  test('shows on a chat window and turns the blurred bubbles on and off', () => {
    const onUpdate = renderMenu({ id: 'c1', kind: 'chat' });
    const select = screen.getByLabelText('Chat bubbles');
    expect(select).toHaveValue('');
    fireEvent.change(select, { target: { value: 'blurred' } });
    expect(onUpdate).toHaveBeenLastCalledWith({ chatStyle: 'blurred' });
    fireEvent.change(select, { target: { value: '' } });
    expect(onUpdate).toHaveBeenLastCalledWith({ chatStyle: undefined });
  });

  test('is not offered on other windows', () => {
    renderMenu({ id: 't1', kind: 'todos' });
    expect(screen.queryByLabelText('Chat bubbles')).not.toBeInTheDocument();
  });
});

describe('the chat window', () => {
  beforeEach(() => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => [] }));
  });

  const chatRoot = (win) => render(<ChatWindow win={win} onUpdate={jest.fn()} allWins={[]} canvasGroups={[]} currentProject={null} isActive />)
    .container.querySelector('[data-chat-root]');

  test('carries the blurred style only when it is picked', () => {
    expect(chatRoot({ id: 'a', kind: 'chat', agentId: 'censai', msgs: [], chatStyle: 'blurred' })).toHaveAttribute('data-chat-style', 'blurred');
    expect(chatRoot({ id: 'b', kind: 'chat', agentId: 'censai', msgs: [] })).not.toHaveAttribute('data-chat-style');
    expect(chatRoot({ id: 'c', kind: 'chat', agentId: 'censai', msgs: [], chatStyle: 'something-else' })).not.toHaveAttribute('data-chat-style');
  });
});

describe('the look, as the owner picked it', () => {
  const rule = (selectorPart) => {
    const at = css.indexOf(selectorPart);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };

  test('the shapes behind: blur 25, scale 1.08, colour 126 %, in the window accent', () => {
    const back = rule('.hb-chat[data-chat-style="blurred"]::before');
    expect(back).toMatch(/filter: blur\(25px\) saturate\(126%\)/);
    expect(back).toMatch(/transform: scale\(1\.08\)/);
    expect(back).toMatch(/var\(--accent\)/);
  });

  test('bubbles: edges softened by 2, agent 78 %, the person 61 %', () => {
    expect(css).toMatch(/filter: blur\(2px\)/);
    expect(css).toMatch(/var\(--surface\) 78%, transparent/);
    expect(css).toMatch(/var\(--accent\) 61%, transparent/);
  });

  test('only the bubble layer is blurred, never the words', () => {
    const blurs = [...css.matchAll(/^\s*([^{}\n]+)\{[^}]*filter: blur/gm)].map((m) => m[1]);
    for (const selector of css.match(/[^{}]+\{[^}]*filter: blur[^}]*\}/g)) {
      expect(selector.split('{')[0]).toMatch(/::before/);
    }
    expect(blurs.length).toBeGreaterThan(0);
  });

  test('the chat itself is never clipped, so the model picker keeps its room', () => {
    expect(css).not.toMatch(/overflow:\s*hidden/);
    expect(rule('.hb-chat[data-chat-style="blurred"]::before')).toMatch(/clip-path: inset\(3\.7%\)/);
  });

  test('no empty bubble while the agent is still thinking', () => {
    const agentRules = css.match(/\.hb-msg\[data-from="agent"\] \.hb-msg-body[^\s,{]*/g);
    expect(agentRules.length).toBeGreaterThan(0);
    for (const r of agentRules) expect(r).toMatch(/:not\(:empty\)/);
  });

  test('styled only inside a blurred chat, so every other chat is unchanged', () => {
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}@]+(?=\{)/g).map((s) => s.trim()).filter((s) => !s.startsWith('supports'));
    for (const s of selectors) expect(s).toMatch(/\[data-chat-style="blurred"\]/);
  });
});
