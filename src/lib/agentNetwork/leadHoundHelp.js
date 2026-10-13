// LeadHound as a helper on the agent network. Another agent (or a teammate
// from the Agents tab) asks in plain words; this turns the ask into a
// LeadHound brief and turns the hunt back into an answer the asker can read.
// Shared by the browser (askBoardAgent) and the server (boardHelp). Pure.

export const LEADHOUND_KIND = 'leadHound';

const LABELS = [
  ['business', /^(?:we sell|sell|selling|business|service|offer|product|seller)\s*[:-]\s*(.+)$/i],
  ['market', /^(?:market|target|target market|buyers?|customers?|who buys(?: it)?|audience|icp)\s*[:-]\s*(.+)$/i],
  ['region', /^(?:region|where|location|area|city)\s*[:-]\s*(.+)$/i],
];

/**
 * "Sell: AI receptionists\nMarket: dental clinics\nRegion: Austin" becomes a
 * brief. A free-form ask fills both business and market with the whole text,
 * which the planning step reads like any other brief.
 */
export function briefFromTask(task, { maxLeads = 3 } = {}) {
  const text = String(task || '').trim();
  const brief = { business: '', market: '', region: '', maxLeads };
  const rest = [];
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const hit = LABELS.find(([, re]) => re.test(line));
    if (hit && !brief[hit[0]]) brief[hit[0]] = line.match(hit[1])[1].trim();
    else rest.push(line);
  }
  const extra = rest.join(' ');
  if (!brief.business) brief.business = extra || text;
  if (!brief.market) brief.market = extra || text;
  return brief;
}

/** The answer that goes back to the asker: the ranked leads and first touch. */
export function huntSummary(result) {
  const leads = result?.leads || [];
  if (leads.length === 0) {
    return 'LeadHound searched the web with Tavily but found no buyer-shaped sites. Try a narrower market or add a region.';
  }
  const lines = [`LeadHound found ${leads.length} strong ${leads.length === 1 ? 'lead' : 'leads'} with Tavily:`];
  leads.forEach((lead, i) => {
    lines.push('', `**${i + 1}. ${lead.company}** (fit ${lead.fitScore})`, lead.url);
    if (lead.why_fit) lines.push(`Why: ${lead.why_fit}`);
    const email = lead.contacts?.emails?.[0];
    if (email) lines.push(`Contact: ${email}`);
    const first = (lead.sequence || [])[0];
    if (first?.subject) lines.push(`Day 1: "${first.subject}"`);
  });
  lines.push('', 'The full 7-day sequences and ice breakers are in the LeadHound window on the board.');
  return lines.join('\n');
}
