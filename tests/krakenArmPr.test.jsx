/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { KrakenRequestCard } from '../src/components/windows/kraken/KrakenArms.jsx';

// A fix on GitHub shows its branch while it works, then its pull request and how its checks
// stand (server/kraken/arms.js publicArm). Made-up repo: acme/shop.

const ARM = { n: 1, severity: 'P1', title: 'The price is wrong', agentId: 'atlas', agent: 'Atlas', kind: 'code', status: 'handed', note: '', result: '', why: '', fix: '', branch: null, pr: null };
const card = (arm) => {
  const request = { id: 'r1', title: 'Review', status: 'open', pin: null, arms: [{ ...ARM, ...arm }], counts: { handed: 1 } };
  return render(<KrakenRequestCard request={request} onStop={jest.fn()} />);
};

describe('a fix arm in the Kraken window', () => {
  test('while it works: the branch it works on', () => {
    card({ branch: 'agent/atlas-job-11111111-1' });
    expect(screen.getByTestId('kraken-arm-branch').textContent).toBe('Working on the branch agent/atlas-job-11111111-1');
  });

  test('once it is open: a link to the pull request and how its checks stand', () => {
    const pr = { number: 41, url: 'https://github.com/acme/shop/pull/41', branch: 'agent/atlas-job-11111111-1', checks: 'passed', line: '' };
    card({ status: 'done', branch: pr.branch, pr });
    const shown = screen.getByTestId('kraken-arm-pr');
    expect(shown.textContent).toBe('Pull request #41 · checks passed · from agent/atlas-job-11111111-1');
    expect(screen.getByRole('link', { name: 'Pull request #41' }).getAttribute('href')).toBe(pr.url);
    expect(shown.getAttribute('data-checks')).toBe('passed');
  });

  test('no checks ran: said as such, never as passed; failed checks say what is known', () => {
    const base = { number: 41, url: 'https://github.com/acme/shop/pull/41', branch: null };
    const { unmount } = card({ status: 'done', pr: { ...base, checks: 'none', line: '' } });
    expect(screen.getByTestId('kraken-arm-pr').textContent).toBe('Pull request #41 · no checks ran on this pull request');
    unmount();
    card({ status: 'stuck', pr: { ...base, checks: 'failed', line: 'Checks failed on the first try; the second try did not finish.' } });
    expect(screen.getByTestId('kraken-arm-pr').textContent).toBe('Pull request #41 · checks failed Checks failed on the first try; the second try did not finish.');
  });

  test('a note that it may still fail is shown as it is', () => {
    card({ note: 'It may still fail when it tries: whether it can make a branch is not known yet.' });
    expect(screen.getByText(/^It may still fail when it tries/)).toBeTruthy();
  });
});
