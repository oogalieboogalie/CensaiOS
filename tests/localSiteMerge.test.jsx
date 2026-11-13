/**
 * @jest-environment jsdom
 */
import React from 'react';
import * as Y from 'yjs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readDocState, writeStateToDoc } from '../src/lib/collaboration/yCanvasSync.js';
import { SiteForm } from '../src/components/windows/localSites/SiteForm.jsx';
import { sitePreset, startSite } from '../src/lib/localSites/presets.js';

// The Local Sites form merges box by box and letter by letter: Pat and Sam
// filling in one shop's website at the same moment both keep what they typed
// (before, the whole form was saved as one piece, so the last one to type
// replaced the other's). All words are made up.
const LOCAL = 'local';
const SITE = { ...startSite('bakery'), name: 'Sam Example Bakery', about: 'We bake bread every morning', phone: '555-0100' };
const board = (site) => ({ wins: [{ id: 's1', kind: 'localSites', x: 0, y: 0, w: 1080, h: 700, site }] });

function startBoth() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'remote');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'remote');
  };
  const base = board(SITE);
  writeStateToDoc(a, null, base, LOCAL);
  sync();
  return { a, b, sync, base };
}

const siteOf = (doc, base) => readDocState(doc, base).wins[0].site;

afterEach(cleanup);

test('Pat types the About while Sam fixes the phone: both changes stay', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ ...SITE, about: `${SITE.about} and on Sundays` }), LOCAL);
  writeStateToDoc(b, base, board({ ...SITE, phone: '555-0199' }), LOCAL);
  sync();
  for (const doc of [a, b]) {
    const site = siteOf(doc, base);
    expect([site.about, site.phone, site.name]).toEqual([`${SITE.about} and on Sundays`, '555-0199', SITE.name]);
  }
});

test('Pat and Sam typing in the same box keep both their words', () => {
  const { a, b, sync, base } = startBoth();
  writeStateToDoc(a, base, board({ ...SITE, about: `Fresh: ${SITE.about}` }), LOCAL);
  writeStateToDoc(b, base, board({ ...SITE, about: `${SITE.about} since 1999` }), LOCAL);
  sync();
  for (const doc of [a, b]) expect(siteOf(doc, base).about).toBe(`Fresh: ${SITE.about} since 1999`);
});

test('changing the kind of shop still swaps the whole form', () => {
  const { a, b, sync, base } = startBoth();
  const fresh = { ...startSite('tattoo'), phone: SITE.phone };
  writeStateToDoc(a, base, board(fresh), LOCAL);
  sync();
  for (const doc of [a, b]) expect(siteOf(doc, base)).toEqual(fresh);
});

function lsFor(site, changes = []) {
  return {
    site,
    preset: sitePreset(site.preset),
    set: (key, value) => changes.push({ [key]: value }),
    setHour: (i, value) => changes.push({ hour: [i, value] }),
    previewPhotos: [],
    uploads: {},
    pickPhoto: () => {},
    clearPhoto: () => {},
  };
}

test('typing in a box hands the change to the window right away', () => {
  const changes = [];
  render(<SiteForm ls={lsFor(SITE, changes)} />);
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '555-0142' } });
  fireEvent.change(screen.getByLabelText('About'), { target: { value: 'Pies too' } });
  expect(changes).toEqual([{ phone: '555-0142' }, { about: 'Pies too' }]);
});

test("a teammate's words show in your box, and your cursor stays put", () => {
  const view = render(<SiteForm ls={lsFor(SITE)} />);
  const box = screen.getByLabelText('About');
  box.focus();
  const at = SITE.about.indexOf('bread') + 5;
  box.setSelectionRange(at, at);
  view.rerender(<SiteForm ls={lsFor({ ...SITE, about: `Pat: ${SITE.about}` })} />);
  expect(box.value).toBe(`Pat: ${SITE.about}`);
  expect(box.value.slice(0, box.selectionStart)).toMatch(/bread$/);
});
