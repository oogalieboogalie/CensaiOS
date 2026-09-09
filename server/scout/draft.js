import { requestChatCompletion } from '../aiGateway/index.js';

export function buildOutreachPrompt(lead = {}) {
  const who = [lead.name, lead.team ? `of ${lead.team}` : null].filter(Boolean).join(' ') || 'there';
  const org = [lead.brokerage, lead.city].filter(Boolean).join(', ');
  const signals = Array.isArray(lead.buying_signals) && lead.buying_signals.length > 0
    ? lead.buying_signals.join(', ')
    : 'active listings and open houses';
  return [
    'You are a growth copywriter for Censai — software that turns',
    'handwritten real-estate notes into CRM contacts in seconds.',
    'Write a short cold outreach email (under 120 words) to a realtor.',
    `Recipient: ${who}${org ? ` (${org})` : ''}.`,
    `Observed signals: ${signals}.`,
    'Rules: plain human voice, one specific observation, one offer (a 14-day pilot on their own open-house sheets), one low-pressure question to close. No hype, no buzzwords, no placeholders.',
    'Return JSON only: {"subject": "...", "body": "..."}.',
  ].join('\n');
}

export function parseDraftResponse(text = '') {
  const raw = String(text || '').trim();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.subject === 'string' && typeof parsed.body === 'string') {
      return { subject: parsed.subject.slice(0, 200), body: parsed.body.slice(0, 2000) };
    }
  } catch {
    // fall through to fenced/loose extraction
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1]);
      if (parsed && typeof parsed.subject === 'string' && typeof parsed.body === 'string') {
        return { subject: parsed.subject.slice(0, 200), body: parsed.body.slice(0, 2000) };
      }
    } catch { /* fall through */ }
  }
  return { subject: '', body: raw.slice(0, 2000) };
}

export async function draftOutreach(lead, { requestCompletion = requestChatCompletion } = {}) {
  const data = await requestCompletion({
    body: {
      messages: [
        { role: 'system', content: buildOutreachPrompt(lead) },
        { role: 'user', content: 'Write the outreach email.' },
      ],
      max_tokens: 500,
      temperature: 0.7,
    },
    logContext: { source: 'scout-draft' },
  });
  const text = data?.choices?.[0]?.message?.content || '';
  return parseDraftResponse(text);
}
