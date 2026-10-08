/** @jest-environment jsdom */

// eslint-disable-next-line no-unused-vars
import React from 'react';
import { jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
// eslint-disable-next-line no-unused-vars
import { ModuleWindow } from '../src/components/ModuleWindow.jsx';

const ready = {
  id: 'mod-1',
  kind: 'module',
  status: 'ready',
  request: 'flash cards',
  manifest: { name: 'Flash cards', icon: 'Memory', size: { w: 440, h: 520 }, permissions: ['agent'] },
  source: '<p id="hello">hello</p>',
  versions: [
    { source: '<p>v1</p>', manifest: { name: 'Flash cards' }, note: 'First build', at: '2026-10-07T04:00:00Z' },
    { source: '<p id="hello">hello</p>', manifest: { name: 'Flash cards' }, note: 'Bigger buttons', at: '2026-10-07T04:05:00Z' },
  ],
  versionIndex: 1,
  moduleData: { deck: [] },
};

function fromModule(frame, data) {
  window.dispatchEvent(new MessageEvent('message', { data: { __hbModule: 1, ...data }, source: frame.contentWindow }));
}

beforeEach(() => {
  window.localStorage.clear();
  global.fetch = jest.fn();
});

test('a module runs in a sandbox with no same-origin access and a strict policy', () => {
  const { container } = render(<ModuleWindow win={ready} onUpdate={() => {}} workspaceId="w1" />);
  const frame = container.querySelector('iframe[data-module-frame]');
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
  expect(frame.getAttribute('srcdoc')).toContain("connect-src 'none'");
  expect(frame.getAttribute('srcdoc')).toContain('<p id="hello">hello</p>');
  expect(frame.getAttribute('srcdoc')).toContain('window.censai');
});

test('storage writes from the module land on the canvas; other frames are ignored', async () => {
  const onUpdate = jest.fn();
  const { container } = render(<ModuleWindow win={ready} onUpdate={onUpdate} workspaceId="w1" />);
  const frame = container.querySelector('iframe[data-module-frame]');
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { data: { __hbModule: 1, id: 9, method: 'storage.set', args: { key: 'deck', value: ['x'] } }, source: window }));
  });
  expect(onUpdate).not.toHaveBeenCalled();
  await act(async () => { fromModule(frame, { id: 1, method: 'storage.set', args: { key: 'deck', value: [{ q: 'a', a: 'b' }] } }); });
  expect(onUpdate).toHaveBeenCalledWith({ moduleData: { deck: [{ q: 'a', a: 'b' }] } });
});

test('agent.ask waits for the person to allow it, then calls the agent', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ text: 'answer' }) });
  const { container } = render(<ModuleWindow win={ready} onUpdate={() => {}} workspaceId="w1" />);
  const frame = container.querySelector('iframe[data-module-frame]');
  const replies = [];
  frame.contentWindow.postMessage = (msg) => replies.push(msg);
  await act(async () => { fromModule(frame, { id: 4, method: 'agent.ask', args: { prompt: 'Write 5 cards' } }); });
  expect(screen.getByText(/wants to/)).toHaveTextContent('This module wants to ask your agents (uses your model key).');
  expect(global.fetch).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Allow' })); });
  expect(global.fetch).toHaveBeenCalledWith('/api/modules/ask', expect.objectContaining({ method: 'POST' }));
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({ prompt: 'Write 5 cards', moduleName: 'Flash cards', workspaceId: 'w1' });
  expect(replies.find(r => r.id === 4)).toMatchObject({ __hbHost: 1, result: 'answer' });
});

test('a declined permission rejects the call without asking the server', async () => {
  const { container } = render(<ModuleWindow win={ready} onUpdate={() => {}} workspaceId="w1" />);
  const frame = container.querySelector('iframe[data-module-frame]');
  const replies = [];
  frame.contentWindow.postMessage = (msg) => replies.push(msg);
  await act(async () => { fromModule(frame, { id: 5, method: 'agent.ask', args: { prompt: 'x' } }); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: "Don't allow" })); });
  expect(replies.find(r => r.id === 5).error).toMatch(/declined/);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('calls outside the SDK are refused', async () => {
  const { container } = render(<ModuleWindow win={ready} onUpdate={() => {}} workspaceId="w1" />);
  const frame = container.querySelector('iframe[data-module-frame]');
  const replies = [];
  frame.contentWindow.postMessage = (msg) => replies.push(msg);
  await act(async () => { fromModule(frame, { id: 6, method: 'fetch', args: { url: '/api/secrets' } }); });
  expect(replies.find(r => r.id === 6).error).toMatch(/not part of the Module SDK/);
});

test('the edit panel lists versions and undo restores the previous one', async () => {
  const onUpdate = jest.fn();
  render(<ModuleWindow win={ready} onUpdate={onUpdate} workspaceId="w1" />);
  fireEvent.click(screen.getByRole('button', { name: /edit/i }));
  expect(screen.getByText('Bigger buttons')).toBeInTheDocument();
  expect(screen.getByText('First build')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ versionIndex: 0, source: '<p>v1</p>' }));
});

test('while building, everyone sees the request and the code so far', () => {
  render(<ModuleWindow win={{ id: 'b', kind: 'module', status: 'building', request: 'a habit tracker', buildPreview: '```json\n{}\n```\n```html\n<div class="stack">' }} onUpdate={() => {}} />);
  expect(screen.getByText('a habit tracker')).toBeInTheDocument();
  expect(screen.getByText(/Now · Writing the module/)).toBeInTheDocument();
  expect(screen.getByLabelText('Code so far')).toHaveTextContent('<div class="stack">');
});

test('a failed build offers to try again', () => {
  const onUpdate = jest.fn();
  render(<ModuleWindow win={{ id: 'e', kind: 'module', status: 'error', request: 'x', error: 'The model did not return a working module.' }} onUpdate={onUpdate} />);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'building', error: null }));
});
