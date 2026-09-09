import { Octokit } from '@octokit/rest';
import { getSecret } from '../../secrets.js';

const REPOSITORY_PART = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/;

function inputError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export function parseRepository(value) {
  if (typeof value !== 'string') throw inputError('Repository must use owner/name format.');
  const parts = value.trim().split('/');
  if (parts.length !== 2 || !parts.every((part) => REPOSITORY_PART.test(part))) {
    throw inputError('Repository must use owner/name format.');
  }
  return { owner: parts[0], repo: parts[1] };
}

export function parsePositiveInteger(value, field = 'number') {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw inputError(`${field} must be a positive integer.`);
  }
  return number;
}

export function parseIssueState(value, fallback = 'all') {
  const state = value || fallback;
  if (!['open', 'closed', 'all'].includes(state)) throw inputError('Invalid issue state.');
  return state;
}

export function parsePullState(value, fallback = 'open') {
  const state = value || fallback;
  if (!['open', 'closed', 'all'].includes(state)) throw inputError('Invalid pull request state.');
  return state;
}

export function getGitHubClient() {
  const token = getSecret('GITHUB_TOKEN');
  if (!token) {
    const err = new Error('GITHUB_TOKEN not found in .env');
    err.status = 401;
    throw err;
  }
  return new Octokit({ auth: token, userAgent: 'Censai-App' });
}

export function sendGitHubError(res, err) {
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599
    ? err.status
    : 500;
  const message = err?.response?.data?.message || err?.message || 'GitHub request failed.';
  return res.status(status).json({ error: message });
}
