/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { KrakenPaste, KrakenPreview } from '../src/components/windows/kraken/KrakenSetup.jsx';
import { KrakenRequestCard } from '../src/components/windows/kraken/KrakenArms.jsx';
import { pinLine, progressLine } from '../src/lib/kraken/words.js';

// What the Kraken Request window shows about the pinned project and about an arm that
// could not go out. Made-up project: "Shop" in D:\Repos\shop.

const PIN = { projectId: 'p-shop', name: 'Shop', kind: 'folder', source: 'D:\\Repos\\shop', branch: 'main', commit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' };
const ARM = { n: 1, severity: 'P0', title: 'Checkout crashes', agentId: 'atlas', agent: 'Atlas', kind: 'code', status: 'handed', note: '', result: '', why: '', fix: '' };
const kraken = (over = {}) => ({
  report: '- P0 - Checkout crashes', mode: 'writeup', project: 'Shop', setDraft: jest.fn(), look: jest.fn(), busy: '', open: null,
  preview: { title: 'Review', dropped: 0, pin: PIN, arms: [ARM] }, skipped: new Set(), toggle: jest.fn(), release: jest.fn(), clearPreview: jest.fn(),
  ...over,
});

describe('the Kraken Request window and the pinned project', () => {
  test('the look says which project, where its code is, which branch and commit', () => {
    render(<KrakenPreview kraken={kraken()} />);
    expect(screen.getByTestId('kraken-pin').textContent).toBe(
      'Runs in "Shop": the folder D:\\Repos\\shop, on the branch "main" (at a1b2c3d). It stays this project and branch even if you switch projects before you release.',
    );
  });

  test('a project on GitHub, a branch that is not known, and no project at all each read plainly', () => {
    expect(pinLine({ ...PIN, kind: 'github', source: 'acme/shop' })).toBe('Runs in "Shop": acme/shop on GitHub, on the branch "main" (at a1b2c3d).');
    expect(pinLine({ ...PIN, branch: null, commit: null })).toBe('Runs in "Shop": the folder D:\\Repos\\shop, branch not known.');
    render(<KrakenPreview kraken={kraken({ preview: { title: 'Review', dropped: 0, pin: null, arms: [ARM] } })} />);
    expect(screen.getByTestId('kraken-pin').textContent).toBe('No project is pinned: each family member looks in its own project.');
  });

  test('a look that came back with no pin and a reason shows the reason', () => {
    const pinNote = 'No project called "Gamma" is open to you on this board, so this write-up will go out with no project: each family member looks in its own. To pin one, name it the way Projects does.';
    render(<KrakenPreview kraken={kraken({ preview: { title: 'Review', dropped: 0, pin: null, pinNote, arms: [ARM] } })} />);
    expect(screen.getByTestId('kraken-pin').textContent).toBe(pinNote);
    expect(screen.getByRole('button', { name: /Release the Kraken \(1\)/ }).disabled).toBe(false);
  });

  test('a write-up can name its project too', () => {
    render(<KrakenPaste kraken={kraken({ preview: null })} />);
    expect(screen.getByDisplayValue('Shop')).toBeTruthy();
  });

  test('a blocked arm shows that it is still a fix, why it is not out, and what to try', () => {
    const blocked = {
      ...ARM, status: 'blocked',
      why: 'The project "Shop" is only on GitHub: there is no folder of it on this computer, so a fix could not be tested.',
      fix: 'Open its folder on this computer in Projects, then look again and release.',
    };
    const request = { id: 'r1', title: 'Review', status: 'open', pin: PIN, arms: [blocked, { ...ARM, n: 2, status: 'done' }] };
    const { container } = render(<KrakenRequestCard request={request} onStop={jest.fn()} />);
    const row = container.querySelector('[data-status="blocked"]');
    expect(row.querySelector('.hb-kraken-to').textContent).toBe('Atlas · Fix blocked');
    expect(row.querySelector('[role="status"]').textContent).toBe(`Not handed out yet. ${blocked.why} ${blocked.fix}`);
    expect(container.querySelector('.hb-kraken-pin').textContent).toMatch(/^Runs in "Shop": the folder D:\\Repos\\shop, on the branch "main"/);
    expect(progressLine(request)).toBe('1 of 2 back, 1 blocked');
    expect(screen.getByRole('button', { name: /Stop the Kraken Request/ })).toBeTruthy();
  });

  test('a request from before pins shows as it did', () => {
    const request = { id: 'r0', title: 'An older review', status: 'done', arms: [{ ...ARM, status: 'done', why: undefined, fix: undefined }] };
    const { container } = render(<KrakenRequestCard request={request} onStop={jest.fn()} />);
    expect(container.querySelector('.hb-kraken-pin')).toBeNull();
    expect(container.querySelector('.hb-kraken-to').textContent).toBe('Atlas · Done and checked');
  });

  test('the new styles use only the shared tokens', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/kraken.css'), 'utf8');
    expect(css).toContain('.hb-kraken-arm[data-status="blocked"] { border-left-color: var(--accent); }');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
