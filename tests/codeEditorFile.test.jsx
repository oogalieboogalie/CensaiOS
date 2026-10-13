/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { CodeEditorWindow } from '../src/components/CodeEditorWindow.jsx';

describe('CodeEditorWindow file loading', () => {
  test('loads local source file content and saves edits through the local file API', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (url === '/api/files/content?path=C%3A%5CProject%5Csrc%5CApp.jsx' && !options) {
        return { json: async () => ({ content: 'export default function App() {}' }) };
      }
      if (url === '/api/files/content' && options?.method === 'PUT') {
        return { json: async () => ({ ok: true }) };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock;

    render(
      React.createElement(CodeEditorWindow, {
        win: {
          id: 'code-file',
          fileName: 'App.jsx',
          filePath: 'C:\\Project\\src\\App.jsx',
          language: 'jsx',
        },
        onUpdate: jest.fn(),
      })
    );

    const editor = await screen.findByDisplayValue('export default function App() {}');
    fireEvent.change(editor, { target: { value: 'export default function App() { return null; }' } });
    fireEvent.click(screen.getByTitle('Save local file'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/files/content', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          path: 'C:\\Project\\src\\App.jsx',
          content: 'export default function App() { return null; }',
        }),
      }));
    });
  });

  test('loads GitHub source file content without showing local save controls', async () => {
    global.fetch = jest.fn(async (url) => {
      expect(url).toBe('/api/github/file?repo=owner%2Frepo&path=src%2FApp.tsx');
      return { json: async () => ({ content: 'export const App = () => null;' }) };
    });

    render(
      React.createElement(CodeEditorWindow, {
        win: {
          id: 'github-code-file',
          fileName: 'App.tsx',
          filePath: 'src/App.tsx',
          isGithub: true,
          githubRepo: 'owner/repo',
          language: 'tsx',
        },
        onUpdate: jest.fn(),
      })
    );

    expect(await screen.findByDisplayValue('export const App = () => null;')).toBeInTheDocument();
    expect(screen.queryByTitle('Save local file')).not.toBeInTheDocument();
  });
});
