// Import agent, project side: read every Claude Code helper in the open
// project's .claude/agents folder with the same translator the browser uses
// for a dropped file (src/lib/agentImport). Nothing in the files runs.

import fs from 'fs';
import path from 'path';
import { parseAgentFile, AgentImportError, MAX_IMPORT_BYTES } from '../../src/lib/agentImport/index.js';

export const MAX_PROJECT_HELPERS = 50;
export const HELPERS_FOLDER = path.join('.claude', 'agents');

/**
 * @param {string} projectRoot  the project folder on this computer
 * @returns {Promise<{folder:string, agents:object[], skipped:{file:string, why:string}[], capped:boolean}>}
 */
export async function listProjectClaudeHelpers(projectRoot, { max = MAX_PROJECT_HELPERS } = {}) {
  const folder = path.join(projectRoot, HELPERS_FOLDER);
  let entries;
  try {
    entries = await fs.promises.readdir(folder, { withFileTypes: true });
  } catch (err) {
    if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') return { folder, agents: [], skipped: [], capped: false };
    throw err;
  }
  const files = entries
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const agents = [];
  const skipped = [];
  for (const file of files.slice(0, max)) {
    try {
      const stat = await fs.promises.stat(path.join(folder, file));
      if (stat.size > MAX_IMPORT_BYTES) { skipped.push({ file, why: 'too big to be a helper (over 512 KB)' }); continue; }
      const text = await fs.promises.readFile(path.join(folder, file), 'utf8');
      const parsed = parseAgentFile(text, { platform: 'claude', fileName: file });
      for (const agent of parsed.agents) agents.push({ ...agent, sourceFile: file });
    } catch (err) {
      if (!(err instanceof AgentImportError)) throw err;
      skipped.push({ file, why: err.message });
    }
  }
  return { folder, agents, skipped, capped: files.length > max };
}
