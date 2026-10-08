/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { TextDecoder, TextEncoder } from 'node:util';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { ChatWindow } from '../src/components/ChatWindow.jsx';
import { ChatBubble } from '../src/components/chat/ChatBubble.jsx';
import { ModelChip } from '../src/components/chat/ModelChip.jsx';
import { getModelCapabilities } from '../src/lib/chat/modelCapabilities.js';
import { useWorkspaceStore } from '../src/lib/store.js';
import { sendToCanvas, branchChat } from '../src/lib/chat/sendToCanvas.js';
import { fileArtifacts, windowForArtifact, isLongReply } from '../src/lib/chat/artifacts.js';
import { agentPersona } from '../src/lib/chat/persona.js';

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

function jsonResponse(body) {
  return { ok: true, status: 200, headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) }, json: async () => body };
}

// An NDJSON body whose lines arrive one read at a time; `gate` holds the
// stream open before the given line index until released.
function ndjsonResponse(events, { gateAt = -1, signal } = {}) {
  const encoder = new TextEncoder();
  let i = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return {
    release: () => release(),
    response: {
      ok: true,
      status: 200,
      headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'application/x-ndjson' : null) },
      body: {
        getReader: () => ({
          read: async () => {
            if (i === gateAt) {
              await Promise.race([gate, new Promise((_, reject) => signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))]);
            }
            if (i >= events.length) return { done: true };
            return { done: false, value: encoder.encode(`${JSON.stringify(events[i++])}\n`) };
          },
        }),
      },
    },
  };
}

function renderChat(win, onUpdate) {
  return render(<ChatWindow win={win} onUpdate={onUpdate} allWins={[]} canvasGroups={[]} currentProject={null} isActive />);
}

afterEach(() => { delete global.fetch; });

describe('spec 3 chat window', () => {
  test('a new chat greets with the agent, a one-line description and three starters', async () => {
    const bodies = [];
    global.fetch = jest.fn(async (url, init) => {
      if (url === '/api/chat') { bodies.push(JSON.parse(init.body)); return jsonResponse({ text: 'Sure.', tools: [] }); }
      return jsonResponse([]);
    });
    let win = { id: 'c-empty', kind: 'chat', agentId: 'atlas', msgs: [] };
    const onUpdate = jest.fn((patch) => { win = { ...win, ...patch }; });
    renderChat(win, onUpdate);

    const empty = screen.getByTestId('chat-empty-state');
    expect(empty).toHaveTextContent('Atlas');
    expect(empty).toHaveTextContent(agentPersona({ id: 'atlas' }).blurb);
    const starters = empty.querySelectorAll('.hb-starter');
    expect(starters).toHaveLength(3);

    await act(async () => { fireEvent.click(starters[0]); });
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].messages.at(-1).text).toBe('Review this API design');
  });

  test('replies stream word by word, show stop while streaming, then settle into one stored message', async () => {
    const stream = ndjsonResponse([
      { type: 'status', status: 'thinking', detail: { round: 1 } },
      { type: 'status', status: 'calling_tool', detail: { tool: 'web_search', summary: { target: 'oklch' } } },
      { type: 'status', status: 'completed_tool', detail: { tool: 'web_search', summary: { target: 'oklch' }, ms: 40, ok: true } },
      { type: 'delta', round: 2, text: 'Hello ' },
      { type: 'delta', round: 2, text: 'world' },
      { type: 'result', text: 'Hello world', tools: [{ tool: 'web_search', ms: 40, ok: true, summary: { target: 'oklch' } }], timings: { total_ms: 1200 } },
    ], { gateAt: 5 });
    global.fetch = jest.fn(async (url) => (url === '/api/chat' ? stream.response : jsonResponse([])));
    let win = { id: 'c-stream', kind: 'chat', agentId: 'censai', msgs: [] };
    const onUpdate = jest.fn((patch) => { win = { ...win, ...patch }; });
    const view = renderChat(win, onUpdate);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'colors?' } });
    await act(async () => { fireEvent.click(screen.getByLabelText('Send message')); });
    view.rerender(<ChatWindow win={win} onUpdate={onUpdate} allWins={[]} canvasGroups={[]} currentProject={null} isActive />);

    expect(await screen.findByText(/Hello world/)).toBeInTheDocument();
    expect(screen.getByLabelText('Stop reply')).toBeInTheDocument();
    expect(screen.getByText('Searched the web “oklch”')).toBeInTheDocument();
    // Streaming text never touches the canvas document.
    expect(onUpdate.mock.calls.filter(([p]) => p.msgs)).toHaveLength(1);

    await act(async () => { stream.release(); });
    await waitFor(() => expect(win.msgs).toHaveLength(2));
    expect(win.msgs[1]).toMatchObject({ from: 'censai', text: 'Hello world' });
    expect(win.msgs[1].activity.tools[0]).toMatchObject({ name: 'web_search', ok: true });
  });

  test('stop keeps what streamed so far and marks the reply stopped', async () => {
    let stream;
    global.fetch = jest.fn(async (url, init) => {
      if (url !== '/api/chat') return jsonResponse([]);
      stream = ndjsonResponse([{ type: 'delta', round: 1, text: 'Partial answer' }], { gateAt: 1, signal: init.signal });
      return stream.response;
    });
    let win = { id: 'c-stop', kind: 'chat', agentId: 'censai', msgs: [] };
    const onUpdate = jest.fn((patch) => { win = { ...win, ...patch }; });
    renderChat(win, onUpdate);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'go' } });
    await act(async () => { fireEvent.click(screen.getByLabelText('Send message')); });
    await screen.findByText(/Partial answer/);
    await act(async () => { fireEvent.click(screen.getByLabelText('Stop reply')); });
    await waitFor(() => expect(win.msgs).toHaveLength(2));
    expect(win.msgs[1]).toMatchObject({ text: 'Partial answer', stopped: true });
  });
});

