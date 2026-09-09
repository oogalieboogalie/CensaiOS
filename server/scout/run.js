import { getSecret } from '../secrets.js';
import { saveLead } from '../salesLeads/store.js';

const AGGREGATORS = /realtor\.com|zillow\.com|redfin\.com|homes\.com|trulia\.com/i;

export function extractEmails(text = '') {
  return [...new Set((String(text).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []))]
    .filter((e) => !/example\.com|sentry|wixsite|godaddy|schema\.org/i.test(e)).slice(0, 5);
}

export function extractPhones(text = '') {
  return [...new Set((String(text).match(/(?:\+?1[\s.-]?)?\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|\b\d{3}[-.]\d{3}[-.]\d{4}\b/g) || []))].slice(0, 5);
}

export function extractSocials(text = '') {
  const out = {};
  const str = String(text);
  const fb = str.match(/https?:\/\/(www\.)?facebook\.com\/(?!recover|people\/?$|groups\/\d+$)[A-Za-z0-9._-]+\/?/);
  const ig = str.match(/https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._-]+\/?/);
  const li = str.match(/https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9-]+\/?/);
  if (fb) out.facebook = fb[0];
  if (ig) out.instagram = ig[0];
  if (li) out.linkedin = li[0];
  return out;
}

export function pickTeamPages(results = [], limit = 2) {
  return results.filter((r) => r?.url && !AGGREGATORS.test(r.url)).slice(0, limit);
}

async function tavily(pathname, body, apiKey) {
  const res = await fetch(`https://api.tavily.com/${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Tavily ${pathname} failed (${res.status})`);
  return res.json();
}

function leadNameFrom(page) {
  const title = String(page.title || '').split('|')[0].split('-')[0].trim();
  if (title) return title.slice(0, 200);
  try {
    return new URL(page.url).hostname.replace(/^www\./, '');
  } catch {
    return page.url.slice(0, 200);
  }
}

/**
 * Run one scout pass: search an area, extract the top team pages, save leads.
 * Returns { leads, actionsUsed }. Bounded: 1 search + up to topK extracts.
 */
export async function scoutArea({ area, icp = '', scope, topK = 3 }) {
  const apiKey = getSecret('TAVILY_API_KEY');
  if (!apiKey) throw Object.assign(new Error('TAVILY_API_KEY not configured in .env'), { statusCode: 424 });
  if (!area || typeof area !== 'string') throw Object.assign(new Error('Area is required.'), { statusCode: 400 });

  let actionsUsed = 0;
  const search = await tavily('search', {
    query: `realtor team ${area} open house`,
    search_depth: 'basic',
    max_results: 5,
  }, apiKey);
  actionsUsed += 1;

  const pages = pickTeamPages(search.results, Math.max(1, Math.min(topK, 5)));
  const leads = [];
  for (const page of pages) {
    const extracted = await tavily('extract', {
      urls: [page.url],
      query: `realtor team contact phone email facebook instagram linkedin ${icp}`.trim(),
      extract_depth: 'advanced',
    }, apiKey);
    actionsUsed += 1;
    const content = ((extracted.results || [])[0] || {}).raw_content || '';
    const emails = extractEmails(content);
    const phones = extractPhones(content);
    const socials = extractSocials(content);
    const saved = await saveLead({
      name: leadNameFrom(page),
      city: area,
      phone: phones[0] || null,
      email: emails[0] || null,
      website: page.url,
      ...socials,
      buying_signals: ['open houses'],
      icp_score: (emails.length > 0 || phones.length > 0) ? 0.7 : 0.5,
      source_url: page.url,
      notes: `Scout pass ${new Date().toISOString().slice(0, 10)}`,
    }, scope);
    leads.push({ id: saved.id, deduped: saved.deduped, url: page.url, emails, phones, ...socials });
  }
  return { leads, actionsUsed };
}
