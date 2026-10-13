// Agent cursors, server side: while an agent runs, the board's awareness
// carries its cursor (name, colour, the window it is in or reading, the
// answer as it types), published from the server's side of the room. Pins:
// it points at the agent's own window, follows tool calls to the window
// they read, types deltas, types out a non-streamed answer, leaves a moment
// after the run, and does nothing when nobody has the board open.
import { jest } from '@jest/globals';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import {
  agentColor, applyRunEvent, beginAgentPresence, homeWindowFor, windowNamedIn,
  resetAgentPresenceRooms, LINGER_MS, ULTEM_AMBER,
} from '../server/collab/agentPresence.js';

function board() {
  const doc = new Y.Doc();
  const windows = new Y.Map();
  doc.getMap('canvas').set('windows', windows);
  const add = (id, fields) => {
    const win = new Y.Map();
    for (const [k, v] of Object.entries({ id, x: 0, y: 0, w: 300, h: 200, ...fields })) win.set(k, v);
    windows.set(id, win);
  };
  add('notes-1', { kind: 'doc', title: 'Notes' });
  add('agent-atlas', { kind: 'agent', agentId: 'atlas' });
  add('chat-atlas', { kind: 'chat', agentId: 'atlas' });
  doc.awareness = new Awareness(doc);
  doc.awareness.setLocalState(null);
  return doc;
}

const agentsOn = (doc) => doc.awareness.getLocalState()?.agents || [];

afterEach(() => {
  resetAgentPresenceRooms();
  jest.useRealTimers();
});

describe('agent cursor helpers', () => {
  test('the agent works in its chat window, or the window it was started from', () => {
    const doc = board();
    expect(homeWindowFor(doc, { agentId: 'atlas' })).toBe('chat-atlas');
    expect(homeWindowFor(doc, { agentId: 'atlas', windowId: 'notes-1' })).toBe('notes-1');
    expect(homeWindowFor(doc, { agentId: 'nobody' })).toBeNull();
  });

  test('a tool call that names a window points the cursor at it', () => {
    const doc = board();
    expect(windowNamedIn(doc, { query: 'x', target: { windowId: 'notes-1' } })).toBe('notes-1');
    expect(windowNamedIn(doc, { query: 'weather in Paris' })).toBeNull();
  });

  test('agents keep their own hue, amber when they have none', () => {
    expect(agentColor(220)).toBe('oklch(0.74 0.13 220)');
    expect(agentColor(0)).toBe(ULTEM_AMBER);
    expect(agentColor(undefined)).toBe(ULTEM_AMBER);
  });

  test('run events move the cursor through reading, a tool, and typing', () => {
    const doc = board();
    const run = { home: 'chat-atlas', at: 'chat-atlas', phase: 'reading', label: '', tail: '', total: 0 };
    applyRunEvent(run, { type: 'status', status: 'calling_tool', detail: { tool: 'read_module', args: { window_id: 'notes-1' } } }, doc);
    expect(run).toMatchObject({ phase: 'reading', at: 'notes-1', label: 'Reading Notes' });
    applyRunEvent(run, { type: 'status', status: 'calling_tool', detail: { tool: 'use_module', args: { window_id: 'notes-1', tool: 'split' } } }, doc);
    expect(run).toMatchObject({ phase: 'reading', at: 'notes-1', label: 'Working in Notes' });
    applyRunEvent(run, { type: 'status', status: 'calling_tool', detail: { tool: 'mcp__weather__get_forecast', args: { city: 'Austin' } } }, doc);
    expect(run).toMatchObject({ phase: 'tool', at: 'chat-atlas', label: 'Using get forecast' });
    applyRunEvent(run, { type: 'status', status: 'completed_tool', detail: {} }, doc);
    expect(run).toMatchObject({ phase: 'thinking', at: 'chat-atlas' });
    applyRunEvent(run, { type: 'delta', text: 'Hello ' }, doc);
    applyRunEvent(run, { type: 'delta', text: 'there' }, doc);
    expect(run).toMatchObject({ phase: 'typing', tail: 'Hello there', total: 11 });
  });
});

