// Deploy buttons for the Places to Host window (Alex's diagram 18, "hosting
// files go live"). Pure: the window and tests read it. Every link only opens
// that service's own page in the browser. Nothing deploys from censaiOS and
// no key is stored here; you sign in on their page and press their button.

/** "owner/repo" or a github.com address, as https://github.com/owner/repo, or ''. */
export function githubRepoUrl(text) {
  const raw = String(text || '').trim().replace(/\/+$/, '').replace(/\.git$/, '');
  const m = raw.match(/^(?:https?:\/\/(?:www\.)?github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/);
  if (!m || m[2] === '.' || m[2] === '..') return '';
  return `https://github.com/${m[1]}/${m[2]}`;
}

const DEPLOY_PAGES = {
  render: {
    label: 'Deploy on Render',
    needsRepo: true,
    href: (repo) => `https://render.com/deploy?repo=${encodeURIComponent(repo)}`,
    says: 'Opens render.com with your repo filled in. Render reads render.yaml and shows what it will make. Nothing goes live until you sign in there and click Apply.',
  },
  cloudrun: {
    label: 'Run on Google Cloud',
    needsRepo: true,
    href: (repo) => `https://deploy.cloud.run/?git_repo=${encodeURIComponent(repo)}`,
    says: 'Opens Google Cloud with your repo filled in. Google asks you to sign in, pick a project and confirm before it builds anything.',
  },
  railway: {
    label: 'Open Railway',
    needsRepo: false,
    href: () => 'https://railway.com/new/github',
    says: 'Opens Railway\'s "deploy from GitHub" page. Railway cannot take a repo address, so you pick your copy there. Nothing goes live until you choose it and confirm.',
  },
};

/** Whether a place has a deploy button at all. */
export const hasDeployButton = (targetId) => Object.hasOwn(DEPLOY_PAGES, targetId);

/**
 * The deploy button for one place: { href, label, says, prefilled }, or null
 * when the place has none or still needs a repo typed in.
 */
export function deployLink(targetId, repoText) {
  if (!hasDeployButton(targetId)) return null;
  const page = DEPLOY_PAGES[targetId];
  const repo = githubRepoUrl(repoText);
  if (page.needsRepo && !repo) return null;
  return { href: page.href(repo), label: page.label, says: page.says, prefilled: page.needsRepo };
}
