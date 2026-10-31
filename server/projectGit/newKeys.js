import { createLogger } from '../logger.js';
import { gitError, projectStatus, runGit } from './git.js';
import { githubKeepsSettings, lookAtGithub, saveDone } from './githubKeeps.js';

// "Done, I made new keys" on the version bar's "GitHub already has" line
// (src/components/files/ProjectVersions.jsx): the person made new keys for
// the files the line names, so it puts those away. GitHub keeps its copies,
// so one that a version GitHub gets later adds or changes (it would hold the
// new keys too) comes back (./githubKeeps.js), as does any other such file
// GitHub gets. Only in the GitHub home censaiOS made, as the line itself.

const log = createLogger('project-git');

/** Puts away the files among `names` the line names now; answers the folder's status (projectStatus). */
export async function markNewKeys(cwd, names) {
  const top = String(await runGit(cwd, ['rev-parse', '--show-toplevel']).catch(() => '')).trim();
  if (!top) throw gitError('Versions are off for this folder.');
  const home = String(await runGit(top, ['config', '--get', 'censai.githubRepo']).catch(() => '')).trim();
  const remote = String(await runGit(top, ['remote', 'get-url', 'origin']).catch(() => '')).trim();
  if (!home || !remote) throw gitError("censaiOS didn't send this project to GitHub, so there is nothing to put away.", 409);
  const settings = await githubKeepsSettings(top, runGit);
  // Every read is waited for, so origin's branches now stand for when the files were put away.
  const look = await lookAtGithub(top, { ...settings, keepDone: null, wait: null });
  if (!look.settled) throw gitError("censaiOS couldn't read what GitHub's versions hold just now. Try again in a moment.", 503);
  const asked = new Set(Array.isArray(names) ? names : []);
  const put = look.names.filter((name) => asked.has(name));
  if (put.length) {
    await saveDone(runGit, top, { names: [...look.done, ...put], since: settings.tips.split(/\s+/) });
    log.info('files GitHub keeps put away: new keys made', { files: put.length });
  }
  return projectStatus(cwd);
}
