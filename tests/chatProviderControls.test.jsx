/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { ChatWindow } from '../src/components/ChatWindow.jsx';
import { ChatInput } from '../src/components/chat/ChatInput.jsx';
import { ChatBubble } from '../src/components/chat/ChatBubble.jsx';
import { getModelCapabilities } from '../src/lib/chat/modelCapabilities.js';
import { messagesForSend, persistableMessage, encodeWav, downmixAndResample } from '../src/lib/chat/attachments.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
  };
}

function renderInput(caps, extra = {}) {
  return render(
    <ChatInput
      draft="" setDraft={jest.fn()} sending={false} send={jest.fn()}
      showAttach={false} setShowAttach={jest.fn()} imageAttachment={null} onUpdate={jest.fn()}
      capabilities={caps} attachments={[]} addFiles={jest.fn()} removeAttachment={jest.fn()}
      recorder={{ recording: false, processing: false, toggle: jest.fn() }}
      autoSpeak={false} setAutoSpeak={jest.fn()}
      {...extra}
    />
  );
}

const originalMediaRecorder = window.MediaRecorder;
const originalMediaDevices = navigator.mediaDevices;

function enableMic() {
  window.MediaRecorder = function MediaRecorder() {};
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: jest.fn() }, configurable: true });
}

afterEach(() => {
  window.MediaRecorder = originalMediaRecorder;
  Object.defineProperty(navigator, 'mediaDevices', { value: originalMediaDevices, configurable: true });
});

describe('chat controls follow the model', () => {
  test('a text-only local model shows only the text-file clip', () => {
    enableMic();
    renderInput(getModelCapabilities('ollama', 'llama3.1:8b'));
    expect(screen.getByLabelText('Attach text file')).toBeInTheDocument();
    expect(screen.queryByLabelText('Attach image')).toBeNull();
    expect(screen.queryByLabelText('Attach video')).toBeNull();
    expect(screen.queryByLabelText(/Dictate|Record voice/)).toBeNull();
    expect(screen.queryByLabelText('Read replies aloud')).toBeNull();
    expect(screen.getByTestId('chat-capabilities')).toHaveTextContent('llama3.1:8b · text only');
  });

  test('OpenAI gpt-4o: images, PDFs, dictation and voice replies, no video', () => {
    enableMic();
    renderInput(getModelCapabilities('openai', 'gpt-4o'));
    expect(screen.getByLabelText('Attach image')).toBeInTheDocument();
    expect(screen.getByLabelText('Attach file (PDF or text)')).toBeInTheDocument();
    expect(screen.getByLabelText('Dictate')).toBeInTheDocument();
    expect(screen.getByLabelText('Read replies aloud')).toBeInTheDocument();
    expect(screen.queryByLabelText('Attach video')).toBeNull();
    expect(screen.getByTestId('chat-file-input').getAttribute('accept')).toContain('application/pdf');
  });

  test('Gemini: every control, and the mic records a clip the model hears', () => {
    enableMic();
    renderInput(getModelCapabilities('google', 'gemini-2.5-flash'));
    for (const label of ['Attach image', 'Attach file (PDF or text)', 'Attach video', 'Record voice message', 'Read replies aloud']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  test('OpenRouter Claude: image and PDF, no voice', () => {
    enableMic();
    renderInput(getModelCapabilities('openrouter', 'anthropic/claude-sonnet-4.5'));
    expect(screen.getByLabelText('Attach image')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Dictate|Record voice/)).toBeNull();
    expect(screen.queryByLabelText('Read replies aloud')).toBeNull();
  });

  test('no mic button when the browser has no recorder', () => {
    window.MediaRecorder = undefined;
    renderInput(getModelCapabilities('openai', 'gpt-4o'));
    expect(screen.queryByLabelText('Dictate')).toBeNull();
  });

  test('warns when a canvas snapshot is attached to a model that cannot see it', () => {
    renderInput(getModelCapabilities('ollama', 'llama3.1:8b'), { imageAttachment: 'data:image/png;base64,AAAA' });
    expect(screen.getByRole('alert')).toHaveTextContent("llama3.1:8b can't read images");
  });

  test('agent replies get a read-aloud button only when wired', () => {
    const onSpeak = jest.fn();
    const { rerender } = render(<ChatBubble message={{ from: 'agent', text: 'hello' }} index={3} copied={false} onCopy={jest.fn()} />);
    expect(screen.queryByLabelText('Read aloud')).toBeNull();
    rerender(<ChatBubble message={{ from: 'agent', text: 'hello' }} index={3} copied={false} onCopy={jest.fn()} onSpeak={onSpeak} />);
    fireEvent.click(screen.getByLabelText('Read aloud'));
    expect(onSpeak).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello' }), 3);
  });

  test('sent attachments render in the user bubble', () => {
    render(<ChatBubble message={{ from: 'me', text: 'see', attachments: [
      { kind: 'image', name: 'a.png', dataUrl: 'data:image/png;base64,AAAA' },
      { kind: 'file', name: 'spec.pdf', size: 2048 },
    ] }} index={0} copied={false} onCopy={jest.fn()} />);
    expect(screen.getByAltText('a.png')).toBeInTheDocument();
    expect(screen.getByText('spec.pdf')).toBeInTheDocument();
  });
});

describe('ChatWindow end to end with a mocked provider', () => {
  test('picks an image, sends it to /api/chat, and stores the turn', async () => {
    const chatBodies = [];
    global.fetch = jest.fn(async (url, init) => {
      if (String(url).startsWith('/api/chat/capabilities')) {
        return jsonResponse({ provider: 'openai', model: 'gpt-4o', capabilities: getModelCapabilities('openai', 'gpt-4o') });
      }
      if (url === '/api/chat') {
        chatBodies.push(JSON.parse(init.body));
        return jsonResponse({ text: 'A red square.', timings: { total_ms: 5 }, tools: [] });
      }
      return jsonResponse([]);
    });

    let win = { id: 'chat-mm', kind: 'chat', agentId: 'genesis', msgs: [] };
    const onUpdate = jest.fn((patch) => { win = { ...win, ...patch }; });
    const view = render(<ChatWindow win={win} onUpdate={onUpdate} allWins={[]} canvasGroups={[]} currentProject={null} isActive />);

    expect(await screen.findByLabelText('Attach image')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('chat-capabilities')).toHaveTextContent('gpt-4o'));

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'square.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(screen.getByTestId('chat-image-input'), { target: { files: [file] } });
    });
    expect(await screen.findByText('square.png')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'what is this?' } });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Send message'));
    });

    await waitFor(() => expect(chatBodies).toHaveLength(1));
    const sentUser = chatBodies[0].messages.at(-1);
    expect(sentUser.text).toBe('what is this?');
    expect(sentUser.attachments).toEqual([
      expect.objectContaining({ kind: 'image', name: 'square.png', mime: 'image/png', dataUrl: 'data:image/png;base64,iVBORw==' }),
    ]);

    await waitFor(() => expect(win.msgs).toHaveLength(2));
    expect(win.msgs[1].text).toBe('A red square.');
    view.rerender(<ChatWindow win={win} onUpdate={onUpdate} allWins={[]} canvasGroups={[]} currentProject={null} isActive />);
    expect(screen.queryByTestId('chat-attachment-chip')).toBeNull();
  });

  test('refuses a file the model cannot read before it is sent', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).startsWith('/api/chat/capabilities')) {
        return jsonResponse({ provider: 'ollama', model: 'llama3.1:8b', capabilities: getModelCapabilities('ollama', 'llama3.1:8b') });
      }
      return jsonResponse([]);
    });
    render(<ChatWindow win={{ id: 'c2', agentId: 'genesis', msgs: [] }} onUpdate={jest.fn()} allWins={[]} canvasGroups={[]} currentProject={null} isActive />);
    await waitFor(() => expect(screen.getByTestId('chat-capabilities')).toHaveTextContent('llama3.1:8b'));
    const pdf = new File(['%PDF'], 'spec.pdf', { type: 'application/pdf' });
    await act(async () => {
      fireEvent.change(screen.getByTestId('chat-file-input'), { target: { files: [pdf] } });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent("llama3.1:8b can't read PDFs.");
    expect(screen.queryByTestId('chat-attachment-chip')).toBeNull();
  });
});

