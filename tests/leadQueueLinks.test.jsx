/** @jest-environment jsdom */
// Lead Queue links come from what an agent saved off the web: only real web
// addresses become links, and a bare "example.com" opens that site, not a
// page inside censaiOS.
import React from 'react';
import { jest } from '@jest/globals';
import { render, screen, cleanup } from '@testing-library/react';
import { LeadsWindow } from '../src/components/LeadsWindow.jsx';
import { useWorkspaceStore } from '../src/lib/store.js';

const lead = {
  id: 'lead-1', name: 'Pat Example', status: 'new', icp_score: 0.7,
  website: 'javascript:alert(document.cookie)', facebook: 'facebook.com/pat.example',
  instagram: 'https://instagram.com/pat.example', linkedin: 'data:text/html,hi',
};

beforeEach(() => {
  useWorkspaceStore.setState({ workspaceId: 'ws-leads-test' });
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ leads: [lead], counts: { new: 1 } }) }));
});
afterEach(cleanup);

test('only http(s) links, bare domains get https', async () => {
  render(<LeadsWindow win={{}} />);
  await screen.findByText('Pat Example');
  const hrefs = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  expect(hrefs.some((h) => /^(javascript|data):/i.test(h || ''))).toBe(false);
  expect(hrefs).toContain('https://facebook.com/pat.example');
  expect(hrefs).toContain('https://instagram.com/pat.example');
});
