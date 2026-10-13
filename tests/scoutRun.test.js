import {
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
