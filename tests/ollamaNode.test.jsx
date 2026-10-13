/** @jest-environment jsdom */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { OllamaNodeWindow } from '../src/components/OllamaNodeWindow.jsx';
import { FACTORY_WINDOW_MANIFESTS } from '../src/lib/manifest/factoryWindows.js';

function mockFetch(impl) {
  // This jsdom build has no global fetch, so assign instead of spying.
  global.fetch = jest.fn().mockImplementation(impl);
}

afterEach(() => {
  delete global.fetch;
  jest.restoreAllMocks();
});

const ok = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });

describe('OllamaNodeWindow', () => {
  test('empty-state guard renders when no models are reachable', async () => {
    mockFetch(() => ok({ baseUrl: 'http://localhost:11434/v1', models: [] }));
    render(<OllamaNodeWindow win={{}} />);
    expect(await screen.findByText(/Ollama not reachable/)).toBeInTheDocument();
  });

  test('model picker populates from the models endpoint', async () => {
    mockFetch(() => ok({ baseUrl: 'http://localhost:11434/v1', models: ['llama3', 'mistral'] }));
    render(<OllamaNodeWindow win={{}} />);
    expect(await screen.findByRole('option', { name: 'llama3' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'mistral' })).toBeInTheDocument();
  });

  test('send posts model + messages and renders the reply', async () => {
    const calls = [];
    mockFetch((url, options) => {
      calls.push([url, options]);
      if (url === '/api/ollama/models') return ok({ baseUrl: 'http://localhost:11434/v1', models: ['llama3'] });
      return ok({ text: 'Hello local!' });
    });
    render(<OllamaNodeWindow win={{}} />);
    await screen.findByRole('option', { name: 'llama3' });
    fireEvent.change(screen.getByLabelText('Ollama message'), { target: { value: 'hi there' } });
    fireEvent.click(screen.getByLabelText('Send message'));
    expect(await screen.findByText('Hello local!')).toBeInTheDocument();
    const chat = calls.find(([url]) => url === '/api/ollama/chat');
    expect(JSON.parse(chat[1].body)).toEqual({
      model: 'llama3',
      messages: [{ role: 'user', content: 'hi there' }],
    });
  });

  test('manifest registers the Ollama window', () => {
    const entry = FACTORY_WINDOW_MANIFESTS.find((m) => m.kind === 'ollama');
    expect(entry).toMatchObject({
      componentName: 'OllamaNodeWindow',
      componentPath: 'src/components/OllamaNodeWindow.jsx',
      label: 'Ollama',
    });
    expect(entry.defaultSize).toEqual({ w: 600, h: 700 });
  });
});
