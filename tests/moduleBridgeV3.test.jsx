/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { useModuleBridge } from '../src/components/modules/useModuleBridge.js';
import { normalizeManifest } from '../src/lib/modules/moduleFormat.js';

// A stand-in for the sandboxed iframe: messages from it carry its window as
// the source, and what the host posts back is recorded.
function fakeFrame() {
  const posted = [];
  const contentWindow = { postMessage: (msg) => posted.push(msg) };
  return { frameRef: { current: { contentWindow } }, contentWindow, posted };
}

function fromModule(contentWindow, data) {
  window.dispatchEvent(new MessageEvent('message', { data: { __hbModule: 1, ...data }, source: contentWindow }));
}

const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

function setup(manifest) {
  const frame = fakeFrame();
  const onUpdate = jest.fn();
  const onRefused = jest.fn();
  const { result } = renderHook(() => useModuleBridge({
    frameRef: frame.frameRef, win: { id: 'w', moduleData: {} }, manifest: normalizeManifest(manifest),
    onUpdate, tokens: {}, grants: {}, requestPermission: async () => false, onToast: jest.fn(), onScriptError: jest.fn(), onRefused,
  }));
  return { ...frame, onUpdate, onRefused, result };
}

test('a v3 module that did not declare storage is refused, and the window hears about it', async () => {
  const { contentWindow, posted, onUpdate, onRefused } = setup({ manifest: 3, name: 'Sealed', permissions: [] });
  fromModule(contentWindow, { id: 1, method: 'storage.set', args: { key: 'k', value: 1 } });
  await flush();
  expect(onUpdate).not.toHaveBeenCalled();
  expect(posted.find(m => m.id === 1).error).toMatch(/did not ask to save data/);
  expect(onRefused).toHaveBeenCalledWith({ permission: 'storage', target: '' });

  fromModule(contentWindow, { id: 2, method: 'agent.ask', args: { prompt: 'hi' } });
  await flush();
  expect(posted.find(m => m.id === 2).error).toMatch(/did not ask for agent access/);

  fromModule(contentWindow, { method: 'refused', args: { permission: 'network', target: 'https://evil.example/steal' } });
  expect(onRefused).toHaveBeenLastCalledWith({ permission: 'network', target: 'https://evil.example/steal' });
  // A sealed module sees no saved data and nobody on the board.
  expect(posted.find(m => m.type === 'storage').data).toEqual({});
});

test('a module that declared storage saves through the board', async () => {
  const { contentWindow, posted, onUpdate } = setup({ manifest: 3, name: 'Saver', permissions: ['storage'] });
  fromModule(contentWindow, { id: 1, method: 'storage.set', args: { key: 'k', value: 1 } });
  await flush();
  expect(onUpdate).toHaveBeenCalledWith({ moduleData: { k: 1 } });
  expect(posted.find(m => m.id === 1).result).toBe(true);
});

test('callTool waits for the module, presses a declared tool and returns its answer', async () => {
  const { contentWindow, posted, result } = setup({ manifest: 3, name: 'Tip', permissions: ['storage'], tools: [{ name: 'split_bill', description: 'Split it.', input: { bill: 'number' } }] });
  await expect(result.current.callTool('nope')).rejects.toThrow(/no "nope" tool/);
  let answer;
  await act(async () => {
    answer = result.current.callTool('split_bill', { bill: 90 });
    await Promise.resolve();
    fromModule(contentWindow, { method: 'ready', args: { tools: ['split_bill'] } });
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  const sent = posted.find(m => m.type === 'tool');
  expect(sent).toMatchObject({ name: 'split_bill', input: { bill: 90 } });
  await act(async () => { fromModule(contentWindow, { method: 'tool.result', args: { callId: sent.callId, ok: true, result: { each: '$30.00' } } }); });
  await expect(answer).resolves.toEqual({ each: '$30.00' });
});
