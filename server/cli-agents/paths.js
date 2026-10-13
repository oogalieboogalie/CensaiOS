import os from 'os';
import path from 'path';
import { LOCAL_STATE_DIR } from '../routes/files/pathUtils.js';

/**
 * Where the Agent Console keeps what must survive a restart: installed
 * CLIs, task worktrees, and (in Docker) the CLIs' own home folder with
 * their logins and settings.
 *
 * On a laptop or desktop install that is ~/.censai, which already lasts.
 * Inside the Docker stack the container's home folder is thrown away every
 * time the app is rebuilt (the desktop shortcut rebuilds on each launch),
 * so an installed Claude Code vanished at the next login. There everything
 * lives under the app's state folder, which is a named volume
 * (docker-compose.yml: homebase_state:/app/.homebase-state).
 */

export function inContainer(env = process.env) {
  return Boolean(env.CENSAI_IN_CONTAINER || env.HOMEBASE_CONTAINER_PROJECT_ROOT);
}

/** Root for installs and worktrees. CENSAI_CLI_AGENT_DATA overrides it. */
export function cliDataRoot(env = process.env) {
  if (env.CENSAI_CLI_AGENT_DATA) return path.resolve(env.CENSAI_CLI_AGENT_DATA);
  return inContainer(env) ? path.join(LOCAL_STATE_DIR, 'cli-agents') : path.join(os.homedir(), '.censai');
}

/**
 * The home folder a CLI runs with. In Docker it is a private folder in the
 * state volume, so `claude` keeps its login and settings across rebuilds and
 * never sees the server's own home. Elsewhere the CLI uses the person's real
 * home, where their existing `claude login` already lives.
 */
export function agentHome(env = process.env) {
  if (env.CENSAI_CLI_AGENT_HOME) return path.resolve(env.CENSAI_CLI_AGENT_HOME);
  return inContainer(env) ? path.join(cliDataRoot(env), 'home') : null;
}
