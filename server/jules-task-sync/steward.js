import { evaluatePrFilesAgainstContract, formatPrStewardBlock } from '../operational-intelligence/prSteward.js';

export async function checkLinkedTodoPrContract(db, taskId, changedFiles = []) {
  if (!taskId || !Array.isArray(changedFiles) || changedFiles.length === 0) return null;
  const { rows } = await db.query(
    `SELECT id, data
       FROM artifacts
      WHERE artifact_type = 'task'
        AND deleted_at IS NULL
        AND data->>'handoffTaskId' = $1`,
    [taskId]
  );
  for (const row of rows) {
    const data = row.data || {};
    const result = evaluatePrFilesAgainstContract({
      changedFiles,
      contractFiles: data.contractFiles || [],
      forbiddenFiles: data.contractForbidden || [],
    });
    if (!result.ok) {
      return {
        ok: false,
        artifactId: row.id,
        result,
        message: formatPrStewardBlock(result),
      };
    }
  }
  return { ok: true };
}
