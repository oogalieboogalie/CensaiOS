import fs from 'node:fs';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { agentFileHint, listRepoAgents, parseRepoName } from './githubRepo.js';
import { createAgentImportGithubRouter } from '../routes/agentImportGithub.js';

// "Pull from a GitHub repo" (backlog 37): a stand-in repo with one Claude
// helper, one Google ADK agent and one Grok agent file.

const fixture = (name) => fs.readFileSync(`tests/fixtures/agent-import/${name}`, 'utf8');
const FILES = {
  '.claude/agents/code-reviewer.md': fixture('claude-subagent.md'),
  'agents/support/agent.py': fixture('google-adk-agent.py'),
  'agents/grok-agent.json': fixture('grok-agent.json'),
  'config/agent-settings.json': '{"theme":"dark"}',
  'README.md': '# Jordan shop agents',
};

function fakeGithub({ status = 200 } = {}) {
  const calls = [];
  const fetchImpl = jest.fn(async (url, opts) => {
    calls.push({ url, auth: opts.headers.Authorization || null });
    const u = new URL(url);
    if (status !== 200) return { ok: false, status, json: async () => ({}), text: async () => '' };
    if (u.pathname === '/repos/jordan/shop-agents') return { ok: true, status: 200, json: async () => ({ default_branch: 'main' }) };
    if (u.pathname === '/repos/jordan/shop-agents/git/trees/main') {
      return { ok: true, status: 200, json: async () => ({ tree: Object.entries(FILES).map(([path, text]) => ({ path, type: 'blob', size: text.length })) }) };
    }
    const file = decodeURIComponent(u.pathname.replace('/repos/jordan/shop-agents/contents/', ''));
    return { ok: true, status: 200, text: async () => FILES[file] };
  });
  return { fetchImpl, calls };
}

test('repo names and links are read; anything else is refused', () => {
  expect(parseRepoName('jordan/shop-agents')).toBe('jordan/shop-agents');
  expect(parseRepoName('https://github.com/jordan/shop-agents.git')).toBe('jordan/shop-agents');
  expect(parseRepoName('https://github.com/jordan/shop-agents/tree/main/agents')).toBe('jordan/shop-agents');
  for (const bad of ['', 'jordan', '../etc/passwd', 'jordan/..', 'https://evil.example/jordan/x', 'a/b/c']) expect(parseRepoName(bad)).toBeNull();
});

test('only agent-shaped paths are read', () => {
  expect(agentFileHint('.claude/agents/x.md')).toBe('claude');
  expect(agentFileHint('svc/agent.py')).toBe('google-adk');
  expect(agentFileHint('grok-agent.json')).toBe('detect');
  expect(agentFileHint('package.json')).toBeNull();
  expect(agentFileHint('docs/agents.md')).toBeNull();
});

test('finds the Claude, Google ADK and Grok agents with the given key', async () => {
  const { fetchImpl, calls } = fakeGithub();
  const found = await listRepoAgents('jordan/shop-agents', { token: 'gh-user', fetchImpl });
  expect(found.agents.map(a => a.platform).sort()).toEqual(['claude', 'google-adk', 'grok']);
  expect(found.agents.find(a => a.platform === 'claude').sourceFile).toBe('.claude/agents/code-reviewer.md');
  expect(found.skipped.map(s => s.file)).toEqual(['config/agent-settings.json']);
  expect(calls.every(c => c.url.startsWith('https://api.github.com/') && c.auth === 'Bearer gh-user')).toBe(true);
});

function app(deps, session = { userId: 7 }) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = session; next(); });
  a.use('/api/agent-import/github', createAgentImportGithubRouter(deps));
  return a;
}

test('POST /api/agent-import/github uses the vault key and returns drafts without it', async () => {
  const { fetchImpl } = fakeGithub();
  const vault = jest.fn(async (_id, provider) => (provider === 'github' ? { apiKey: 'gh-user' } : null));
  const res = await request(app({ getUserApiKeyConfig: vault, listRepoAgents: (repo, opts) => listRepoAgents(repo, { ...opts, fetchImpl }) }))
    .post('/api/agent-import/github').send({ repo: 'https://github.com/jordan/shop-agents' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ repo: 'jordan/shop-agents', branch: 'main' });
  expect(res.body.agents).toHaveLength(3);
  expect(JSON.stringify(res.body)).not.toContain('gh-user');
});

test('a bad name, a missing repo and a signed-out caller get plain answers', async () => {
  const vault = async () => null;
  const bad = await request(app({ getUserApiKeyConfig: vault })).post('/api/agent-import/github').send({ repo: 'not a repo' });
  expect(bad.status).toBe(400);
  const { fetchImpl } = fakeGithub({ status: 404 });
  const missing = await request(app({ getUserApiKeyConfig: vault, listRepoAgents: (repo, opts) => listRepoAgents(repo, { ...opts, fetchImpl }) }))
    .post('/api/agent-import/github').send({ repo: 'jordan/nothing' });
  expect(missing.status).toBe(404);
  expect(missing.body.error).toMatch(/not found/);
  expect((await request(app({}, {})).post('/api/agent-import/github').send({ repo: 'jordan/shop-agents' })).status).toBe(401);
});
