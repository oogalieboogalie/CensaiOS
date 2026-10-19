/**
 * @jest-environment jsdom
 */
/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { jest } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReliabilityWindow } from '../src/components/ReliabilityWindow.jsx';

function jsonResponse(payload = [], ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
}

beforeEach(() => {
  global.fetch = jest.fn().mockImplementation((url) => {
    if (url.includes('/api/reliability/scans')) {
      return jsonResponse([
        {
          id: 'scan-1',
          file_path: 'src/components/App.jsx',
          score: 75,
          created_at: new Date().toISOString(),
          heuristics: {
            monolith: false,
            security_risk: true,
          },
        },
      ]);
    }
    return jsonResponse([]);
  });
});

afterEach(() => {
  cleanup();
  delete global.fetch;
});

describe('ReliabilityWindow', () => {
  test('renders without throwing, showing main dashboard title and scans', async () => {
    const onUpdate = jest.fn();
    const win = { id: 'rel1', kind: 'reliability', title: 'Reliability' };

    await act(async () => {
      render(<ReliabilityWindow win={win} onUpdate={onUpdate} />);
    });

    expect(screen.getByText('AI Code Reliability Dashboard')).toBeInTheDocument();
    expect(screen.getAllByText('src/components/App.jsx').length).toBeGreaterThan(0);
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('Smart Review Queue')).toBeInTheDocument();
  });

  test('clicking refresh triggers fetchScans call', async () => {
    const onUpdate = jest.fn();
    const win = { id: 'rel1', kind: 'reliability', title: 'Reliability' };

    await act(async () => {
      render(<ReliabilityWindow win={win} onUpdate={onUpdate} />);
    });

    const callsBefore = global.fetch.mock.calls.length;
    const refreshBtn = screen.getByRole('button', { name: /refresh/i });

    await act(async () => {
      fireEvent.click(refreshBtn);
    });

    expect(global.fetch.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(global.fetch).toHaveBeenCalledWith('/api/reliability/scans');
  });

  test('Review jumps to and highlights that file\'s scan card', async () => {
    const scrollIntoView = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    await act(async () => {
      render(<ReliabilityWindow />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    });
    expect(scrollIntoView).toHaveBeenCalled();
    const card = screen.getByRole('heading', { name: 'src/components/App.jsx' }).closest('div.p-4');
    expect(card.className).toContain('ring-accent');
  });
});

describe('ReliabilityWindow Run a scan', () => {
  test('runs a scan of the open project, says what it found, and reloads the list', async () => {
    global.fetch = jest.fn().mockImplementation((url, opts) => {
      if (url === '/api/reliability/scans/project') {
        expect(opts.method).toBe('POST');
        return jsonResponse({ project: 'jordan-shop', scanned: 12, findings: 3, capped: false, scans: [] }, true, 201);
      }
      return jsonResponse([]);
    });
    await act(async () => {
      render(<ReliabilityWindow win={{ id: 'rel1', kind: 'reliability' }} onUpdate={jest.fn()} />);
    });
    expect(screen.getByText(/Press Run a scan/)).toBeInTheDocument();
    const listCalls = () => global.fetch.mock.calls.filter(([u]) => u.startsWith('/api/reliability/scans') && !u.endsWith('/project')).length;
    const before = listCalls();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run a scan' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Scanned 12 files in jordan-shop, 3 need review.');
    expect(listCalls()).toBeGreaterThan(before);
  });

  test('says plainly when no project is open', async () => {
    global.fetch = jest.fn().mockImplementation((url) => (url === '/api/reliability/scans/project'
      ? jsonResponse({ error: 'Open a project first, then run a scan.' }, false, 400)
      : jsonResponse([])));
    await act(async () => {
      render(<ReliabilityWindow win={{ id: 'rel1', kind: 'reliability' }} onUpdate={jest.fn()} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run a scan' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Open a project first, then run a scan.');
  });
});