describe('attachment budgeting', () => {
  test('newest attachments keep their data; old ones past the budget become stubs', () => {
    const big = `data:image/png;base64,${'A'.repeat(4000)}`;
    const out = messagesForSend([
      { from: 'me', text: 'old', attachments: [{ kind: 'image', name: 'old.png', dataUrl: big }] },
      { from: 'me', text: 'new', attachments: [{ kind: 'image', name: 'new.png', dataUrl: big }] },
    ], 3500);
    expect(out[1].attachments[0].dataUrl).toBe(big);
    expect(out[0].attachments[0]).toEqual({ kind: 'image', name: 'old.png' });
  });

  test('stored messages drop audio/video/file data but keep small images', () => {
    const stored = persistableMessage({ from: 'me', attachments: [
      { kind: 'image', name: 'a.png', dataUrl: 'data:image/png;base64,AAAA', size: 3 },
      { kind: 'video', name: 'v.mp4', dataUrl: 'data:video/mp4;base64,AAAA', size: 3 },
      { kind: 'file', name: 'r.pdf', dataUrl: 'data:application/pdf;base64,AAAA', size: 3 },
    ] });
    expect(stored.attachments.map((a) => Boolean(a.dataUrl))).toEqual([true, false, false]);
    expect(stored.attachments[1]).toEqual({ kind: 'video', name: 'v.mp4', size: 3 });
  });

  test('voice clips are encoded as 16 kHz mono WAV', () => {
    const left = new Float32Array(4800).fill(0.5);
    const right = new Float32Array(4800).fill(-0.5);
    const mono = downmixAndResample([left, right], 48000, 16000);
    expect(mono).toHaveLength(1600);
    expect(mono[10]).toBeCloseTo(0);
    const wav = encodeWav([mono], 16000);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(16000);
    expect(wav.length).toBe(44 + 1600 * 2);
  });
});
