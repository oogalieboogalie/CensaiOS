import pool from '../db.js';
import { createLogger } from '../logger.js';
import { loadConfig } from '../lib/reliability/engine.js';
import { scanProjectFolder } from '../lib/reliability/projectScan.js';
import { resolveRequestedProject } from './projects/shared.js';
import { resolveProjectPathForRuntime } from '../workspaces/shared.js';

const log = createLogger('reliability');

// POST /api/reliability/scans/project: the Reliability window's "Run a scan"
// button. Scores the open project's code files and saves one scan per file
// on the caller's board. Only scores are stored, never the code.
export function projectScanHandler(scopeFor, onError) {
  return async (req, res) => {
    let scope;
    try {
      scope = await scopeFor(req, { write: true, requireWorkspace: true });
    } catch (err) {
      return onError(res, err);
    }
    let project;
    try {
      project = await resolveRequestedProject(req.body?.projectPath);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
    if (!project?.path) {
      log.warn('scan: not started, no project is open');
      return res.status(400).json({ error: 'Open a project first, then run a scan.' });
    }
    const name = project.name || project.path;
    const started = Date.now();
    log.info(`scan: started on ${name}`);
    try {
      const config = await loadConfig();
      const { results, capped } = scanProjectFolder(resolveProjectPathForRuntime(project.path), config);
      const threshold = config.thresholds?.overall ?? 80;
      const scans = [];
      for (const r of results) {
        const { rows } = await pool.query(
          'INSERT INTO ai_reliability_scans (workspace_id, file_path, score, heuristics) VALUES ($1, $2, $3, $4) RETURNING *',
          [scope.workspaceId, r.filePath, r.score, JSON.stringify(r.heuristics)]
        );
        scans.push(rows[0]);
      }
      const findings = results.filter((r) => r.score < threshold).length;
      log.info(`scan: finished on ${name}, ${results.length} files, ${findings} need review${capped ? ' (stopped at the file limit)' : ''}, ${Date.now() - started} ms`);
      res.status(201).json({ project: name, scanned: results.length, findings, capped, scans });
    } catch (err) {
      log.warn(`scan: failed on ${name}: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  };
}
