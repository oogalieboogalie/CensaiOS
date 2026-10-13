/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProvenanceExplorerWindow } from '../src/components/ProvenanceExplorerWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

const originalState = useWorkspaceStore.getState();

function jsonResponse(payload = [], ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
}

beforeEach(() => {
  global.fetch = jest.fn().mockImplementation((url) => {
    if (url.includes('/api/operational-intelligence/provenance')) {
      return jsonResponse([
        {
          id: 'prov-1',
          owner_id: 'atlas',
          created_at: new Date().toISOString(),
          title: 'server/index.js',
          data: {
            file_path: 'server/index.js',
            model: 'gpt-4o',
            prompt_preview: 'Write a web server',
            code_snippet: 'console.log("hello");',
          },
        },
        {
          id: 'prov-2',
          owner_id: 'echo',
          created_at: new Date().toISOString(),
          title: 'client/app.js',
          data: {
            file_path: 'client/app.js',
            model: 'claude-3-5-sonnet',
            prompt_preview: 'Write client app',
            code_snippet: 'export default function App() {}',
          },
        },
      ]);
    }
    return jsonResponse([]);
  });

  act(() => {
    useWorkspaceStore.setState({ workspaceId: 'ws-provenance-test' });
  });
});

afterEach(() => {
  cleanup();
  act(() => useWorkspaceStore.setState(originalState));
  delete global.fetch;
});

describe('ProvenanceExplorerWindow', () => {
  test('renders without throwing, showing title and filter input', async () => {
    const onUpdate = jest.fn();
    const win = { id: 'pe1', kind: 'provenance', title: 'Provenance Explorer' };

    await act(async () => {
      render(<ProvenanceExplorerWindow win={win} onUpdate={onUpdate} />);
    });

    expect(screen.getByText('Provenance Explorer')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Filter by file, agent or model')).toBeInTheDocument();
    expect(screen.getByText('server/index.js')).toBeInTheDocument();
    expect(screen.getByText('client/app.js')).toBeInTheDocument();
  });

  test('filters provenance records when typing in the filter input', async () => {
    const onUpdate = jest.fn();
    const win = { id: 'pe1', kind: 'provenance', title: 'Provenance Explorer' };

    await act(async () => {
      render(<ProvenanceExplorerWindow win={win} onUpdate={onUpdate} />);
    });

    const filterInput = screen.getByPlaceholderText('Filter by file, agent or model');

    await act(async () => {
      fireEvent.change(filterInput, { target: { value: 'atlas' } });
    });

    expect(screen.getByText('server/index.js')).toBeInTheDocument();
    expect(screen.queryByText('client/app.js')).not.toBeInTheDocument();
  });
});
