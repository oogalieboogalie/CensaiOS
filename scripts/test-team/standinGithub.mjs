// A stand-in GitHub REST API for the test team: the made-up GitHub of
// tests/fixtures/fakeGithubRepos.js served over HTTP, whose repositories are
// bare repositories on disk, so Send to GitHub, a GitHub project and an
// agent's GitHub reads can be tried with no GitHub account. Point
// CENSAI_GITHUB_API_URL at `url`.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fakeGithubRepos } from '../../tests/fixtures/fakeGithubRepos.js';

export const STANDIN_GITHUB_OWNER = 'pat-example';

/** Starts the stand-in on a free port; resolves with { url, calls(), reads(), seed(), pathsIn(name), everything(name), close() }. */
export function startStandinGithub() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'made-up-github-'));
  const gh = fakeGithubRepos(root, { owner: STANDIN_GITHUB_OWNER });
  // Every ask about a repo, answered or not: [method, repo, what is asked].
  const reads = [];
  // m[1] is the repo's name; a repo of any other owner is not there.
  const routes = [
    ['POST', /^\/user\/repos$/, (m, body) => gh.repos.createForAuthenticatedUser(body)],
    ['GET', /^\/repos\/[^/]+\/([^/]+)$/, (m) => gh.repos.get({ repo: m[1] })],
    ['GET', /^\/repos\/[^/]+\/([^/]+)\/git\/refs?\/(.+)$/, (m) => gh.git.getRef({ repo: m[1], ref: m[2] })],
    ['GET', /^\/repos\/[^/]+\/([^/]+)\/git\/trees\/(.+)$/, (m) => gh.git.getTree({ repo: m[1], tree_sha: m[2] })],
    ['GET', /^\/repos\/[^/]+\/([^/]+)\/contents(?:\/(.*))?$/, (m, body, query) => gh.repos.getContent({ repo: m[1], path: m[2] || '', ref: query.get('ref') || undefined })],
    ['PUT', /^\/repos\/[^/]+\/([^/]+)\/contents\/(.+)$/, (m, body) => gh.repos.createOrUpdateFileContents({ ...body, repo: m[1], path: m[2] })],
    ['GET', /^\/repos\/[^/]+\/([^/]+)\/issues$/, (m) => gh.issues.listForRepo({ repo: m[1] })],
    ['POST', /^\/repos\/[^/]+\/([^/]+)\/pulls$/, (m, body) => gh.pulls.create({ ...body, repo: m[1] })],
  ];
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const answer = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url, 'http://127.0.0.1');
    const where = decodeURIComponent(url.pathname);
    const asked = where.match(/^\/repos\/([^/]+)\/([^/]+)\/?(.*)$/);
    if (asked) reads.push([req.method, asked[2], asked[3]]);
    const route = routes.find(([method, pattern]) => method === req.method && pattern.test(where));
    if (!route || (asked && asked[1] !== STANDIN_GITHUB_OWNER)) return answer(404, { message: 'Not Found' });
    try {
      const { data } = await route[2](where.match(route[1]), raw ? JSON.parse(raw) : {}, url.searchParams);
      return answer(req.method === 'POST' ? 201 : 200, data);
    } catch (err) {
      return answer(err.status || 500, { message: err.message });
    }
  });
  const repos = () => fs.readdirSync(root).filter((name) => name.endsWith('.git')).map((name) => name.slice(0, -4));
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      calls: () => gh.calls.map((call) => [...call]),
      reads: () => reads.map((read) => [...read]),
      /** Makes the made-up repository `name` (owner STANDIN_GITHUB_OWNER) holding `files` and `issues`. */
      seed: (name, files, options) => gh.seed(name, files, options),
      repos,
      pathsIn: (name) => gh.pathsIn(name),
      /** Every word the made-up repository `name` holds: each version's message and changes, on every branch. */
      everything: (name) => execFileSync('git', ['-C', gh.repoDir(name), 'log', '--all', '-p', '--no-color'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
      close: () => new Promise((done) => server.close(() => {
        fs.rmSync(root, { recursive: true, force: true });
        done();
      })),
    }));
  });
}
