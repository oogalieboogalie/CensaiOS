import { jest } from '@jest/globals';
import {
  applyScores,
  dedupeCandidates,
  normalizeBrief,
  normalizeOutreach,
  runLeadHound,
} from '../server/leadhound/pipeline.js';
import { parseJsonBlock } from '../server/leadhound/prompts.js';

const BRIEF = { business: 'AI receptionists for dental clinics', market: 'independent dental practices', region: 'Austin, TX', maxLeads: 2 };

const SEARCH_RESULTS = [
  { title: 'Bright Smiles Dental | Austin', url: 'https://www.brightsmiles.example/', content: 'Family dentistry, call to book. Front desk overwhelmed.', score: 0.9 },
  { title: 'Lakeline Dental Care', url: 'https://lakelinedental.example/about', content: 'Two locations, online booking coming soon.', score: 0.8 },
  { title: 'Top 10 dentists in Austin', url: 'https://www.yelp.com/search?dentist', content: 'directory', score: 0.7 },
  { title: 'Dentist jobs', url: 'https://www.indeed.com/q-dentist', content: 'jobs', score: 0.6 },
  { title: 'Hill Country Family Dental', url: 'https://hillcountrydental.example/', content: 'New patients welcome.', score: 0.5 },
];

function sevenDays(company) {
  return Array.from({ length: 7 }, (_, i) => ({ day: i + 1, channel: i % 2 ? 'linkedin' : 'email', subject: `Touch ${i + 1}`, body: `Hi ${company} team, note ${i + 1}.` }));
}

function fakeComplete() {
  return jest.fn(async (messages) => {
    const system = messages[0].content;
    if (system.includes('3 web search queries')) {
      return JSON.stringify({ queries: ['dental practice Austin', 'family dentist Austin TX', 'dental clinic Austin booking'], ideal_profile: 'Busy 2–6 chair practices' });
    }
    if (system.includes('qualify sales leads')) {
      return '```json\n' + JSON.stringify({ leads: [
        { index: 0, company: 'Bright Smiles Dental', fit_score: 92, why_fit: 'Front desk is overwhelmed.', pain_points: ['missed calls'], decision_maker: 'Practice manager', angle: 'Missed after-hours calls' },
        { index: 1, company: 'Lakeline Dental Care', fit_score: 81, why_fit: 'Two locations.', pain_points: ['booking'], decision_maker: 'Owner dentist', angle: 'Booking across locations' },
        { index: 2, company: 'Hill Country Family Dental', fit_score: 40 },
      ] }) + '\n```';
    }
    const company = /Company: (.*)/.exec(messages[1].content)[1];
    return JSON.stringify({
      sequence: sevenDays(company),
      ice_breaker: { title: `3 missed-call fixes for ${company}`, format: '1-page audit', opening_line: 'Noticed your phones.', deliverable: '## Fix 1\nAnswer after hours.', cta: '15 minutes Thursday?' },
    });
  });
}

function fakeTavily() {
  return {
    search: jest.fn(async () => SEARCH_RESULTS),
    extract: jest.fn(async (url) => (url.includes('brightsmiles')
      ? 'Email hello@brightsmiles.example or call (512) 555-0134. https://www.linkedin.com/company/bright-smiles'
      : 'No contact here')),
  };
}

