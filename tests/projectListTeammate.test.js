import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The list of every project on this computer (GET /api/projects: each one's
// name, folder, GitHub repo and summary) is for this computer's owner. Anyone
// else gets the projects open on this computer's boards and the ones the
// boards they are on give their agents, the projects Files, a window's
// project menu and each board's own project list already show them. Pat
// Example owns the computer and Sam Example is a teammate on Pat's board.
// Every project, folder and word is made up.
const PEOPLE = { 1: { role: 'admin' }, 2: { role: 'user' }, 3: { role: 'user' } };
const PAT = 1;
const SAM = 2;
const NO_BOARD = 3;

const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'censai-project-list-')));
const stateDir = path.join(tempRoot, 'state');
fs.mkdirSync(stateDir, { recursive: true });
process.env.CENSAI_STATE_DIR = stateDir;
const folder = (name) => path.join(tempRoot, name);

const PRICING_SUMMARY = "Made-up: Pat's pricing notes for next spring";
// Newest first, as listProjects returns them.
const PROJECTS = [
  { id: 'made-up-shop-site', owner_agent_id: 'architect', name: 'made-up-shop-site', path: folder('made-up-shop-site'), repo: null, summary: null, updated_at: '2026-10-31T12:00:00Z' },
  { id: 'made-up-garden-plans', owner_agent_id: 'architect', name: 'Made-up garden plans', path: folder('made-up-garden-plans'), repo: 'made-up-owner/made-up-garden', summary: 'Made-up: the garden board plans', updated_at: '2026-10-31T11:00:00Z' },
  { id: 'made-up-pricing-plans', owner_agent_id: 'architect', name: 'Made-up pricing plans', path: folder('made-up-pricing-plans'), repo: 'made-up-owner/made-up-pricing', summary: PRICING_SUMMARY, updated_at: '2026-10-31T10:00:00Z' },
];
// The board Sam is on gives its agents the garden project.
const BOARD_PROJECTS = { [SAM]: [PROJECTS[1]] };

let ownerCheckFails = false;
const pool = {
  query: jest.fn(async (sql, params = []) => {
    if (/FROM users WHERE id/.test(sql)) {
      if (ownerCheckFails) throw Object.assign(new Error('made-up database outage'), { code: 'ECONNREFUSED' });
      return { rows: PEOPLE[params[0]] ? [PEOPLE[params[0]]] : [] };
    }
    if (/FROM workspace_agent_projects/.test(sql)) {
      return { rows: (BOARD_PROJECTS[params[0]] || []).map(({ id, path: p, repo }) => ({ id, path: p, repo })) };
    }
    if (/SELECT DISTINCT ON/.test(sql)) return { rows: PROJECTS.map((p) => ({ ...p })) };
    return { rows: [] };
  }),
};
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));

const { projectsRouter } = await import('../server/routes/projects/index.js');
const { OWNER_UNCHECKED_MESSAGE } = await import('../server/security/systemAdmin.js');

function app(userId) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = { userId }; next(); });
  a.use('/api', projectsRouter);
  return a;
}
const get = (who, route) => request(app(who)).get(route);
const names = (res) => (res.body.projects || []).map((p) => p.name);
const OFF_BOARD = ['Made-up pricing plans', folder('made-up-pricing-plans'), 'made-up-owner/made-up-pricing', PRICING_SUMMARY];

beforeEach(() => {
  ownerCheckFails = false;
  // The shop site is open on the board, as its default.
  fs.writeFileSync(path.join(stateDir, 'open-projects.json'), JSON.stringify([folder('made-up-shop-site')]));
  fs.writeFileSync(path.join(stateDir, 'current-project.json'), JSON.stringify({ type: 'local', name: 'made-up-shop-site', path: folder('made-up-shop-site') }));
});

afterAll(() => {
  delete process.env.CENSAI_STATE_DIR;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("the list of every project on this computer is its owner's", () => {
  test("the owner's list is every project on this computer, as before", async () => {
    const pat = await get(PAT, '/api/projects');
    expect(pat.status).toBe(200);
    expect(names(pat)).toEqual(['made-up-shop-site', 'Made-up garden plans', 'Made-up pricing plans']);
    expect(pat.body.projects[2]).toEqual({
      id: 'made-up-pricing-plans',
      name: 'Made-up pricing plans',
      path: folder('made-up-pricing-plans'),
      repo: 'made-up-owner/made-up-pricing',
      summary: PRICING_SUMMARY,
      ownerAgentId: 'architect',
      updatedAt: '2026-10-31T10:00:00Z',
    });
  });

  test("a teammate's list holds the projects open on the board and the one their board gives its agents, and names nothing of the other", async () => {
    const sam = await get(SAM, '/api/projects');
    expect(sam.status).toBe(200);
    expect(names(sam)).toEqual(['made-up-shop-site', 'Made-up garden plans']);
    for (const word of OFF_BOARD) expect(sam.text).not.toContain(word);
  });

  test('someone on no board gets only the projects open on the board', async () => {
    const res = await get(NO_BOARD, '/api/projects');
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['made-up-shop-site']);
  });

  test('a project is in a teammate\'s list once it is open on the board, whatever spelling its folder has there', async () => {
    fs.writeFileSync(path.join(stateDir, 'open-projects.json'), JSON.stringify([folder('made-up-shop-site'), `${folder('made-up-pricing-plans')}/`]));
    const sam = await get(SAM, '/api/projects');
    expect(names(sam)).toEqual(['made-up-shop-site', 'Made-up garden plans', 'Made-up pricing plans']);
  });

  test('when censaiOS cannot tell who owns this computer, a teammate gets plain words and no list', async () => {
    ownerCheckFails = true;
    const sam = await get(SAM, '/api/projects');
    expect(sam.status).toBe(503);
    expect(sam.body).toEqual({ error: OWNER_UNCHECKED_MESSAGE });
    for (const word of ['made-up-shop-site', ...OFF_BOARD]) expect(sam.text).not.toContain(word);
  });

  test("the board's default project, open on every board, is named to a teammate as before", async () => {
    const sam = await get(SAM, '/api/current-project');
    expect(sam.status).toBe(200);
    expect(sam.body.project).toMatchObject({ name: 'made-up-shop-site', path: folder('made-up-shop-site') });
  });
});
