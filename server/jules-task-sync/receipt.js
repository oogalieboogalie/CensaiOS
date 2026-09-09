import { buildCompletionReceipt } from '../memory/tasks.js';

function cleanChangedFiles(changedFiles = [], max = 4) {
  const seen = new Set();
  const out = [];
  for (const file of changedFiles) {
    const clean = String(file || '').trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    out.push(`Path: ${clean}`);
    if (out.length >= max) break;
  }
  return out;
}

export function buildJulesCompletionReceipt(task, patch, session = {}, changedFiles = []) {
  const receipt = buildCompletionReceipt(task, patch);
  if (!receipt) return null;

  return {
    ...receipt,
    source: 'jules',
    landed: [
      session.pr_url ? `PR: ${session.pr_url}` : null,
      session.branch ? `Branch: ${session.branch}` : null,
      ...cleanChangedFiles(changedFiles),
      ...(receipt.landed || []),
    ].filter(Boolean),
    verify: [
      session.pr_url ? 'Open the PR and confirm the merged diff matches the requested work.' : null,
      ...(receipt.verify || []),
    ].filter(Boolean),
  };
}