describe('LeadHound pipeline', () => {
  test('finds, scores, enriches, and drafts a 7-day sequence + ice breaker for the top leads', async () => {
    const tavily = fakeTavily();
    const complete = fakeComplete();
    const steps = [];
    const out = await runLeadHound(BRIEF, { tavily, complete, onStep: (s) => steps.push(s) });

    expect(steps).toEqual(['plan', 'search', 'score', 'enrich', 'draft']);
    expect(tavily.search).toHaveBeenCalledTimes(3);
    expect(out.queries).toEqual(['dental practice Austin', 'family dentist Austin TX', 'dental clinic Austin booking']);
    expect(out.candidates.map((c) => c.host)).toEqual(['brightsmiles.example', 'lakelinedental.example', 'hillcountrydental.example']);

    expect(out.leads).toHaveLength(2);
    const [top, second] = out.leads;
    expect(top.company).toBe('Bright Smiles Dental');
    expect(top.fitScore).toBe(92);
    expect(top.contacts.emails).toEqual(['hello@brightsmiles.example']);
    expect(top.contacts.phones).toEqual(['(512) 555-0134']);
    expect(top.contacts.linkedin).toContain('linkedin.com/company/bright-smiles');
    expect(top.sequence.map((t) => t.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(top.sequence[0].body).toContain('Bright Smiles Dental');
    expect(top.iceBreaker.title).toBe('3 missed-call fixes for Bright Smiles Dental');
    expect(second.company).toBe('Lakeline Dental Care');
    expect(tavily.extract).toHaveBeenCalledTimes(2);
    expect(out.usage).toEqual({ searches: 3, extracts: 2, llmCalls: 4 });
    expect(out.warnings).toEqual([]);
  });

  test('falls back to deterministic queries and search scores when the AI step fails', async () => {
    const tavily = fakeTavily();
    const complete = jest.fn(async () => { throw new Error('model offline'); });
    const out = await runLeadHound({ ...BRIEF, maxLeads: 1 }, { tavily, complete });

    expect(out.queries[0]).toBe('independent dental practices Austin, TX');
    expect(out.leads).toHaveLength(1);
    expect(out.leads[0].scoredBy).toBe('search');
    expect(out.leads[0].sequence).toEqual([]);
    expect(out.leads[0].iceBreaker).toBeNull();
    expect(out.warnings.some((w) => w.includes('model offline'))).toBe(true);
  });

  test('returns an empty shortlist when search finds nothing buyer-shaped', async () => {
    const tavily = { search: jest.fn(async () => [{ url: 'https://www.linkedin.com/in/someone', title: 'x' }]), extract: jest.fn() };
    const out = await runLeadHound(BRIEF, { tavily, complete: fakeComplete() });
    expect(out.leads).toEqual([]);
    expect(tavily.extract).not.toHaveBeenCalled();
  });

  test('a page that cannot be read becomes a warning, not a failed hunt', async () => {
    const tavily = fakeTavily();
    tavily.extract.mockRejectedValueOnce(new Error('Tavily extract failed (500)'));
    const out = await runLeadHound(BRIEF, { tavily, complete: fakeComplete() });
    expect(out.leads[0].contacts.emails).toEqual([]);
    expect(out.warnings[0]).toMatch(/Could not read brightsmiles\.example/);
  });
});

describe('LeadHound helpers', () => {
  test('normalizeBrief requires business and market and clamps maxLeads', () => {
    expect(() => normalizeBrief({ business: 'x' })).toThrow(/what you sell/);
    expect(normalizeBrief({ business: 'a', market: 'b', maxLeads: 99 }).maxLeads).toBe(5);
    expect(normalizeBrief({ business: 'a', market: 'b' }).maxLeads).toBe(3);
  });

  test('dedupeCandidates keeps one result per host and drops directories and socials', () => {
    const out = dedupeCandidates([[...SEARCH_RESULTS], [SEARCH_RESULTS[0]]]);
    expect(out.map((c) => c.host)).toEqual(['brightsmiles.example', 'lakelinedental.example', 'hillcountrydental.example']);
  });

  test('applyScores clamps scores and ignores out-of-range indexes', () => {
    const cands = dedupeCandidates([SEARCH_RESULTS]);
    const scored = applyScores(cands, { leads: [{ index: 2, fit_score: 400 }, { index: 9, fit_score: 50 }] });
    expect(scored[0].host).toBe('hillcountrydental.example');
    expect(scored[0].fitScore).toBe(100);
  });

  test('normalizeOutreach orders days and caps the sequence at seven', () => {
    const rows = [...sevenDays('A'), { day: 8, body: 'extra' }].reverse();
    const { sequence } = normalizeOutreach({ sequence: rows });
    expect(sequence.map((t) => t.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test('parseJsonBlock reads fenced, bare and wrapped JSON and rejects garbage', () => {
    expect(parseJsonBlock('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonBlock('Sure! {"a":2} hope that helps')).toEqual({ a: 2 });
    expect(parseJsonBlock('nope')).toBeNull();
  });
});
