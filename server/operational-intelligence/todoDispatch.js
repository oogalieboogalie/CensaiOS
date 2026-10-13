import crypto from 'crypto';
import { createProjectHandoffRecord } from '../routes/projects/handoffs.js';
import { createWorkspaceEvent, resolveArtifact } from './factories.js';
import { createHandoff, ensureAssigneeArtifact } from './handoffs.js';
import { findZoneReservationConflict, readCurrentQueueReservations } from './queueReservations.js';
import { ensureOperationalIntelligenceSchema } from './schema.js';
import { contractWarning, normalizeTodoContract } from './todoContract.js';
import { updateTodoItem } from './todos.js';

const defaultActor = { kind: 'system', id: 'todo-dispatch-guardian' };
const highRiskPattern = /\b(auth|secret|migration|database schema|docker|deploy|memory|journal|chat loop|server\/routes\/chat|package\.json|npm script|boot|ai gateway|payment|billing)\b/i;

function stableHash(parts) {
  return crypto.createHash('sha256').update(parts.filter(Boolean).join('\n')).digest('hex');
}

export function assessTodoDispatch(item = {}) {
  const text = String(item.text || '').trim();
  if (!text) return { ok: false, status: 'needs_contract', reason: 'Todo has no work text.' };
  if (item.done) return { ok: false, status: 'needs_contract', reason: 'Completed todos cannot be dispatched.' };
  if (!item.assignee) return { ok: false, status: 'needs_contract', reason: 'Assign the todo before dispatch.' };
  if (text.length < 12) {
    return { ok: false, status: 'needs_contract', reason: 'Todo is too short to dispatch safely.' };
  }
  if (highRiskPattern.test(text)) {
    return {
      ok: false,
      status: 'needs_contract',
      reason: 'High-risk todo needs a human-written contract before Jules/agent dispatch.',
    };
  }
  const contract = normalizeTodoContract(item);
  if (!contract.ready) {
    return {
      ok: false,
      status: 'needs_contract',
      reason: contractWarning(contract),
      contract,
    };
  }
  return { ok: true, status: 'queued', risk: 'low', contract };
}

async function loadTodo(db, { workspaceId, itemArtifactId }) {
  const { rows } = await db.query(
    `SELECT *
       FROM artifacts
      WHERE id = $1
        AND workspace_id = $2
        AND artifact_type = 'task'
        AND deleted_at IS NULL
      LIMIT 1`,
    [itemArtifactId, workspaceId]
  );
  return rows[0] || null;
}

async function patchTodo(db, input, patch) {
  return updateTodoItem(db, {
    workspaceId: input.workspaceId,
    listArtifactId: input.listArtifactId,
    itemArtifactId: input.itemArtifactId,
    actor: input.actor,
    patch,
  });
}