describe('beginAgentPresence', () => {
  test('publishes the cursor on the board awareness and clears it after the run', async () => {
    jest.useFakeTimers();
    const doc = board();
    const close = jest.fn();
    const cursor = await beginAgentPresence({
      workspaceId: 'ws-1', agentId: 'atlas', open: async () => ({ doc, close }),
      describe: async () => ({ name: 'Atlas', hue: 220 }),
    });
    expect(agentsOn(doc)).toEqual([expect.objectContaining({
      agentId: 'atlas', name: 'Atlas', home: 'chat-atlas', at: 'chat-atlas', phase: 'reading',
    })]);

    const forwarded = [];
    const send = cursor.wrap((event) => forwarded.push(event));
    send({ type: 'delta', text: 'Sunny all week.' });
    expect(forwarded).toHaveLength(1);
    jest.advanceTimersByTime(200);
    expect(agentsOn(doc)[0]).toMatchObject({ phase: 'typing', tail: 'Sunny all week.', total: 15 });

    cursor.finish('Sunny all week.');
    expect(agentsOn(doc)[0]).toMatchObject({ phase: 'done' });
    jest.advanceTimersByTime(LINGER_MS + 10);
    await Promise.resolve();
    await Promise.resolve();
    expect(doc.awareness.getLocalState()).toBeNull();
    expect(close).toHaveBeenCalled();
  });

  test('a model that does not stream still gets its answer typed out', async () => {
    const doc = board();
    const cursor = await beginAgentPresence({ workspaceId: 'ws-2', agentId: 'atlas', open: async () => ({ doc, close() {} }) });
    cursor.finish('The answer, all at once.');
    expect(agentsOn(doc)[0]).toMatchObject({ phase: 'done', name: 'Atlas', tail: 'The answer, all at once.', total: 24 });
  });

  test('two agents on one board each get a cursor', async () => {
    const doc = board();
    const open = jest.fn(async () => ({ doc, close() {} }));
    await beginAgentPresence({ workspaceId: 'ws-3', agentId: 'atlas', open });
    await beginAgentPresence({ workspaceId: 'ws-3', agentId: 'atlas', windowId: 'notes-1', open });
    expect(agentsOn(doc).map((a) => a.home).sort()).toEqual(['chat-atlas', 'notes-1']);
    expect(open).toHaveBeenCalledTimes(1);
  });

  test('nothing is published when nobody has the board open or the agent has no window', async () => {
    const quiet = await beginAgentPresence({ workspaceId: 'ws-4', agentId: 'atlas', open: async () => null });
    const send = jest.fn();
    quiet.wrap(send)({ type: 'delta', text: 'x' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(() => quiet.finish('x')).not.toThrow();

    const doc = board();
    await beginAgentPresence({ workspaceId: 'ws-5', agentId: 'stranger', open: async () => ({ doc, close() {} }) });
    expect(doc.awareness.getLocalState()).toBeNull();
  });
});

describe('dwell on a window it read', () => {
  test('the cursor stays on a window it read for a moment, then comes home', async () => {
    jest.useFakeTimers();
    const doc = board();
    const cursor = await beginAgentPresence({ workspaceId: 'ws-6', agentId: 'atlas', open: async () => ({ doc, close() {} }) });
    const send = cursor.wrap(() => {});
    send({ type: 'status', status: 'calling_tool', detail: { tool: 'read_module', args: { window_id: 'notes-1' } } });
    send({ type: 'status', status: 'completed_tool', detail: { tool: 'read_module' } });
    jest.advanceTimersByTime(200);
    expect(agentsOn(doc)[0]).toMatchObject({ at: 'notes-1', phase: 'reading', label: 'Reading Notes' });
    jest.advanceTimersByTime(2000);
    expect(agentsOn(doc)[0]).toMatchObject({ at: 'chat-atlas', phase: 'thinking' });
    send({ type: 'status', status: 'calling_tool', detail: { tool: 'read_module', args: { window_id: 'notes-1' } } });
    send({ type: 'delta', text: 'Typing goes home at once.' });
    jest.advanceTimersByTime(200);
    expect(agentsOn(doc)[0]).toMatchObject({ at: 'chat-atlas', phase: 'typing' });
  });
});
