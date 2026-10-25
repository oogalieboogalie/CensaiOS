// LeadHound workflow: brief → search plan → Tavily search → LLM scoring →
// contact extraction for the strongest few → per-lead 7-day sequence and
// Ice Breaker deliverable. Pure orchestration over two injected deps:
//   tavily:   { search(query, opts) -> results[], extract(url, query) -> text }
//   complete: (messages, opts) -> assistant text
// onStep(step, detail) reports progress so the window can show what the hunt
// actually found at each stage (queries, site count, shortlist, drafts).
// Bounded cost: ≤3 searches, ≤maxLeads extracts, 2 + maxLeads LLM calls.

import { extractEmails, extractPhones, extractSocials } from '../scout/run.js';
import { outreachMessages, parseJsonBlock, planQueriesMessages, scoreLeadsMessages } from './prompts.js';

const NOISE_HOSTS = /(^|\.)(linkedin|facebook|instagram|twitter|x|youtube|tiktok|reddit|wikipedia|indeed|glassdoor|ziprecruiter|yelp|crunchbase|g2|capterra|clutch|upwork|fiverr|medium|quora|pinterest|amazon)\.[a-z.]+$/i;
const MAX_CANDIDATES = 12;
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
// Brief fields are typed words only: an object or a list is not a brief.
const words = (v, n) => (typeof v === 'string' ? clip(v, n) : '');

export function normalizeBrief(input = {}) {
  const brief = {
    business: words(input.business, 600),
    market: words(input.market, 400),
    region: words(input.region, 120),
  };
  if (!brief.business || !brief.market) {
    throw Object.assign(new Error('Tell LeadHound what you sell and who you sell to.'), { statusCode: 400 });
  }
  const n = Number(input.maxLeads);
  brief.maxLeads = Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n))) : 3;
  return brief;
}

