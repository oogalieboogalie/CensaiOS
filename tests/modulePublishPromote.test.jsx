/** @jest-environment jsdom */

// eslint-disable-next-line no-unused-vars
import React from 'react';
import { jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
// eslint-disable-next-line no-unused-vars
import { ModuleWindow } from '../src/components/ModuleWindow.jsx';
// eslint-disable-next-line no-unused-vars
import { MarketplaceWindow } from '../src/components/MarketplaceWindow.jsx';
// eslint-disable-next-line no-unused-vars
import { PromotedModuleWindow } from '../src/components/modules/PromotedModuleWindow.jsx';
import { fetchSellerStatus } from '../src/lib/marketplace/moduleListingsApi.js';
import { useWorkspaceStore } from '../src/lib/store.js';
import { webcrypto } from 'crypto';

// jsdom has no SubtleCrypto; the window hashes the module to spot changes since listing.
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const win = {
  id: 'mod-1',
  kind: 'module',
  status: 'ready',
  request: 'a tip calculator for my crew',
  manifest: { name: 'Tip calculator', description: 'Split a bill and tip across a crew.', icon: 'Toolbox', size: { w: 400, h: 500 }, permissions: [] },
  source: '<p id="tip" style="color: var(--ink)">tip</p>',
  versions: [{ source: '<p id="tip" style="color: var(--ink)">tip</p>', manifest: { name: 'Tip calculator' }, note: 'First build' }],
  versionIndex: 0,
};

const passing = {
  suite: 'module-basics', version: 1, passBar: 0.8, score: 9, total: 9, passed: true, ranAt: '2026-10-08T06:00:00Z',
  results: [
    { id: 'has-code', label: 'Has a module to run', passed: true, required: true },
    { id: 'theme', label: 'Follows the board theme', passed: true, required: false },
  ],
};

const listing = {
  id: 'list-1', name: 'Tip calculator', summary: 'Split a bill and tip across a crew.', request: 'a tip calculator for my crew',
  manifest: win.manifest, priceModel: 'free', priceCents: 0, status: 'listed', fingerprint: 'ab'.repeat(32),
  checks: { score: 9, total: 9, ranAt: '2026-10-08T06:00:00Z', suite: 'module-basics', passed: true },
  seller: { id: 1, name: 'Alma', tier: 'trusted' }, installs: 0, verified: true, changed: false,
};

function respond(body, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body });
}

function routes(table) {
  global.fetch = jest.fn((url, opts = {}) => {
    const key = `${opts.method || 'GET'} ${url}`;
    const hit = table[key];
    if (!hit) return respond({ error: `no route ${key}` }, 404);
    return typeof hit === 'function' ? hit(opts) : respond(hit);
  });
}

const owner = { canSell: true, owner: true, tier: 'trusted', tierLabel: 'Trusted', note: 'Platform owner (phase 0)' };

beforeEach(() => { window.localStorage.clear(); });

