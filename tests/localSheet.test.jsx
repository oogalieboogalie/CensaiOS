/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { SheetsWindow } from '../src/components/SheetsWindow.jsx';
import { pasteGrid, makeSheet } from '../src/components/sheets/sheetModel.js';

function Harness({ initial }) {
  const [win, setWin] = React.useState({ id: 's1', ...initial });
  return <SheetsWindow win={win} onUpdate={(patch) => setWin((w) => ({ ...w, ...patch }))} />;
}

afterEach(cleanup);

describe('Spreadsheet window: board sheet with Research columns', () => {
  test('a Research column searches each row in turn and fills cells with sources', async () => {
    const answers = { Acme: 'Austin, TX', Globex: 'Springfield' };
    global.fetch = jest.fn(async (url, opts) => {
      const { value } = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ value: answers[value], status: 'done', sourceUrl: `https://${value.toLowerCase()}.example/about`, sourceTitle: value }) };
    });
    const sheet = pasteGrid(makeSheet({ rows: 3 }), 'r0', 'c0', 'Acme\nGlobex');
    await act(async () => { render(<Harness initial={{ sheet }} />); });
    fireEvent.click(screen.getByRole('button', { name: /Research column/ }));
    fireEvent.change(screen.getByLabelText('What to find'), { target: { value: 'HQ city' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add column' }));
    expect(await screen.findByText('Austin, TX', {}, { timeout: 4000 })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Springfield')).toBeTruthy(), { timeout: 4000 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toMatch(/^\/api\/research\/fill/);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({ value: 'Acme', prompt: 'HQ city' });
    expect(screen.getByRole('link', { name: 'Source: Acme' }).getAttribute('href')).toBe('https://acme.example/about');
  });

  test('Stop halts the column after the cell in flight', async () => {
    let release;
    global.fetch = jest.fn(() => new Promise((resolve) => { release = () => resolve({ ok: true, json: async () => ({ value: 'One', status: 'done' }) }); }));
    const sheet = pasteGrid(makeSheet({ rows: 3 }), 'r0', 'c0', 'A\nB\nC');
    await act(async () => { render(<Harness initial={{ sheet }} />); });
    fireEvent.click(screen.getByRole('button', { name: /Research column/ }));
    fireEvent.change(screen.getByLabelText('What to find'), { target: { value: 'website' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add column' }));
    expect(await screen.findByText(/Filling .*: 0 of 3/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await act(async () => { release(); });
    await waitFor(() => expect(screen.queryByText(/Filling/)).toBeNull());
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('a Google Sheet can still be connected from the header menu path', async () => {
    await act(async () => { render(<Harness initial={{ sheetMode: 'google' }} />); });
    expect(screen.getByPlaceholderText('Spreadsheet ID...')).toBeTruthy();
  });
});
