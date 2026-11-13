// The merge rule. Pure: no network, no git, no token.
// action is merge, dry-run, confirm, refuse, or wait.
import { riskCategories } from './risk.js';

export function isHeldTitle(title) {
  return /\b(hold|wip)\b/i.test(String(title || ''));
}

function sha(value) {
  return String(value || '').trim().toLowerCase();
}

function result(action, reason, extra = {}) {
  return { action, reason, ...extra };
}

export function decideMerge(input = {}) {
  const number = Number(input.number);
  if (number === 300) return result('refuse', 'never-300');
  if (!Array.isArray(input.files)) return result('wait', 'no-files');

  const categories = riskCategories(input.files);
  if (categories.length) return result('confirm', 'risky', { categories });
  if (input.fork) return result('wait', 'fork');
  if (input.draft) return result('wait', 'draft');
  if (input.held) return result('wait', 'held');
  if (input.base !== 'master') return result('wait', 'base');

  const head = sha(input.headSha);
  if (!input.clear?.sha) return result('wait', 'no-clear');
  if (sha(input.clear.sha) !== head) return result('wait', 'head-moved');

  if (!input.ci) return result('wait', 'ci-missing');
  if (sha(input.ci.sha) !== head) return result('wait', 'ci-sha');
  if (input.ci.status && input.ci.status !== 'completed') return result('wait', 'ci-pending');
  if (input.ci.conclusion !== 'success') return result('wait', 'ci-red');
  if (input.mergeable !== true) return result('wait', 'not-mergeable');
  if (input.lock?.ok !== true) return result('wait', 'file-lock');
  if (input.dryRun !== false) return result('dry-run', 'dry-run');
  return result('merge', 'clear');
}
