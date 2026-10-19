import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { listProjectClaudeHelpers } from './projectHelpers.js';
import { createAgentImportProjectRouter } from '../routes/agentImportProject.js';

// "Pull from this project": every Claude Code helper in .claude/agents is
// read with the same translator as a dropped file; owner only.

const SUBAGENT = fs.readFileSync('tests/fixtures/agent-import/claude-subagent.md', 'utf8');

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'helpers-'));
  const folder = path.join(root, '.claude', 'agents');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'code-reviewer.md'), SUBAGENT);
  fs.writeFileSync(path.join(folder, 'notes-writer.md'), '---\nname: notes-writer\ndescription: Writes meeting notes for Jordan.\n---\n\nYou write short notes.\n');
  fs.writeFileSync(path.join(folder, 'broken.md'), 'no header here');
  fs.writeFileSync(path.join(folder, 'readme.txt'), 'not a helper');
  return root;
}

function app(deps) {
  const a = express();
  a.use(express.json());
  a.use('/api/agent-import/project', createAgentImportProjectRouter(deps));
  return a;
}
const owner = (_req, _res, next) => next();

describe('listProjectClaudeHelpers', () => {
  test('lists every .md helper, skips the unreadable one and other files', async () => {
    const found = await listProjectClaudeHelpers(project());
    expect(found.agents.map(a => a.name)).toEqual(['code-reviewer', 'notes-writer']);
    expect(found.agents[0]).toMatchObject({ platform: 'claude', sourceFile: 'code-reviewer.md' });
    expect(found.skipped).toEqual([expect.objectContaining({ file: 'broken.md' })]);
    expect(found.capped).toBe(false);
  });

  test('a project with no helpers folder finds none instead of failing', async () => {
    const found = await listProjectClaudeHelpers(fs.mkdtempSync(path.join(os.tmpdir(), 'empty-')));
    expect(found).toMatchObject({ agents: [], skipped: [], capped: false });
  });
});

describe('POST /api/agent-import/project', () => {
  test('reads the open project for the owner', async () => {
    const root = project();
    const res = await request(app({ requireOwner: owner, readCurrentProject: async () => ({ path: root, name: 'Demo' }), resolveProjectPath: p => p }))
      .post('/api/agent-import/project').send({});
    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(2);
    expect(res.body.project).toBe('Demo');
  });

  test('no open project is a plain 400; non-owners are refused', async () => {
    const none = await request(app({ requireOwner: owner, readCurrentProject: async () => null })).post('/api/agent-import/project').send({});
    expect(none.status).toBe(400);
    expect(none.body.error).toMatch(/Open a project first/);
    const refuse = (_req, res) => res.status(403).json({ error: "Only this computer's owner can do this." });
    const res = await request(app({ requireOwner: refuse, readCurrentProject: async () => ({ path: project() }) })).post('/api/agent-import/project').send({});
    expect(res.status).toBe(403);
    expect(res.body.agents).toBeUndefined();
  });
});