describe('spec 3 artifacts and canvas', () => {
  test('long replies, long code and remote images become cards and buttons, not walls of text', () => {
    const onSend = jest.fn();
    const longText = Array.from({ length: 45 }, (_, i) => `Line ${i}`).join('\n');
    const { unmount } = render(<ChatBubble message={{ from: 'atlas', text: `# Plan\n${longText}` }} index={1} onSend={onSend} onCopy={jest.fn()} />);
    fireEvent.click(screen.getByText('Open as document'));
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'text', title: 'Plan' }));
    unmount();

    const code = Array.from({ length: 50 }, (_, i) => `x${i} = ${i}`).join('\n');
    render(<ChatBubble message={{ from: 'atlas', text: `\`\`\`py\n${code}\n\`\`\`\n\nShort code:\n\`\`\`js\nlet a = 1;\n\`\`\`\n\n![chart](https://evil.test/pixel.png)` }} index={2} onSend={onSend} onCopy={jest.fn()} />);
    const cards = screen.getAllByTestId('artifact-card');
    expect(cards[0]).toHaveTextContent('py code');
    expect(cards[0]).toHaveTextContent('50 lines');
    fireEvent.click(screen.getAllByText('Open in Code Editor')[0]);
    expect(onSend).toHaveBeenLastCalledWith({ type: 'code', code, lang: 'py' });
    // The short block stays inline with its own button.
    expect(screen.getByText('let a = 1;')).toBeInTheDocument();
    // Remote images wait for a click.
    expect(screen.queryByAltText('chart')).toBeNull();
    fireEvent.click(screen.getByText('Show image from evil.test'));
    expect(screen.getByAltText('chart')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Send to Sketchpad'));
    expect(onSend).toHaveBeenLastCalledWith({ type: 'sketch', src: 'https://evil.test/pixel.png', alt: 'chart' });
  });

  test('files the agent wrote show as artifact cards', () => {
    const activity = { tools: [
      { name: 'local_write_file', ok: true, summary: { path: '/tmp/app/main.py', added: 12 } },
      { name: 'project_write', ok: true, summary: { path: 'src/a.js', added: 3 } },
      { name: 'local_write_file', ok: false, summary: { path: '/tmp/failed.py' } },
      { name: 'web_search', ok: true, summary: { target: 'x' } },
    ] };
    expect(fileArtifacts(activity)).toEqual([
      expect.objectContaining({ path: '/tmp/app/main.py', name: 'main.py', added: 12, openable: true }),
      expect.objectContaining({ path: 'src/a.js', openable: false }),
    ]);
    expect(windowForArtifact(fileArtifacts(activity)[0])).toMatchObject({ kind: 'code_editor', props: { filePath: '/tmp/app/main.py' } });
    expect(windowForArtifact({ type: 'image', src: 'data:image/png;base64,AA' })).toMatchObject({ kind: 'image', props: { src: 'data:image/png;base64,AA' } });
    expect(isLongReply('a\n'.repeat(41))).toBe(true);
    expect(isLongReply('a\n'.repeat(10))).toBe(false);
  });

  test('send to canvas opens the window beside the chat and links them; branch copies the conversation', () => {
    useWorkspaceStore.setState({ wins: [{ id: 'chat-a', kind: 'chat', agentId: 'atlas', x: 100, y: 50, w: 400, h: 500 }], links: [] });
    const docId = sendToCanvas('chat-a', { type: 'text', text: 'Body', title: 'Notes' });
    let state = useWorkspaceStore.getState();
    const doc = state.wins.find(w => w.id === docId);
    expect(doc).toMatchObject({ kind: 'doc', text: 'Body', fileName: 'Notes.md', x: 540, y: 50 });
    expect(state.links).toEqual([expect.objectContaining({ fromId: 'chat-a', toId: docId })]);

    const msgs = [{ from: 'me', text: 'q1' }, { from: 'atlas', text: 'a1' }, { from: 'me', text: 'q2' }];
    const branchId = branchChat(state.wins[0], msgs, 1);
    state = useWorkspaceStore.getState();
    expect(state.wins.find(w => w.id === branchId)).toMatchObject({ kind: 'chat', agentId: 'atlas', msgs: msgs.slice(0, 2) });
    expect(state.links.some(l => l.toId === branchId)).toBe(true);
  });
});

describe('spec 3 composer model chip', () => {
  test('shows only supported capability icons and switches model from its menu', () => {
    const onSelect = jest.fn();
    render(<ModelChip capabilities={getModelCapabilities('ollama', 'llama3.1:8b')} provider="ollama" onSelect={onSelect} />);
    const chip = screen.getByTestId('chat-capabilities');
    expect(chip).toHaveTextContent('llama3.1:8b · text only');
    expect(chip.querySelector('[data-cap]')).toBeNull();
    fireEvent.click(chip);
    expect(screen.getByRole('menu', { name: 'Switch model' })).toBeInTheDocument();
    const gpt = screen.getByRole('menuitemradio', { name: /^gpt-4o$/ });
    expect(gpt.querySelector('[data-cap="image"]')).not.toBeNull();
    fireEvent.click(gpt);
    expect(onSelect).toHaveBeenCalledWith('openai', 'gpt-4o');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
