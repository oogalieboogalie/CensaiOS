import { requestChatCompletion } from '../aiGateway/index.js';

// The pitch comes from the user's own business and target, saved in the Lead
// Queue's settings; nothing here assumes what the user sells.
export function buildOutreachPrompt(lead = {}, { business = '', target = '' } = {}) {
  const who = [lead.name, lead.team ? `of ${lead.team}` : null].filter(Boolean).join(' ') || 'there';
  const org = [lead.brokerage, lead.city].filter(Boolean).join(', ');
  const signals = Array.isArray(lead.buying_signals) && lead.buying_signals.length > 0
    ? lead.buying_signals.join(', ')
    : null;
  return [
    `You are a growth copywriter for this business: ${business}.`,
    target ? `It sells to: ${target}.` : null,
    'Write a short cold outreach email (under 120 words) introducing that business to the recipient.',
    `Recipient: ${who}${org ? ` (${org})` : ''}.`,
    signals ? `Observed signals: ${signals}.` : null,
    lead.website ? `Their website: ${lead.website}.` : null,
    'Rules: plain human voice, one specific observation about the recipient, one clear low-risk offer that fits what the business sells, one low-pressure question to close. No hype, no buzzwords, no placeholders, never invent facts about the business.',
    'Return JSON only: {"subject": "...", "body": "..."}.',
  ].filter(Boolean).join('\n');
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

export async function draftOutreach(lead, { business = '', target = '', requestCompletion = requestChatCompletion } = {}) {
  if (!String(business || '').trim()) {
    throw Object.assign(new Error('Tell the Lead Queue what you sell first: open Scout and fill in "What you sell".'), { statusCode: 400 });
  }
  const data = await requestCompletion({
    body: {
      messages: [
        { role: 'system', content: buildOutreachPrompt(lead, { business: String(business).trim(), target: String(target || '').trim() }) },
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
