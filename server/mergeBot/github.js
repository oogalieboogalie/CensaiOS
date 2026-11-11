// GitHub reads, plus one write: squash-merge a pull request.
// There is no push, no force-push, and no update of a branch.
import { repoParts } from './config.js';

export const MERGE_WRITES = Object.freeze(['squash']);

export function squashMergeRequest({ repo, number, sha }) {
  const parts = repoParts(repo);
  if (!parts) throw Object.assign(new Error('github'), { code: 'github-repo' });
  return {
    method: 'PUT',
    path: `/repos/${parts.owner}/${parts.name}/pulls/${number}/merge`,
    body: { merge_method: 'squash', sha },
  };
}

function apiPath(repo, suffix) {
  const parts = repoParts(repo);
  if (!parts) throw Object.assign(new Error('github'), { code: 'github-repo' });
  return `/repos/${parts.owner}/${parts.name}${suffix}`;
}

export function createGitHub(fetchImpl = globalThis.fetch) {
  async function request(token, { method = 'GET', path, body }) {
    const res = await fetchImpl(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'censai-merge-bot',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      await res.text().catch(() => '');
      throw Object.assign(new Error('github'), { code: `github-${res.status}`, status: res.status });
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function pages(token, path, pick) {
    const all = [];
    let complete = true;
    for (let page = 1; page <= 10; page += 1) {
      const join = path.includes('?') ? '&' : '?';
      const batch = await request(token, { path: `${path}${join}per_page=100&page=${page}` });
      const rows = pick ? pick(batch) : batch;
      if (!Array.isArray(rows)) throw Object.assign(new Error('github'), { code: 'github-shape' });
      if (rows.length === 0) break;
      all.push(...rows);
      if (rows.length < 100) break;
      if (page === 10) complete = false;
    }
    return { rows: all, complete };
  }

  return {
    async listOpenPulls({ token, repo }) {
      const { rows, complete } = await pages(token, apiPath(repo, '/pulls?state=open&base=master'));
      return {
        numbers: rows.map((pull) => pull.number).filter((number) => Number.isInteger(number)),
        complete,
      };
    },

    async loadPull({ token, repo, number }) {
      const pull = await request(token, { path: apiPath(repo, `/pulls/${number}`) });
      const headRepo = pull.head?.repo?.full_name || '';
      const baseRepo = pull.base?.repo?.full_name || '';
      const headMissing = pull.head?.repo == null;
      return {
        number: pull.number,
        headSha: pull.head?.sha || '',
        draft: Boolean(pull.draft),
        title: pull.title || '',
        author: pull.user?.login || '',
        mergeable: pull.mergeable === true ? true : pull.mergeable === false ? false : null,
        base: pull.base?.ref || '',
        fork: headMissing || !headRepo || !baseRepo || headRepo !== baseRepo,
        url: pull.html_url || '',
      };
    },

    async comments({ token, repo, number }) {
      const [issues, reviews, lines] = await Promise.all([
        pages(token, apiPath(repo, `/issues/${number}/comments`)),
        pages(token, apiPath(repo, `/pulls/${number}/reviews`)),
        pages(token, apiPath(repo, `/pulls/${number}/comments`)),
      ]);
      if (!issues.complete || !reviews.complete || !lines.complete) {
        throw Object.assign(new Error('github'), { code: 'github-truncated' });
      }
      return [...issues.rows, ...reviews.rows, ...lines.rows].map((row) => ({
        login: row.user?.login || '',
        body: row.body || '',
        createdAt: row.created_at || row.submitted_at || '',
        updatedAt: row.updated_at || row.created_at || row.submitted_at || '',
        state: row.state || '',
        commitId: row.commit_id || '',
      }));
    },

    async commits({ token, repo, number }) {
      const { rows, complete } = await pages(token, apiPath(repo, `/pulls/${number}/commits`));
      if (!complete) throw Object.assign(new Error('github'), { code: 'github-truncated' });
      return rows.map((row) => row.sha || '').filter((sha) => /^[0-9a-f]{40}$/i.test(sha));
    },

    async checks({ token, repo, sha }) {
      const { rows, complete } = await pages(token, apiPath(repo, `/commits/${sha}/check-runs`), (body) => body?.check_runs || []);
      if (!complete) throw Object.assign(new Error('github'), { code: 'github-truncated' });
      return rows.map((row) => ({
        name: row.name || '',
        sha: row.head_sha || sha,
        conclusion: row.conclusion || '',
        status: row.status || '',
        startedAt: row.started_at || '',
        completedAt: row.completed_at || '',
        appId: Number(row.app?.id) || 0,
      }));
    },

    async treeModes(token, repo, commitSha) {
      const commit = await request(token, { path: apiPath(repo, `/git/commits/${commitSha}`) });
      const treeSha = commit.tree?.sha || '';
      if (!treeSha) throw Object.assign(new Error('github'), { code: 'github-shape' });
      const tree = await request(token, { path: apiPath(repo, `/git/trees/${treeSha}?recursive=1`) });
      if (tree.truncated || !Array.isArray(tree.tree)) {
        throw Object.assign(new Error('github'), { code: 'github-truncated' });
      }
      return new Map(tree.tree.map((item) => [item.path, String(item.mode || '')]));
    },

    async files({ token, repo, number }) {
      const pull = await request(token, { path: apiPath(repo, `/pulls/${number}`) });
      const { rows, complete } = await pages(token, apiPath(repo, `/pulls/${number}/files`));
      if (!complete) throw Object.assign(new Error('github'), { code: 'github-truncated' });
      const [baseModes, headModes] = await Promise.all([
        this.treeModes(token, repo, pull.base?.sha || ''),
        this.treeModes(token, repo, pull.head?.sha || ''),
      ]);
      return rows.map((row) => {
        const filename = row.filename || '';
        const previous = row.previous_filename || '';
        const mode = headModes.get(filename) || '';
        const previousMode = baseModes.get(previous || filename) || '';
        const removed = row.status === 'removed';
        const untrusted = removed ? !previousMode : !mode;
        return { filename, previous_filename: previous, mode, previousMode, untrusted };
      });
    },

    async squashMerge({ token, repo, number, sha }) {
      return request(token, squashMergeRequest({ repo, number, sha }));
    },
  };
}
