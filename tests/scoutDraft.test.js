import { buildOutreachPrompt, parseDraftResponse } from '../server/scout/draft.js';

describe('outreach drafting', () => {
  const lead = {
    name: 'Jordan Blake', team: null, brokerage: 'Jordan Blake Real Estate',
    city: 'Riverton, IA', buying_signals: ['open houses', 'hiring'],
  };

  test('prompt names the human, the signals, and the offer', () => {
    const prompt = buildOutreachPrompt(lead);
    expect(prompt).toContain('Jordan Blake');
    expect(prompt).toContain('Riverton, IA');
    expect(prompt).toContain('open houses');
    expect(prompt).toContain('14-day pilot');
    expect(prompt).toContain('JSON only');
  });

  test('prompt degrades gracefully with thin leads', () => {
    const prompt = buildOutreachPrompt({ name: 'Example Realty' });
    expect(prompt).toContain('Example Realty');
    expect(prompt).not.toContain('null');
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