export async function dispatchTodoItem(db, input = {}) {
  await ensureOperationalIntelligenceSchema(db);
  const actor = input.actor || defaultActor;
  input = { ...input, actor };
  const todo = await loadTodo(db, input);
  if (!todo) throw new Error('Task artifact not found');
  const data = todo.data || {};
  const list = await resolveArtifact({ db }, {
    artifactId: input.listArtifactId,
    workspaceId: input.workspaceId,
  });
  if (!list || list.workspace_id !== input.workspaceId) {
    throw new Error('Cross-workspace references are not allowed');
  }
  const idempotencyKey = data.idempotencyKey || stableHash([
    input.workspaceId,
    input.listArtifactId,
    input.itemArtifactId,
    data.text,
    data.assignee,
  ]);

  if (data.handoffTaskId || data.handoffPath) {
    const implementationStatus = data.implementationStatus || (data.handoffTaskId ? 'queued' : 'dispatched');
    const result = await patchTodo(db, input, {
      handingOff: false,
      implementationStatus,
      idempotencyKey,
      lastSyncedAt: new Date().toISOString(),
    });
    return { ...result, dispatch: { status: 'reused', implementationStatus, idempotencyKey } };
  }

  const assessment = assessTodoDispatch(data);
  if (!assessment.ok) {
    const result = await patchTodo(db, input, {
      handingOff: false,
      implementationStatus: assessment.status,
      handoffWarning: assessment.reason,
      contractMissing: assessment.contract?.missing || null,
      idempotencyKey,
      lastSyncedAt: new Date().toISOString(),
    });
    await createWorkspaceEvent({ db }, {
      workspaceId: input.workspaceId,
      type: 'todo.implementation.needs_contract',
      actor,
      artifactId: todo.id,
      payload: { reason: assessment.reason, idempotencyKey },
    });
    return { ...result, dispatch: { ...assessment, idempotencyKey } };
  }

  const reservations = input.queueReservations || await readCurrentQueueReservations();
  const conflict = findZoneReservationConflict(assessment.contract.files, reservations);
  if (conflict) {
    const reason = `Waiting for in-flight work on ${conflict.overlap}${conflict.brief ? ` (${conflict.brief})` : ''}.`;
    const result = await patchTodo(db, input, {
      handingOff: false,
      implementationStatus: 'queued',
      handoffWarning: reason,
      contractFiles: assessment.contract.files,
      contractAcceptance: assessment.contract.acceptance,
      contractForbidden: assessment.contract.forbidden,
      idempotencyKey,
      lastSyncedAt: new Date().toISOString(),
    });
    await createWorkspaceEvent({ db }, {
      workspaceId: input.workspaceId,
      type: 'todo.implementation.queued',
      actor,
      artifactId: todo.id,
      payload: { reason, idempotencyKey, conflict },
    });
    return { ...result, dispatch: { ok: false, status: 'queued', reason, idempotencyKey, conflict } };
  }

  const handoff = await createProjectHandoffRecord({
    title: data.text,
    text: data.text,
    assignee: data.assignee,
    sourceTitle: list?.title || input.sourceTitle || 'Project To-Dos',
    priority: data.priority || input.priority || 'normal',
    sourceId: `operational-todo:${input.workspaceId}:${todo.id}`,
    contractLines: [
      'Dispatched by the operational todo guardian.',
      `Risk: ${assessment.risk}`,
      `Files: ${assessment.contract.files.join(', ')}`,
      assessment.contract.forbidden.length ? `Forbidden: ${assessment.contract.forbidden.join(', ')}` : null,
      `Acceptance: ${assessment.contract.acceptance.join('; ')}`,
      assessment.contract.proof.length ? `Proof: ${assessment.contract.proof.join('; ')}` : null,
      'Open a PR only. Do not merge.',
      'Do not touch files outside the requested scope.',
      'Proof requires green repo gate and a completion receipt.',
    ].filter(Boolean),
    workspaceId: input.workspaceId,
    userId: Number(actor.id),
  });
  const assigneeArtifact = await ensureAssigneeArtifact({ db }, {
    workspaceId: input.workspaceId,
    agentId: data.assignee,
    owner: actor,
    title: data.assignee,
    correlationId: idempotencyKey,
  });
  const artifactHandoff = await createHandoff({ db }, {
    workspaceId: input.workspaceId,
    owner: actor,
    title: data.text,
    description: data.text,
    assigneeArtifactId: assigneeArtifact.id,
    sourceArtifactId: todo.id,
    acceptance: assessment.contract.acceptance,
    outputs: assessment.contract.proof,
    priority: data.priority || input.priority || 'normal',
    metadata: {
      handoffPath: handoff.relativePath || handoff.path,
      handoffTaskId: handoff.task?.id || null,
      contractFiles: assessment.contract.files,
      contractForbidden: assessment.contract.forbidden,
    },
    correlationId: idempotencyKey,
  });

  const patch = {
    handingOff: false,
    handoffPath: handoff.relativePath || handoff.path,
    handoffArtifactId: artifactHandoff.handoff.id,
    handoffTaskId: handoff.task?.id || null,
    handoffWarning: handoff.taskSkipped || null,
    implementationStatus: handoff.task?.id ? 'queued' : handoff.taskSkipped ? 'blocked' : 'dispatched',
    implementationTarget: data.assignee,
    contractFiles: assessment.contract.files,
    contractAcceptance: assessment.contract.acceptance,
    contractForbidden: assessment.contract.forbidden,
    idempotencyKey,
    lastSyncedAt: new Date().toISOString(),
  };
  const result = await patchTodo(db, input, patch);
  await createWorkspaceEvent({ db }, {
    workspaceId: input.workspaceId,
    type: `todo.implementation.${patch.implementationStatus}`,
    actor,
    artifactId: todo.id,
    payload: {
      handoffPath: patch.handoffPath,
      handoffArtifactId: patch.handoffArtifactId,
      handoffTaskId: patch.handoffTaskId,
      idempotencyKey,
    },
  });
  return {
    ...result,
    dispatch: { status: patch.implementationStatus, idempotencyKey, handoff, artifactHandoff },
  };
}
