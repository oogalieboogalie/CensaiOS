import { jest } from '@jest/globals';
import { buildOutreachPrompt, draftOutreach, parseDraftResponse } from '../server/scout/draft.js';

describe('outreach drafting', () => {
  const lead = {
    name: 'Jordan Blake', team: null, brokerage: 'Jordan Blake Real Estate',
    city: 'Riverton, IA', buying_signals: ['open houses', 'hiring'],
  };

  test('prompt names the human, the signals, and the user\'s own business', () => {
    const prompt = buildOutreachPrompt(lead, { business: 'Drone photography for listings', target: 'real estate teams' });
    expect(prompt).toContain('Jordan Blake');
    expect(prompt).toContain('Riverton, IA');
    expect(prompt).toContain('open houses');
    expect(prompt).toContain('Drone photography for listings');
    expect(prompt).toContain('real estate teams');
    expect(prompt).toContain('JSON only');
  });

  test('prompt never pitches a built-in product', () => {
    const prompt = buildOutreachPrompt({ name: 'Smile Dental' }, { business: 'Payroll software', target: 'dental offices' });
    expect(prompt).not.toMatch(/Censai|handwritten|CRM|realtor|14-day pilot/i);
  });

  test('drafting without a business asks for it and calls no model', async () => {
    const requestCompletion = jest.fn();
    await expect(draftOutreach(lead, { requestCompletion })).rejects.toMatchObject({ statusCode: 400 });
    expect(requestCompletion).not.toHaveBeenCalled();
  });

  test('prompt degrades gracefully with thin leads', () => {
    const prompt = buildOutreachPrompt({ name: 'Example Realty' }, { business: 'Signs' });
    expect(prompt).toContain('Example Realty');
    expect(prompt).not.toContain('null');
    expect(prompt).not.toContain('undefined');
  });

  test('parses clean, fenced, and fallback responses', () => {
    expect(parseDraftResponse('{"subject":"Hi","body":"Hello"}'))
      .toEqual({ subject: 'Hi', body: 'Hello' });
    expect(parseDraftResponse('intro\n```json\n{"subject":"S","body":"B"}\n```\noutro'))
      .toEqual({ subject: 'S', body: 'B' });
    const fallback = parseDraftResponse('just some text');
    expect(fallback.body).toContain('just some text');
  });
});
