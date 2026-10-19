// Import agent, project folder:
//   POST /api/agent-import/project → { folder, agents: [draft...], skipped, capped }
// Lists every Claude Code helper in the open project's .claude/agents folder
// so the Import panel can tick and import them. Computer owner only; mounted by
// agentImport.js behind requireLocalFilesystem.

import express from 'express';
import { createLogger } from '../logger.js';
import { requireSystemAdmin } from '../security/systemAdmin.js';
import { readCurrentProject } from './files/pathUtils.js';
import { resolveProjectPathForRuntime } from '../workspaces/shared.js';
import { listProjectClaudeHelpers } from '../agent-import/projectHelpers.js';

const log = createLogger('agent-import');

export function createAgentImportProjectRouter(deps = {}) {
  const router = express.Router();
  const requireOwner = deps.requireOwner || requireSystemAdmin;
  const readProject = deps.readCurrentProject || readCurrentProject;
  const toRuntime = deps.resolveProjectPath || resolveProjectPathForRuntime;
  const list = deps.listProjectClaudeHelpers || listProjectClaudeHelpers;

  router.post('/', requireOwner, async (req, res) => {
    const project = await readProject().catch(() => null);
    if (!project?.path) {
      log.warn('agent-import: project pull: no project open');
      return res.status(400).json({ error: 'Open a project first (Projects window), then pull its helpers.' });
    }
    const root = toRuntime(project.path);
    try {
      const found = await list(root);
      log.info(`agent-import: project pull: ${found.folder}: found ${found.agents.length}, skipped ${found.skipped.length}`);
      return res.json({ ...found, project: project.name || project.path });
    } catch (err) {
      log.error(`agent-import: project pull failed in ${root}: ${err.message}`);
      return res.status(500).json({ error: `Could not read the helpers folder: ${err.message}` });
    }
  });

  router.post('/imported', requireOwner, (req, res) => {
    const names = (Array.isArray(req.body?.names) ? req.body.names : []).map(String).slice(0, 50);
    log.info(`agent-import: project pull: imported ${names.length} (${names.join(', ')})`);
    return res.json({ ok: true });
  });

  return router;
}

export const agentImportProjectRouter = createAgentImportProjectRouter();
