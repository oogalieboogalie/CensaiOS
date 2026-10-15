import { createTavilyClient, resolveTavilyKey } from '../leadhound/tavily.js';
import { saveLead } from '../salesLeads/store.js';

// Directory and listing sites list other people's businesses, not the lead's own page.
const AGGREGATORS = /realtor\.com|zillow\.com|redfin\.com|homes\.com|trulia\.com|yelp\.com|yellowpages\.com|bbb\.org|angi\.com/i;

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

function leadNameFrom(page) {
  const title = String(page.title || '').split('|')[0].split('-')[0].trim();
  if (title) return title.slice(0, 200);
  try {
    return new URL(page.url).hostname.replace(/^www\./, '');
  } catch {
    return page.url.slice(0, 200);
  }
}

export function buildScoutQueries({ area, target, business = '' }) {
  return {
    search: `${target} ${area}`.trim(),
    extract: `contact phone email facebook instagram linkedin ${target}${business ? ` (prospect for ${business})` : ''}`.trim(),
  };
}

/**
 * Run one scout pass: search an area for the user's target customers, extract
 * the top pages, save leads. Returns { leads, actionsUsed }.
 * Bounded: 1 search + up to topK extracts. The Tavily key is the user's own
 * saved key first, then the server's TAVILY_API_KEY.
 */
export async function scoutArea({ area, target = '', business = '', scope, topK = 3, resolveKey = resolveTavilyKey, makeClient = createTavilyClient, save = saveLead }) {
  if (!area || typeof area !== 'string') throw Object.assign(new Error('Area is required.'), { statusCode: 400 });
  if (!target || typeof target !== 'string' || !target.trim()) {
    throw Object.assign(new Error('Say who you sell to first, for example "dental offices" or "roofing companies".'), { statusCode: 400 });
  }
  const { apiKey } = await resolveKey(scope?.userId);
  const client = makeClient(apiKey, { purpose: 'scout for leads (paste it in LeadHound, or Settings, Vault)' });

  const queries = buildScoutQueries({ area, target: target.trim(), business: String(business || '').trim() });
  let actionsUsed = 0;
  const search = await client.searchFull(queries.search, { depth: 'basic', includeAnswer: false, maxResults: 5 });
  actionsUsed += 1;

  const pages = pickTeamPages(search.results, Math.max(1, Math.min(topK, 5)));
  const leads = [];
  for (const page of pages) {
    const content = await client.extract(page.url, queries.extract);
    actionsUsed += 1;
    const emails = extractEmails(content);
    const phones = extractPhones(content);
    const socials = extractSocials(content);
    const saved = await save({
      name: leadNameFrom(page),
      city: area,
      phone: phones[0] || null,
      email: emails[0] || null,
      website: page.url,
      ...socials,
      buying_signals: [],
      icp_score: (emails.length > 0 || phones.length > 0) ? 0.7 : 0.5,
      source_url: page.url,
      notes: `Scout pass ${new Date().toISOString().slice(0, 10)} for "${target.trim().slice(0, 200)}"`,
    }, scope);
    leads.push({ id: saved.id, deduped: saved.deduped, url: page.url, emails, phones, ...socials });
  }
  return { leads, actionsUsed };
}
