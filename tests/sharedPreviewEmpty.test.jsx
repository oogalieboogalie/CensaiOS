/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import { act, cleanup, render, screen } from '@testing-library/react';

const logged = [];
jest.unstable_mockModule('../src/lib/appLog/browserLog.js', () => ({
  logToApp: (level, message, opts) => logged.push({ level, message, where: opts?.where }),
  logFailure: () => {},
}));
const { HtmlPreviewWindow } = await import('../src/components/HtmlPreviewWindow.jsx');
const { useWorkspaceStore } = await import('../src/lib/store.js');

beforeEach(() => useWorkspaceStore.setState({ wins: [] }));
afterEach(() => { cleanup(); logged.length = 0; delete global.fetch; });

test('a Shared Preview with no page says what it shows and how to fill it, not a white box', () => {
  render(<HtmlPreviewWindow win={{ id: 'p1', title: 'Shared Preview' }} onUpdate={jest.fn()} />);
  expect(screen.getByRole('note')).toHaveTextContent('Nothing to show yet');
  expect(screen.getByRole('note')).toHaveTextContent(/HTML file.*code window.*chat/s);
  expect(document.querySelector('iframe')).toBeNull();
  expect(logged).toEqual([]);
});

test('a page shows in the frame with no note', () => {
  render(<HtmlPreviewWindow win={{ id: 'p2', html: '<h1>Pat\'s shop</h1>' }} onUpdate={jest.fn()} />);
  expect(screen.queryByRole('note')).toBeNull();
  expect(document.querySelector('iframe').getAttribute('srcdoc')).toContain("Pat's shop");
});

test('a linked file that cannot load shows why and warns in the app log once', async () => {
  global.fetch = jest.fn(async () => ({ json: async () => ({ error: 'File not found' }) }));
  await act(async () => {
    render(<HtmlPreviewWindow win={{ id: 'p3', filePath: 'site/index.html' }} onUpdate={jest.fn()} />);
  });
  expect(screen.getByText('File not found')).toBeInTheDocument();
  expect(logged).toEqual([{ level: 'warn', message: 'shared preview: could not load site/index.html: File not found', where: 'htmlPreview' }]);
});

test('a linked code window that is gone warns in the app log and keeps the saved copy', () => {
  render(<HtmlPreviewWindow win={{ id: 'p4', sourceWindowId: 'gone', fileName: 'index.html', html: '<p>saved</p>' }} onUpdate={jest.fn()} />);
  expect(screen.getByText(/Linked code window is unavailable/)).toBeInTheDocument();
  expect(logged.map((l) => l.message)).toEqual(['shared preview: the linked code window for index.html is gone, showing the last saved copy']);
});
