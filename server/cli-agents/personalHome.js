import fs from 'fs';
import path from 'path';
import { cliDataRoot } from './paths.js';

/**
 * A CLI whose sign-in lives in a folder we can point at (Grok: GROK_HOME)
 * gets one folder per censaiOS person. Each person signs in to their own
 * Grok account there, so a sign-in is never shared on a board by design:
 * nothing to claim (loginOwner.js), nothing to refuse.
 *
 * xAI's own guide asks for exactly this: "On multi-user hosts, keep $HOME /
 * $GROK_HOME private to your account." The folder sits in the CLI data root
 * (the state volume in Docker), so a sign-in survives the rebuild at launch.
 */

function safeId(userId) {
  return String(userId ?? 'anon').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'anon';
}

/** This person's private home for the CLI, or null when the CLI has none. */
export function personalHomeDir(adapter, userId, env = process.env) {
  if (!adapter?.personalHome) return null;
  return path.join(cliDataRoot(env), `${adapter.id}-homes`, safeId(userId));
}

/** Their own sign-in exists (the CLI's credential file in their folder). */
export function personalSignedIn(adapter, userId, env = process.env) {
  const dir = personalHomeDir(adapter, userId, env);
  if (!dir) return false;
  try { return fs.statSync(path.join(dir, adapter.personalHome.loginFile)).isFile(); } catch { return false; }
}

/** Extra environment for one run: the folder variable, created private. */
export function personalHomeEnv(adapter, userId, env = process.env) {
  const dir = personalHomeDir(adapter, userId, env);
  if (!dir) return {};
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return { [adapter.personalHome.env]: dir, ...(adapter.personalHome.extraEnv || {}) };
}
