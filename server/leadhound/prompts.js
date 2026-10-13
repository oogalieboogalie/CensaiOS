// Prompt builders + tolerant JSON parsing for the LeadHound LLM steps.
// Every builder returns an OpenAI-style messages array; every parser
// returns null on garbage so the pipeline can fall back deterministically.

export function parseJsonBlock(text = '') {
  const raw = String(text || '').trim();
  const candidates = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.push(fenced[1]);
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(raw.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* try the next shape */ }
  }
  return null;
}

function briefLines(brief) {
  return [
    `Seller (what the user sells): ${brief.business}`,
    `Target market: ${brief.market}`,
    brief.region ? `Region: ${brief.region}` : null,
  ].filter(Boolean).join('\n');
}

export function planQueriesMessages(brief) {
  return [
    {
      role: 'system',
      content: [
        'You are LeadHound, a B2B prospecting researcher.',
        'Turn the seller brief into 3 web search queries that surface real companies',
        'or practices that would BUY from the seller (their own websites, not lists',
        'of vendors, not job boards, not news about the seller\'s industry).',
        'Return JSON only: {"queries": ["...", "...", "..."], "ideal_profile": "one sentence"}.',
      ].join(' '),
    },
    { role: 'user', content: briefLines(brief) },
  ];
}

export function scoreLeadsMessages(brief, candidates) {
  const list = candidates.map((c, i) => (
    `[${i}] ${c.title}\nURL: ${c.url}\nSnippet: ${String(c.snippet || '').slice(0, 400)}`
  )).join('\n\n');
  return [
    {
      role: 'system',
      content: [
        'You qualify sales leads. For each candidate decide how well it fits as a BUYER',
        'for the seller. Score 0-100 (90+ = clear buyer with a visible need; under 40 =',
        'a vendor, directory, competitor, or irrelevant). Be specific and grounded in',
        'the snippet; never invent facts.',
        'Return JSON only: {"leads": [{"index": 0, "company": "name", "fit_score": 0,',
        '"why_fit": "one sentence", "pain_points": ["..."], "decision_maker": "likely role",',
        '"angle": "the one hook to open with"}]}.',
      ].join(' '),
    },
    { role: 'user', content: `${briefLines(brief)}\n\nCandidates:\n\n${list}` },
  ];
}

export function outreachMessages(brief, lead) {
  const facts = [
    `Company: ${lead.company}`,
    `Website: ${lead.url}`,
    lead.why_fit ? `Why they fit: ${lead.why_fit}` : null,
    lead.pain_points?.length ? `Likely pain points: ${lead.pain_points.join('; ')}` : null,
    lead.decision_maker ? `Likely decision maker: ${lead.decision_maker}` : null,
    lead.angle ? `Opening angle: ${lead.angle}` : null,
    lead.snippet ? `What their site says: ${String(lead.snippet).slice(0, 500)}` : null,
  ].filter(Boolean).join('\n');
  return [
    {
      role: 'system',
      content: [
        'You are an outbound strategist writing for the seller. Produce:',
        '(1) a 7-day introduction sequence, one touch per day (day 1..7), mixing channels',
        '(email, linkedin, call, video, value-drop). Short, human, specific to this company,',
        'no hype, no placeholders like [Name]; each touch builds on the last and day 7 is a',
        'graceful break-up. (2) an Ice Breaker deliverable: a small, genuinely useful thing',
        'the seller gives away up front (a mini audit, 3 tailored ideas, a teardown) written',
        'out in full as markdown so it can be sent as-is.',
        'Return JSON only: {"sequence": [{"day": 1, "channel": "email", "subject": "...",',
        '"body": "..."}], "ice_breaker": {"title": "...", "format": "e.g. 1-page audit",',
        '"opening_line": "...", "deliverable": "markdown", "cta": "..."}}.',
      ].join(' '),
    },
    { role: 'user', content: `${briefLines(brief)}\n\nProspect:\n${facts}` },
  ];
}
