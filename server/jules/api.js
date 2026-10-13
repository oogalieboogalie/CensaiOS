import { fetchJules } from './shared.js';
import { findSourceForRepo } from './sources.js';

export async function createSession({ prompt, repo, branch, title, requirePlanApproval = false, autoCreatePR = true }) {
  const source = await findSourceForRepo(repo);
  if (!source) {
    throw new Error(
      `Jules has no connected source for ${repo}. Connect the repo at https://jules.google.com first (Settings → GitHub).`
    );
  }

  const body = {
    prompt,
    title: title || prompt.slice(0, 80),
    sourceContext: {
      source: source.name,
      githubRepoContext: { startingBranch: branch },
    },
  };
  if (requirePlanApproval) body.requirePlanApproval = true;
  if (autoCreatePR) body.automationMode = 'AUTO_CREATE_PR';

  return fetchJules('/sessions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getSession(sessionName) {
  const path = sessionName.startsWith('sessions/') ? sessionName : `sessions/${sessionName}`;
  return fetchJules(`/${path}`);
}

export async function listActivities(sessionName) {
  const path = sessionName.startsWith('sessions/') ? sessionName : `sessions/${sessionName}`;
  return fetchJules(`/${path}/activities`);
}
