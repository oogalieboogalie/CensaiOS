import express from 'express';
import { randomUUID } from 'crypto';
import pool from '../db.js';
import { recordCommandAudit } from '../commands/audit.js';
import { commandContextFromRequest } from '../commands/context.js';
import { executeCommand, listCommands } from '../commands/registry.js';
import {
  attachArtifactToRun,
  completeRun,
  createRun,
  failRun,
  startRun,
} from '../runs/lifecycle.js';

export const commandsRouter = express.Router();

commandsRouter.get('/commands', (_req, res) => {
  res.json({ commands: listCommands() });
});

commandsRouter.post('/commands/:commandId/execute', async (req, res) => {
  const commandId = req.params.commandId;
  const context = commandContextFromRequest(req);
  const input = req.body || {};
  let runId = null;

  try {
    const created = await createRun({
      db: pool,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actor: context.actor,
      principal: context.principal,
      runtimeMode: context.runtimeMode,
      metadata: {
        kind: 'command',
        commandId,
      },
      cause: {
        kind: 'user_dispatch',
        userDispatchRef: `command:${context.userId || context.actor?.id || 'anonymous'}:${commandId}:${randomUUID()}`,
        metadata: { commandId, actor: context.actor },
      },
    });
    runId = created.runId;
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      runId: null,
      commandId,
      code: error.code || 'RUN_CREATE_FAILED',
      error: error.message,
      auditEventId: null,
    });
  }

  try {
    await startRun({ db: pool, runId });
    const execution = await executeCommand(commandId, { context, input, request: req });
    const audit = await recordCommandAudit({
      db: pool,
      command: execution.command,
      context,
      input,
      output: execution.result,
      error: null,
    });
    if (audit?.id) {
      await attachArtifactToRun({
        db: pool,
        runId,
        kind: 'command.audit_event',
        ref: audit.id,
        metadata: { commandId, status: 'ok' },
      });
    }
    await completeRun({
      db: pool,
      runId,
      metadata: { commandId, auditEventId: audit?.id || null },
    });
    res.json({
      ok: true,
      runId,
      command: execution.command,
      context,
      result: execution.result,
      auditEventId: audit?.id || null,
    });
  } catch (error) {
    const command = listCommands().find(entry => entry.id === commandId) || {
      id: commandId,
      sideEffects: [],
      requiredCapabilities: [],
    };
    const audit = await recordCommandAudit({
      db: pool,
      command,
      context,
      input,
      output: null,
      error,
    });
    if (audit?.id) {
      await attachArtifactToRun({
        db: pool,
        runId,
        kind: 'command.audit_event',
        ref: audit.id,
        metadata: { commandId, status: 'error' },
      });
    }
    await failRun({ db: pool, runId, error });
    res.status(error.statusCode || 400).json({
      ok: false,
      runId,
      commandId,
      context,
      code: error.code || 'COMMAND_FAILED',
      error: error.message,
      auditEventId: audit?.id || null,
    });
  }
});
