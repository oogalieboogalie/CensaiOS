// Two Market slips the test team found (item 144): a listing said "Asks for
// the internet and the internet" for a module that never goes online, and an
// older module read "Changed since listing" the moment it was published.
import { mayDo } from '../src/components/marketplace/ModuleListings.jsx';
import { browserListingChanged, moduleCard, canonicalJson } from '../src/lib/marketplace/moduleCard.js';
import { normalizeManifest } from '../src/lib/modules/moduleFormat.js';
import { createHash } from 'node:crypto';

const sha = (text) => createHash('sha256').update(text).digest('hex');
const SOURCE = '<p style="color: var(--ink)">Made-up seed counter</p>';
const OLD_LABEL = { name: 'Made-up Seed Counter', description: 'Counts made-up seeds with one button', icon: 'Toolbox', permissions: [] };

describe('mayDo', () => {
  test('a module that only saves its data does not claim the internet', () => {
    const words = mayDo(normalizeManifest(OLD_LABEL));
    expect(words).toBe('May save its data on the board and see who is on the board');
    expect(words).not.toMatch(/internet/);
  });

  test('agents and the internet read as themselves; nothing asked reads as nothing', () => {
    expect(mayDo({ manifest: 3, permissions: ['agent', 'network'], network: ['api.example.com'] }))
      .toBe('May ask your agents (uses your model key) and reach api.example.com');
    expect(mayDo({ manifest: 3, permissions: [] })).toBe('');
  });
});

describe('browserListingChanged', () => {
  const signedAsPublished = sha(canonicalJson(moduleCard({ manifest: normalizeManifest(OLD_LABEL), source: SOURCE })));

  test('an older module just published reads as unchanged', async () => {
    expect(await browserListingChanged({ manifest: OLD_LABEL, source: SOURCE, listingFingerprint: signedAsPublished })).toBe(false);
  });

  test('an edit after publishing reads as changed', async () => {
    expect(await browserListingChanged({ manifest: OLD_LABEL, source: `${SOURCE}<p>more</p>`, listingFingerprint: signedAsPublished })).toBe(true);
  });

  test('a listing signed on the label as built (before v3) still matches', async () => {
    const signedAsIs = sha(canonicalJson(moduleCard({ manifest: OLD_LABEL, source: SOURCE })));
    expect(await browserListingChanged({ manifest: OLD_LABEL, source: SOURCE, listingFingerprint: signedAsIs })).toBe(false);
  });

  test('not listed: nothing to compare', async () => {
    expect(await browserListingChanged({ manifest: OLD_LABEL, source: SOURCE })).toBeNull();
  });
});
