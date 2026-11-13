/**
 * @jest-environment jsdom
 */
import React from 'react';
import { jest } from '@jest/globals';
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { useFramePage } from '../src/lib/useFramePage.js';
import { LocalSitesWindow } from '../src/components/windows/localSites/index.jsx';

// A frame whose page is swapped while the page before it is still loading can
// keep the older page (backlog 208: Sam's Local Sites preview kept the
// bakery's own page after Pat's made-up shop name reached Sam's form). The
// frame gets one page at a time.

afterEach(() => jest.useRealTimers());

test('the next page waits for the frame to load the one before it, and the newest wins', () => {
  const { result, rerender } = renderHook(({ html }) => useFramePage(html), { initialProps: { html: 'preset' } });
  expect(result.current[0]).toBe('preset');
  rerender({ html: 'Made-up Bakery' });
  expect(result.current[0]).toBe('preset'); // the first page is still loading
  act(() => result.current[1]());
  expect(result.current[0]).toBe('Made-up Bakery');
  rerender({ html: 'Made-up Bakery 1' });
  rerender({ html: 'Made-up Bakery 12' });
  act(() => result.current[1]());
  expect(result.current[0]).toBe('Made-up Bakery 12'); // straight to the newest
  act(() => result.current[1]());
  rerender({ html: 'Made-up Bakery 123' });
  expect(result.current[0]).toBe('Made-up Bakery 123'); // a loaded frame takes the next page at once
});

test('a page that never says it loaded lets the next one in after a few seconds', () => {
  jest.useFakeTimers();
  const { result, rerender } = renderHook(({ html }) => useFramePage(html), { initialProps: { html: 'preset' } });
  rerender({ html: 'Made-up Bakery' });
  act(() => { jest.advanceTimersByTime(3900); });
  expect(result.current[0]).toBe('preset');
  act(() => { jest.advanceTimersByTime(200); });
  expect(result.current[0]).toBe('Made-up Bakery');
});

test('Local Sites gives its preview frame the newest page once the frame has loaded', () => {
  const win = { id: 'w1', kind: 'localSites', site: { preset: 'bakery' } };
  const { container, rerender } = render(<LocalSitesWindow win={win} onUpdate={() => {}} />);
  const frame = container.querySelector('iframe[title="Website preview"]');
  expect(frame.getAttribute('srcdoc')).toContain('Morning Crumb Bakery');
  rerender(<LocalSitesWindow win={{ ...win, site: { preset: 'bakery', name: 'Made-up Bakery 7' } }} onUpdate={() => {}} />);
  fireEvent.load(frame);
  expect(frame.getAttribute('srcdoc')).toContain('Made-up Bakery 7');
  expect(frame.getAttribute('srcdoc')).not.toContain('Morning Crumb Bakery');
});
