export const TODO_IMPLEMENTATION_FIELDS = [
  'priority',
  'handingOff',
  'handedOffAt',
  'handoffPath',
  'handoffArtifactId',
  'handoffTaskId',
  'handoffTaskStatus',
  'handoffWarning',
  'implementationStatus',
  'implementationTarget',
  'contractFiles',
  'contractAcceptance',
  'contractForbidden',
  'contractMissing',
  'idempotencyKey',
  'julesSession',
  'branch',
  'prNumber',
  'prUrl',
  'proof',
  'lastSyncedAt',
  'mergedAt',
  'pullRequired',
  'pulledAt',
];

export function itemData(item = {}) {
  const data = {
    localId: item.id ?? item.localId ?? null,
    text: String(item.text || item.title || 'Untitled task').trim(),
    done: Boolean(item.done),
    assignee: item.assignee || null,
  };
  for (const field of TODO_IMPLEMENTATION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(item, field)) data[field] = item[field];
  }
  return data;
}

export function rowToItem(row) {
  const data = row.data || {};
  return {
    ...data,
    id: row.id,
    artifactId: row.id,
    localId: data.localId || null,
    text: data.text || row.title || 'Untitled task',
    done: Boolean(data.done),
    assignee: data.assignee || null,
    updatedAt: row.updated_at,
  };
}

export function implementationPatchForTask({ taskStatus, result, error, session }) {
  const now = new Date().toISOString();
  const base = {
    lastSyncedAt: now,
    handoffTaskStatus: taskStatus || null,
  };
  const sessionPatch = {
    julesSession: session?.jules_session_name || session?.session || null,
    branch: session?.branch || null,
    prNumber: session?.pr_number || session?.prNumber || null,
    prUrl: session?.pr_url || session?.prUrl || null,
    mergedAt: session?.pr_merged_at || session?.mergedAt || null,
  };

  if (taskStatus === 'completed') {
    return {
      ...base,
      ...sessionPatch,
      done: true,
      implementationStatus: 'merged',
      proof: result || 'Linked agent task completed.',
      pullRequired: true,
    };
  }
  if (taskStatus === 'blocked') {
    return {
      ...base,
      ...sessionPatch,
      implementationStatus: 'blocked',
      proof: result || error || 'Linked agent task is blocked.',
    };
  }
  if (taskStatus === 'failed' || taskStatus === 'cancelled') {
    return {
      ...base,
      ...sessionPatch,
      implementationStatus: 'failed',
      proof: error || result || `Linked agent task ${taskStatus}.`,
    };
  }
  if (taskStatus === 'in_progress') {
    return {
      ...base,
      ...sessionPatch,
      implementationStatus: sessionPatch.prUrl ? 'pr_open' : 'dispatched',
    };
  }
  if (taskStatus === 'queued') {
    return {
      ...base,
      ...sessionPatch,
      implementationStatus: 'queued',
    };
  }
  return {
    ...base,
    ...sessionPatch,
  };
}