export function fallbackQueries(brief) {
  const where = brief.region ? ` ${brief.region}` : '';
  return [
    `${brief.market}${where}`,
    `${brief.market}${where} company website contact`,
    `top ${brief.market}${where} growing teams`,
  ];
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

export function dedupeCandidates(resultSets) {
  const seen = new Set();
  const out = [];
  for (const result of resultSets.flat()) {
    const host = hostOf(result?.url);
    if (!host || seen.has(host) || NOISE_HOSTS.test(host)) continue;
    seen.add(host);
    out.push({
      title: clip(result.title, 200) || host,
      url: result.url,
      host,
      snippet: clip(result.content, 800),
      searchScore: Number(result.score) || 0,
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

export function applyScores(candidates, parsed) {
  const byIndex = new Map();
  for (const row of Array.isArray(parsed?.leads) ? parsed.leads : []) {
    const i = Number(row?.index);
    if (Number.isInteger(i) && candidates[i]) byIndex.set(i, row);
  }
  return candidates.map((c, i) => {
    const row = byIndex.get(i);
    const fit = Number(row?.fit_score);
    return {
      ...c,
      company: clip(row?.company, 120) || c.title.split(/[|\-–]/)[0].trim() || c.host,
      fitScore: Number.isFinite(fit) ? Math.max(0, Math.min(100, Math.round(fit))) : Math.round(c.searchScore * 60),
      why_fit: clip(row?.why_fit, 400),
      pain_points: (Array.isArray(row?.pain_points) ? row.pain_points : []).map((p) => clip(p, 200)).filter(Boolean).slice(0, 4),
      decision_maker: clip(row?.decision_maker, 120),
      angle: clip(row?.angle, 300),
      scoredBy: row ? 'llm' : 'search',
    };
  }).sort((a, b) => b.fitScore - a.fitScore);
}

export function normalizeOutreach(parsed) {
  const rows = Array.isArray(parsed?.sequence) ? parsed.sequence : [];
  const sequence = [];
  for (let day = 1; day <= 7; day += 1) {
    const row = rows.find((r) => Number(r?.day) === day) || rows[day - 1];
    if (!row) continue;
    sequence.push({
      day,
      channel: clip(row.channel, 30).toLowerCase() || 'email',
      subject: clip(row.subject, 200),
      body: clip(row.body, 2000),
    });
  }
  const ib = parsed?.ice_breaker || {};
  const iceBreaker = ib.deliverable || ib.title ? {
    title: clip(ib.title, 160),
    format: clip(ib.format, 80),
    opening_line: clip(ib.opening_line, 400),
    deliverable: clip(ib.deliverable, 6000),
    cta: clip(ib.cta, 300),
  } : null;
  return { sequence, iceBreaker };
}

export async function runLeadHound(input, { tavily, complete, onStep = () => {} }) {
  const brief = normalizeBrief(input);
  const warnings = [];
  const aiFailures = [];
  const usage = { searches: 0, extracts: 0, llmCalls: 0 };
  const ask = async (messages, opts) => {
    usage.llmCalls += 1;
    try { return parseJsonBlock(await complete(messages, opts)); } catch (err) {
      aiFailures.push(err.message || 'unknown error');
      return null;
    }
  };
  // One plain line instead of the same model error once per step.
  const aiWarnings = () => {
    if (aiFailures.length === 0) return [];
    if (aiFailures.length >= usage.llmCalls) {
      return [`The AI steps could not run (${aiFailures[0]}), so leads are ranked by search only and no outreach was drafted. Check the chat model key in Settings, then run the hunt again.`];
    }
    return [`${aiFailures.length} of ${usage.llmCalls} AI steps failed (${aiFailures[0]}). Leads without drafts can be hunted again.`];
  };

  onStep('plan');
  const plan = await ask(planQueriesMessages(brief), { maxTokens: 400, temperature: 0.3 });
  const planned = (Array.isArray(plan?.queries) ? plan.queries : []).map((q) => clip(q, 300)).filter(Boolean);
  const queries = (planned.length ? planned : fallbackQueries(brief)).slice(0, 3);

  const idealProfile = clip(plan?.ideal_profile, 300);
  onStep('search', { queries, idealProfile });
  const resultSets = [];
  for (const query of queries) {
    usage.searches += 1;
    resultSets.push(await tavily.search(query, { maxResults: 6 }));
  }
  const candidates = dedupeCandidates(resultSets);
  if (candidates.length === 0) {
    return { brief, queries, idealProfile, candidates: [], leads: [], usage, warnings: [...aiWarnings(), ...warnings] };
  }

  onStep('score', { found: candidates.length });
  const scored = applyScores(candidates, await ask(scoreLeadsMessages(brief, candidates), { maxTokens: 2000, temperature: 0.2 }));
  const top = scored.slice(0, brief.maxLeads);

  onStep('enrich', { shortlist: top.map((l) => ({ company: l.company, host: l.host, fitScore: l.fitScore })) });
  for (const lead of top) {
    usage.extracts += 1;
    let text = '';
    try { text = await tavily.extract(lead.url, 'contact email phone team about'); } catch {
      warnings.push(`Could not read ${lead.host}, so its contact details may be missing.`);
    }
    lead.contacts = { emails: extractEmails(text), phones: extractPhones(text), ...extractSocials(text) };
  }

  onStep('draft', { drafted: 0, total: top.length });
  let drafted = 0;
  const leads = await Promise.all(top.map(async (lead) => {
    const outreach = normalizeOutreach(await ask(outreachMessages(brief, lead), { maxTokens: 3000, temperature: 0.6 }));
    drafted += 1;
    onStep('draft', { drafted, total: top.length, company: lead.company });
    return { ...lead, ...outreach };
  }));

  return {
    brief,
    queries,
    idealProfile,
    candidates: scored.map(({ snippet, ...rest }) => rest),
    leads,
    usage,
    warnings: [...aiWarnings(), ...warnings],
  };
}
