import express from 'express';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { assertSystemAdmin } from '../security/systemAdmin.js';
import { requireLocalFilesystem } from '../middleware/runtimeMode.js';
import { MAX_CHECKS, checkLine, parseCheck } from '../../src/lib/stepCards/todoFile.js';
import { translateCard } from '../stepCards/translate.js';
import { verifyStep } from '../stepCards/verify.js';

const log = createLogger('step-cards');

// The person's own model key (from the key vault) does the translating and the read-over.
async function defaultCompleter(req) {
  const [{ resolveAgentRouteScope }, { callModel, createModelAccessContext, workspaceUsageSink }] = await Promise.all([
    import('./agents/scope.js'), import('../aiGateway/index.js'),
  ]);
  const scope = await resolveAgentRouteScope(req);
  const source = 'step-cards';
  const accessContext = createModelAccessContext({ userId: scope.userId, workspaceId: scope.workspaceId, source });
  return async (messages, { maxTokens = 2000, temperature = 0.2 } = {}) => {
    const data = await callModel({
      accessContext,
      body: { messages, max_tokens: maxTokens, temperature },
      timeoutMs: 90000,
      logContext: { source },
      usageAttribution: { workspaceId: scope.workspaceId, actor: { kind: 'user', id: scope.userId }, source },
      usageSink: workspaceUsageSink,
    });
    return data?.choices?.[0]?.message?.content || '';
  };
}

async function defaultFolders() {
  const [{ assertAllowedFolder }, { getCliTaskManager }] = await Promise.all([
    import('../cli-agents/folders.js'), import('../cli-agents/index.js'),
  ]);
  return { assertAllowedFolder, tasks: getCliTaskManager() };
}

const NO_FOLDER = 'Open the project this card is about first (project picker in the top bar), then check again.';

/**
 * Where a step's checks look: the coding agent's own worktree when the step went to
 * one (its changes live there until they are merged), otherwise the open project.
 * { cwd, report, noFolder }.
 */
export async function whereToCheck({ folder, cliTaskId, folders }) {
  const { assertAllowedFolder, tasks } = await folders();
  if (cliTaskId) {
    try {
      const task = tasks.get(cliTaskId);
      if (task?.worktree?.cwd && !task.worktreeRemoved) {
        const running = ['installing', 'starting', 'running', 'needs_approval'].includes(task.status);
        return { cwd: task.worktree.cwd, report: running ? '' : String(task.summary || ''), running, trustFrom: task.folder || null, worktree: true };
      }
    } catch { /* the task is gone: fall back to the project */ }
  }
  try {
    return { cwd: folder ? await assertAllowedFolder(folder) : null, report: '', noFolder: NO_FOLDER };
  } catch {
    return { cwd: null, report: '', noFolder: NO_FOLDER };
  }
}

/** Only checks this server understands, rebuilt from their own line, so nothing else rides along. */
export function cleanChecks(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_CHECKS).map((check) => {
    const clean = check && typeof check.id === 'string' ? parseCheck(checkLine(check)) : null;
    return clean ? { ...clean, id: check.id.slice(0, 80) } : null;
  }).filter(Boolean);
}

/**
 * The Step cards window (src/components/windows/stepCards/).
 *
 * POST /api/step-cards/translate  { text }  -> { cards, skipped, translated }
 * POST /api/step-cards/check      { folder, cliTaskId, report, automatic, step: { title, text }, checks } -> { results }
 */
export function createStepCardsRouter({ completer = defaultCompleter, folders = defaultFolders, isOwner = assertSystemAdmin, verify = verifyStep } = {}) {
  const router = express.Router();

  router.use((req, res, next) => (req.session?.userId ? next() : res.status(401).json({ error: 'Sign in first.' })));

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (!err.statusCode) log.error('request failed', { path: req.path, code: safeErrorCode(err) });
      res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Step cards hit a problem. It is in the app log.' });
    }
  };

  router.post('/translate', handle(async (req, res) => {
    const text = String(req.body?.text || '');
    const out = await translateCard(text, { complete: await completer(req) });
    const steps = out.cards.reduce((n, card) => n + card.steps.length, 0);
    log.info('card turned into steps', { userId: req.session.userId, cards: out.cards.length, steps, skipped: out.skipped, translated: out.translated });
    res.json(out);
  }));

  router.post('/check', requireLocalFilesystem, handle(async (req, res) => {
    const checks = cleanChecks(req.body?.checks);
    if (!checks.length) return res.status(400).json({ error: 'This step has no checks I understand.' });
    const where = await whereToCheck({ folder: req.body?.folder, cliTaskId: req.body?.cliTaskId, folders });
    const report = String(req.body?.report || '').trim() || where.report;
    const step = { title: String(req.body?.step?.title || ''), text: String(req.body?.step?.text || '') };
    let complete = null;
    // In an agent's worktree, commands run only with the project's own scripts, and only on a click.
    if (where.worktree && !where.trustFrom) Object.assign(where, { cwd: null, noFolder: NO_FOLDER });
    const ctx = {
      cwd: where.cwd,
      trustFrom: where.trustFrom,
      skipRuns: Boolean(req.body?.automatic),
      noFolder: where.noFolder,
      report,
      isOwner: async () => isOwner(req).then(() => true, () => false),
      complete: async (messages) => (complete ||= await completer(req))(messages, { maxTokens: 600 }),
    };
    const results = await verify({ step, checks, ctx });
    const green = results.filter((r) => r.ok === true).length;
    log.info('step checked', { userId: req.session.userId, checks: results.length, green, inWorktree: Boolean(req.body?.cliTaskId && where.cwd), helperStillWorking: Boolean(where.running) });
    res.json({ results, helperStillWorking: Boolean(where.running) });
  }));

  return router;
}

export const stepCardsRouter = createStepCardsRouter();
