import { fetchJules } from './shared.js';

let sourceCache = { at: 0, sources: [] };
const SOURCE_CACHE_TTL = 60_000;

export async function listSources() {
  const now = Date.now();
  if (now - sourceCache.at < SOURCE_CACHE_TTL && sourceCache.sources.length) {
    return sourceCache.sources;
  }
  const res = await fetchJules('/sources');
  const sources = res?.sources || [];
  sourceCache = { at: now, sources };
  return sources;
}

function repoMatches(src, repo) {
  const r = (repo || '').toLowerCase();
  const candidates = [
    src?.githubRepo?.full_name,
    src?.githubRepo?.fullName,
    src?.github?.full_name,
    src?.github?.fullName,
    src?.full_name,
    src?.fullName,
  ].filter(Boolean).map(x => String(x).toLowerCase());
  if (candidates.includes(r)) return true;
  const name = (src?.name || '').toLowerCase();
  const [owner, project] = r.split('/');
  if (owner && project && name.includes(owner) && name.includes(project)) return true;
  return false;
}

export async function findSourceForRepo(repo) {
  const sources = await listSources();
  return sources.find(s => repoMatches(s, repo)) || null;
}