test('the owner gets Publish and Promote in the module menu; others get neither', async () => {
  routes({ 'GET /api/marketplace/seller': owner });
  await fetchSellerStatus({ fresh: true });
  const first = render(<ModuleWindow win={win} onUpdate={() => {}} workspaceId="w1" />);
  expect(await screen.findByRole('menuitem', { name: 'Publish to marketplace' })).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: 'Promote to built-in window' })).toBeTruthy();
  first.unmount();

  routes({ 'GET /api/marketplace/seller': { canSell: false, owner: false, reason: 'Selling opens to vetted sellers later.' } });
  await fetchSellerStatus({ fresh: true });
  render(<ModuleWindow win={win} onUpdate={() => {}} workspaceId="w1" />);
  await act(async () => {});
  expect(screen.queryByRole('menuitem', { name: 'Publish to marketplace' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Promote to built-in window' })).toBeNull();
});

test('publishing shows the checks first, then lists the module and remembers the listing', async () => {
  const publish = jest.fn(() => respond({ listing }));
  routes({
    'GET /api/marketplace/seller': owner,
    'POST /api/marketplace/modules/check': { checks: passing, refused: null, fingerprint: listing.fingerprint },
    'POST /api/marketplace/modules': publish,
  });
  await fetchSellerStatus({ fresh: true });
  const onUpdate = jest.fn();
  render(<ModuleWindow win={win} onUpdate={onUpdate} workspaceId="w1" />);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Publish to marketplace' }));
  expect(await screen.findByText('9 of 9 passed')).toBeTruthy();
  expect(screen.getByText('You, Trusted tier')).toBeTruthy();
  expect(screen.getByText(/Paid listings open once Stripe is connected/)).toBeTruthy();

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Publish' })); });
  expect(JSON.parse(publish.mock.calls[0][0].body)).toMatchObject({ source: win.source, manifest: win.manifest, summary: 'Split a bill and tip across a crew.', listingId: null });
  expect(onUpdate).toHaveBeenCalledWith({ listingId: 'list-1', listingFingerprint: listing.fingerprint });
  expect(screen.getByText(/Tip calculator is listed/)).toBeTruthy();
  expect(screen.getByText('Verified, signed by Censai')).toBeTruthy();
});

test('a module that fails a required check cannot be published', async () => {
  routes({
    'GET /api/marketplace/seller': owner,
    'POST /api/marketplace/modules/check': {
      refused: null,
      checks: { ...passing, score: 8, passed: false, results: [{ id: 'network-declared', label: 'Asks before it uses the internet', passed: false, required: true, detail: 'It calls the network without the "network" permission.' }] },
    },
  });
  await fetchSellerStatus({ fresh: true });
  render(<ModuleWindow win={win} onUpdate={() => {}} workspaceId="w1" />);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Publish to marketplace' }));
  expect(await screen.findByText(/without the "network" permission/)).toBeTruthy();
  expect(screen.getByText(/Asks before it uses the internet \(required\)/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Publish' }).disabled).toBe(true);
});

test('a listed module edited since shows that it changed', async () => {
  routes({ 'GET /api/marketplace/seller': owner });
  await fetchSellerStatus({ fresh: true });
  render(<ModuleWindow win={{ ...win, listingId: 'list-1', listingFingerprint: 'not-the-current-one' }} onUpdate={() => {}} workspaceId="w1" />);
  expect(await screen.findByText('Changed since listing')).toBeTruthy();
  expect(screen.getByRole('menuitem', { name: 'Update marketplace listing' })).toBeTruthy();
});

test('promoting previews the files, then adds the window to the Add menu', async () => {
  const promote = jest.fn((opts) => {
    const body = JSON.parse(opts.body);
    const files = [
      { path: 'src/components/windows/tipCalculator/meta.js', edit: false },
      { path: 'src/styles/tip-calculator.css', edit: false },
      { path: 'src/index.css', edit: true },
    ];
    return respond(body.dryRun ? { ok: true, dryRun: true, kind: 'tipCalculator', label: body.label, files } : { ok: true, kind: 'tipCalculator', label: body.label, files, syncOk: true });
  });
  routes({ 'GET /api/marketplace/seller': owner, 'POST /api/modules/promote': promote });
  await fetchSellerStatus({ fresh: true });
  render(<ModuleWindow win={win} onUpdate={() => {}} workspaceId="w1" />);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Promote to built-in window' }));
  expect(await screen.findByText('new src/components/windows/tipCalculator/meta.js')).toBeTruthy();
  expect(screen.getByText('edit src/index.css')).toBeTruthy();
  expect(screen.getByLabelText('Window id').getAttribute('placeholder')).toBe('tipCalculator');

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add to the Add menu' })); });
  const write = promote.mock.calls.map(([opts]) => JSON.parse(opts.body)).find(b => !b.dryRun);
  expect(write).toMatchObject({ kind: 'tipCalculator', label: 'Tip calculator', source: win.source });
  expect(screen.getByText(/Tip calculator is now a built-in window/)).toBeTruthy();
  expect(screen.getByText(/Commit these files/)).toBeTruthy();
});

test('promoting where censaiOS cannot write its own folder says so plainly', async () => {
  routes({
    'GET /api/marketplace/seller': owner,
    'POST /api/modules/promote': () => respond({ error: 'Local filesystem access is disabled in cloud_saas mode' }, 403),
  });
  await fetchSellerStatus({ fresh: true });
  render(<ModuleWindow win={win} onUpdate={() => {}} workspaceId="w1" />);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Promote to built-in window' }));
  expect(await screen.findByText(/only be added where censaiOS runs from its own folder/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add to the Add menu' }).disabled).toBe(true);
});

test('the marketplace lists published modules and copies one onto the board', async () => {
  routes({
    'GET /api/marketplace/modules': { listings: [listing, { ...listing, id: 'list-2', name: 'Changed one', verified: false, changed: true }] },
    'POST /api/marketplace/modules/list-1/install': { listing: { ...listing, installs: 1, source: win.source } },
  });
  const spawnAt = jest.fn(() => 'new-win');
  const original = useWorkspaceStore.getState();
  act(() => { useWorkspaceStore.setState({ spawnAt, setActiveId: jest.fn() }); });
  render(<MarketplaceWindow />);
  expect(await screen.findByText('Tip calculator')).toBeTruthy();
  expect(screen.getByText('Verified')).toBeTruthy();
  expect(screen.getByText('Changed since verification')).toBeTruthy();
  expect(screen.getAllByText('Checks 9 of 9, run 2026-10-08')).toHaveLength(2);

  await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Add to board' })[0]); });
  const [kind, props, , size] = spawnAt.mock.calls[0];
  expect(kind).toBe('module');
  expect(props).toMatchObject({ status: 'ready', source: win.source, manifest: win.manifest, fromListing: { id: 'list-1', fingerprint: listing.fingerprint } });
  expect(props.listingId).toBeUndefined();
  expect(size).toEqual({ w: 400, h: 500 });
  await waitFor(() => expect(screen.getByText('1 copy')).toBeTruthy());
  act(() => { useWorkspaceStore.setState(original); });
});

test('a promoted window runs the module from its folder with data on the window', () => {
  const { container } = render(
    <PromotedModuleWindow win={{ id: 'w-9', kind: 'tipCalculator', moduleData: { n: 1 } }} onUpdate={() => {}} workspaceId="w1"
      meta={{ kind: 'tipCalculator', label: 'Tip calculator' }} manifest={win.manifest} source={win.source} className="hb-tip-calculator" />,
  );
  const frame = container.querySelector('iframe[data-module-frame]');
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
  expect(frame.getAttribute('srcdoc')).toContain('<p id="tip"');
  expect(container.querySelector('.hb-tip-calculator[data-module-promoted="tipCalculator"]')).toBeTruthy();
  expect(screen.getByText('Tip calculator')).toBeTruthy();
});
