import { briefFromTask, huntSummary } from '../src/lib/agentNetwork/leadHoundHelp.js';

describe('LeadHound on the agent network', () => {
  test('a labelled ask becomes a brief', () => {
    expect(briefFromTask('Sell: AI receptionists\nMarket: dental practices with 2 to 6 chairs\nRegion: Austin, TX')).toEqual({
      business: 'AI receptionists', market: 'dental practices with 2 to 6 chairs', region: 'Austin, TX', maxLeads: 3,
    });
  });

  test('a free-form ask fills both sides of the brief', () => {
    const brief = briefFromTask('Find coffee roasters in Denver who might want our POS');
    expect(brief.business).toBe('Find coffee roasters in Denver who might want our POS');
    expect(brief.market).toBe(brief.business);
  });

  test('the answer lists each lead with why and the first touch', () => {
    const text = huntSummary({
      leads: [{
        company: 'Bright Smiles', fitScore: 92, url: 'https://brightsmiles.example', why_fit: 'Phones overflow.',
        contacts: { emails: ['hi@brightsmiles.example'] }, sequence: [{ day: 1, subject: 'A quick idea' }],
      }],
    });
    expect(text).toMatch(/\*\*1\. Bright Smiles\*\* \(fit 92\)/);
    expect(text).toMatch(/Why: Phones overflow\./);
    expect(text).toMatch(/Contact: hi@brightsmiles\.example/);
    expect(text).toMatch(/Day 1: "A quick idea"/);
    expect(huntSummary({ leads: [] })).toMatch(/found no buyer-shaped sites/);
  });
});
