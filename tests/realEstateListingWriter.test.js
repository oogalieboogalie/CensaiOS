import { jest } from '@jest/globals';
import { draftListing, normalizeListingInput, parseListingReply } from '../server/realEstate/listingWriter.js';

const LISTING = { address: '14 Alder Way', beds: 3, baths: 2, sqft: 1850, price: '465,000', features: 'New roof, cedar deck.', photos: [{ name: 'kitchen.jpg' }] };

describe('Listing Writer', () => {
  test('turns the form into three pieces plus a fair-housing check, on the agent\'s model', async () => {
    const complete = jest.fn(async () => '```json\n' + JSON.stringify({
      description: 'A bright three-bedroom with a cedar deck. Perfect for a young family.',
      social: 'Just listed: 14 Alder Way.',
      email_subject: 'New listing: 14 Alder Way',
      email_body: 'Three bedrooms, two baths, new roof.',
    }) + '\n```');
    const result = await draftListing({ scope: { userId: 1, workspaceId: 'ws' }, listing: LISTING, complete });
    const [messages] = complete.mock.calls[0];
    expect(messages[0].content).toMatch(/Listing Writer/);
    expect(messages[1].content).toMatch(/Bedrooms: 3/);
    expect(messages[1].content).toMatch(/Photos: kitchen\.jpg/);
    expect(result.draft.emailSubject).toBe('New listing: 14 Alder Way');
    expect(result.check.ok).toBe(false);
    expect(result.check.flags.description[0].term).toBe('Perfect for a young family');
    expect(result.docText).toMatch(/## Description[\s\S]*## Social post[\s\S]*## Email blast[\s\S]*## Fair-housing check/);
    expect(result.docText).toMatch(/Rewrite "Perfect for a young family"/);
  });

  test('keeps a non-JSON reply as the description instead of losing it', () => {
    expect(parseListingReply('Lovely home.')).toEqual({ description: 'Lovely home.', social: '', emailSubject: '', emailBody: '' });
  });

  test('needs an address', () => {
    expect(() => normalizeListingInput({ beds: 3 })).toThrow(/address/);
    expect(normalizeListingInput({ address: '  1  Main ', photos: ['a.jpg', { caption: 'Yard' }] })).toMatchObject({ address: '1 Main', photos: ['a.jpg', 'Yard'] });
  });
});
