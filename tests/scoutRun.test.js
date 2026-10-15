import { jest } from '@jest/globals';
import {
  buildScoutQueries,
  scoutArea,
  extractEmails,
  extractPhones,
  extractSocials,
  pickTeamPages,
} from '../server/scout/run.js';

describe('scout contact extraction', () => {
  test('finds emails while skipping junk senders', () => {
    expect(extractEmails('Contact jordan@example-realty.com or noreply@example.com for details'))
      .toEqual(['jordan@example-realty.com']);
  });

  test('finds dashed and parenthesized phones, skips bare digit runs', () => {
    expect(extractPhones('Call (555) 014-2288 or 555-014-3399. Ref 61562958837046122.'))
      .toEqual(['(555) 014-2288', '555-014-3399']);
  });

  test('finds social profiles, skips recovery/people stubs', () => {
    expect(extractSocials([
      'https://www.facebook.com/example-realty',
      'https://www.facebook.com/recover/',
      'https://www.instagram.com/example.realty',
      'https://www.linkedin.com/company/example-realty',
    ].join('\n'))).toEqual({
      facebook: 'https://www.facebook.com/example-realty',
      instagram: 'https://www.instagram.com/example.realty',
      linkedin: 'https://www.linkedin.com/company/example-realty',
    });
  });

  test('prefers team pages over aggregators', () => {
    const results = [
      { url: 'https://www.zillow.com/pros/', title: 'Zillow' },
      { url: 'https://www.example-realty.com', title: 'Example' },
      { url: 'https://www.realtor.com/x', title: 'Realtor' },
      { url: 'https://www.example-homes.net/open-houses.php', title: 'Example Homes' },
    ];
    expect(pickTeamPages(results, 2).map((r) => r.url)).toEqual([
      'https://www.example-realty.com',
      'https://www.example-homes.net/open-houses.php',
    ]);
  });
});

describe('scout pass', () => {
  function fakeClient() {
    return {
      searchFull: jest.fn(async () => ({ results: [
        { url: 'https://www.yelp.com/biz/x', title: 'Yelp' },
        { url: 'https://smile-dental.example', title: 'Smile Dental | Home' },
      ] })),
      extract: jest.fn(async () => 'Call 555-014-2288 or hello@smile-dental.example'),
    };
  }

  test('searches for the user\'s own target, not realtors', () => {
    const q = buildScoutQueries({ area: 'Austin, TX', target: 'dental offices', business: 'Payroll software' });
    expect(q.search).toBe('dental offices Austin, TX');
    expect(q.search).not.toMatch(/realtor|open house/i);
    expect(q.extract).toContain('Payroll software');
  });

  test('uses the user\'s saved key first and saves leads for their target', async () => {
    const client = fakeClient();
    const makeClient = jest.fn(() => client);
    const resolveKey = jest.fn(async () => ({ apiKey: 'tvly-user', source: 'byok' }));
    const save = jest.fn(async () => ({ id: 1, deduped: false }));
    const run = await scoutArea({
      area: 'Austin, TX', target: 'dental offices', business: 'Payroll software',
      scope: { userId: 7, workspaceId: 'ws' }, topK: 3, resolveKey, makeClient, save,
    });
    expect(resolveKey).toHaveBeenCalledWith(7);
    expect(makeClient.mock.calls[0][0]).toBe('tvly-user');
    expect(client.searchFull.mock.calls[0][0]).toBe('dental offices Austin, TX');
    expect(run.actionsUsed).toBe(2);
    expect(save.mock.calls[0][0]).toMatchObject({ name: 'Smile Dental', email: 'hello@smile-dental.example', buying_signals: [] });
  });

  test('asks who you sell to before spending any Tavily credits', async () => {
    const resolveKey = jest.fn();
    await expect(scoutArea({ area: 'Austin, TX', target: '  ', scope: {}, resolveKey }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(resolveKey).not.toHaveBeenCalled();
  });

  test('no key anywhere gives the plain add-a-key error', async () => {
    await expect(scoutArea({
      area: 'Austin, TX', target: 'cafes', scope: { userId: 1 },
      resolveKey: async () => ({ apiKey: '', source: null }),
    })).rejects.toMatchObject({ statusCode: 424, code: 'TAVILY_KEY_REQUIRED' });
  });
});
